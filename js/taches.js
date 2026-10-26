// Tâches de l'emploi du temps (fiche salarié) : ajout d'une tâche pour un ou plusieurs salariés,
// import en masse et modèle Excel à remplir.
// Le fichier (Excel ou CSV) est lu dans le navigateur ; chaque niveau d'emplacement est cherché dans son chantier
// (les noms « Base vie 1 », « RDC »… se répètent d'un chantier à l'autre), puis un aperçu signale les erreurs ligne par ligne.
import { h, ouvrirPanneau, etiqueterLignes, choixEtiquettes } from './outils.js'
import { importerTaches, modifierTache, nomContact, ROLE_SALARIE } from './donnees.js'

// Secondes Grist → valeur d'un champ « datetime-local » (AAAA-MM-JJTHH:MM, heure locale)
const versSaisie = (v) => {
  if (!v) return ''
  const dt = new Date(v * 1000)
  const z = (n) => String(n).padStart(2, '0')
  return `${dt.getFullYear()}-${z(dt.getMonth() + 1)}-${z(dt.getDate())}T${z(dt.getHours())}:${z(dt.getMinutes())}`
}

/**
 * Fiche d'une tâche : ajout (`tache` absente) ou modification. À l'ajout, la même tâche est créée pour chaque salarié choisi
 * (le salarié de la fiche au départ) ; en modification, le premier salarié garde la tâche et les autres en reçoivent une copie.
 * Emplacement en listes enchaînées : chaque liste ne propose que ce qui est dans le niveau choisi au-dessus, et choisir
 * un niveau bas (vestiaire, pièce) remplit tout seul ceux au-dessus. `apres(taches)` : après l'enregistrement.
 */
export function ouvrirAjoutTache(d, salarie, apres, tache = null) {
  // Compte sans prénom ni nom : nom du candidat lié, sinon email
  const nomU = (u) => {
    const c = d.Candidats?.find((x) => x.Utilisateur === u.id)
    return nomContact(u) || (c && nomContact(c)) || u.Email || 'Sans nom'
  }
  const choixSalaries = choixEtiquettes({
    elements: () => d.Utilisateurs.filter((u) => u.Profil === ROLE_SALARIE && (u.Actif || u.id === salarie.id)).map((u) => ({ id: u.id, libelle: nomU(u) })),
    choisis: [tache?.Salarie || salarie.id],
    textes: { aucun: 'Aucun salarié choisi.', choisir: 'Ajouter un salarié…', tous: 'Tous les salariés sont ajoutés', vide: 'Aucun salarié actif' },
  })
  const champs = { debut: versSaisie(tache?.Date_debut), fin: versSaisie(tache?.Date_fin), Titre: tache?.Titre ?? '', Action: tache?.Action ?? '', Detail: tache?.Detail ?? '' }
  const lieu = { Chantier: 0, Zone: 0, Base_vie: 0, Etage: 0, Piece: 0, Vestiaire: 0 }
  if (tache) for (const col of Object.keys(lieu)) lieu[col] = Number(tache[col]) || 0
  const listes = {} // select de chaque niveau

  // [colonne, table, libellé, condition par rapport aux niveaux choisis au-dessus]
  const NIVEAUX_LIEU = [
    ['Chantier', 'Chantiers', 'Chantier', () => true],
    ['Zone', 'Zones', 'Zone', (r) => r.Chantier === lieu.Chantier],
    ['Base_vie', 'Bases_vie', 'Base vie', (r) => r.Chantier === lieu.Chantier && (!lieu.Zone || r.Zone === lieu.Zone)],
    ['Etage', 'Etages', 'Étage', (r) => r.Chantier === lieu.Chantier && (!lieu.Base_vie || r.Base_vie === lieu.Base_vie)],
    ['Piece', 'Pieces', 'Pièce', (r) => r.Chantier === lieu.Chantier && (!lieu.Etage || r.Etage === lieu.Etage) && (!lieu.Base_vie || r.Base_vie === lieu.Base_vie)],
    ['Vestiaire', 'Vestiaires', 'Vestiaire', (r) => r.Chantier === lieu.Chantier && (!lieu.Etage || r.Etage === lieu.Etage) && (!lieu.Base_vie || r.Base_vie === lieu.Base_vie)],
  ]
  // Libellé d'une option : le nom, avec le niveau au-dessus quand le nom se répète (« RDC · Base vie 2 »)
  const libelleLieu = (r, lignes) => {
    if (lignes.filter((x) => x.Nom === r.Nom).length < 2) return r.Nom || 'Sans nom'
    const parent = r.Etage ? d.parId.Etages.get(r.Etage)?.Nom : r.Base_vie ? d.parId.Bases_vie.get(r.Base_vie)?.Nom : r.Zone ? d.parId.Zones.get(r.Zone)?.Nom : ''
    return [r.Nom, parent].filter(Boolean).join(' · ')
  }
  const dessinerListes = () => {
    for (const [col, table, , condition] of NIVEAUX_LIEU) {
      const lignes = col !== 'Chantier' && !lieu.Chantier ? [] : (d[table] ?? []).filter(condition)
        .sort((a, b) => String(a.Nom).localeCompare(String(b.Nom), 'fr', { numeric: true }))
      if (lieu[col] && !lignes.some((r) => r.id === lieu[col])) lieu[col] = 0 // n'est plus dans le niveau au-dessus
      listes[col].replaceChildren(h('option', { value: '0', selected: !lieu[col] }, col === 'Chantier' ? '— Aucun —' : '— Tous / aucun —'),
        ...lignes.map((r) => h('option', { value: String(r.id), selected: r.id === lieu[col] }, libelleLieu(r, lignes))))
      listes[col].disabled = col !== 'Chantier' && !lieu.Chantier
    }
  }
  const choisir = (col, table, id) => {
    lieu[col] = id
    const r = id && d.parId[table].get(id)
    // Un niveau bas choisi remplit ceux au-dessus ; un niveau haut changé vide ceux en dessous qui n'en font plus partie
    if (r) {
      if (r.Etage) lieu.Etage = r.Etage
      if (r.Base_vie) lieu.Base_vie = r.Base_vie
      if (lieu.Base_vie) lieu.Zone = d.parId.Bases_vie.get(lieu.Base_vie)?.Zone || lieu.Zone
    }
    dessinerListes()
  }
  for (const [col, table] of NIVEAUX_LIEU) {
    listes[col] = h('select', { className: 'champ', onChange: (e) => choisir(col, table, Number(e.target.value) || 0) })
  }
  dessinerListes()

  const erreur = h('p', { className: 'erreur', hidden: true })
  const libelleValider = tache ? 'Enregistrer' : 'Ajouter la tâche'
  const valider = h('button', { className: 'bouton bouton-principal', type: 'submit' }, libelleValider)
  const texte = (libelle, col, attributs = {}) => h('label', { className: 'champ-groupe' }, libelle,
    h('input', { className: 'champ', autocomplete: 'off', value: champs[col], ...attributs, onInput: (e) => { champs[col] = e.target.value } }))
  const formulaire = h('form', { className: 'formulaire', onSubmit: async (e) => {
    e.preventDefault()
    erreur.hidden = true
    const ids = choixSalaries.ids()
    const debut = champs.debut ? new Date(champs.debut) : null
    const fin = champs.fin ? new Date(champs.fin) : null
    const probleme = ids.length === 0 ? 'Choisis au moins un salarié.'
      : !debut ? 'La date de début est obligatoire.'
        : !champs.Titre.trim() ? 'Le titre de la tâche est obligatoire.'
          : fin && fin < debut ? 'La date de fin est avant la date de début.' : null
    if (probleme) {
      erreur.textContent = probleme
      erreur.hidden = false
      return
    }
    valider.disabled = true
    valider.textContent = 'Enregistrement…'
    // Une ligne par salarié, en un seul envoi
    const taches = ids.map((id) => ({
      Salarie: id, Date_debut: debut.getTime() / 1000, Date_fin: fin ? fin.getTime() / 1000 : null, ...lieu,
      Titre: champs.Titre.trim(), Action: champs.Action.trim(), Detail: champs.Detail.trim(),
    }))
    try {
      if (tache) await modifierTache(tache.id, taches[0], taches.slice(1))
      else await importerTaches(taches)
    } catch (err) {
      erreur.textContent = err.message || 'L’enregistrement a échoué.'
      erreur.hidden = false
      valider.disabled = false
      valider.textContent = libelleValider
      return
    }
    fermer()
    await apres(taches).catch((err) => alert(`La tâche est enregistrée, mais l’affichage n’a pas pu être mis à jour : ${err.message}`))
  } },
  h('div', { className: 'champ-groupe' }, tache ? 'Salariés (le premier garde la tâche, les autres en reçoivent une copie)' : 'Salariés (la tâche est créée pour chacun)', choixSalaries.element),
  h('div', { className: 'grille-2' },
    texte('Date et heure de début *', 'debut', { type: 'datetime-local', required: true }),
    texte('Date et heure de fin', 'fin', { type: 'datetime-local' })),
  texte('Titre de tâche *', 'Titre', { required: true }),
  texte('Action', 'Action'),
  h('label', { className: 'champ-groupe' }, 'Détail',
    h('textarea', { className: 'champ champ-texte', value: champs.Detail, onInput: (e) => { champs.Detail = e.target.value } })),
  h('fieldset', { className: 'bloc-lieu' }, h('legend', null, 'Emplacement (facultatif)'),
    h('div', { className: 'grille-2' }, NIVEAUX_LIEU.map(([col, , libelle]) => h('label', { className: 'champ-groupe' }, libelle, listes[col])))),
  erreur, valider)

  const { fermer, section } = ouvrirPanneau(tache ? 'Modifier la tâche' : 'Ajouter une tâche', formulaire)
  section.classList.add('panneau-large')
}

// Lecteur Excel (SheetJS), chargé seulement quand on importe ou télécharge le modèle
const URL_XLSX = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'
let chargementXlsx = null
function chargerXlsx() {
  if (window.XLSX) return Promise.resolve(window.XLSX)
  chargementXlsx ??= new Promise((ok, ko) => {
    const script = h('script', { src: URL_XLSX })
    script.onload = () => ok(window.XLSX)
    script.onerror = () => { chargementXlsx = null; ko(new Error('Le lecteur de fichiers Excel n’a pas pu être chargé (connexion ?).')) }
    document.head.append(script)
  })
  return chargementXlsx
}

// Colonnes du fichier : [colonne Grist, titre dans le modèle, autres titres acceptés]
const COLONNES_IMPORT = [
  ['Date_debut', 'Date début', ['debut']],
  ['Date_fin', 'Date fin', ['fin']],
  ['Salarie', 'Salarié (email)', ['salarie', 'email']],
  ['Chantier', 'Chantier', []],
  ['Zone', 'Zone', []],
  ['Base_vie', 'Base vie', []],
  ['Etage', 'Étage', []],
  ['Piece', 'Pièce', []],
  ['Vestiaire', 'Vestiaire', []],
  ['Titre', 'Titre de tâche', ['titre', 'tache']],
  ['Action', 'Action', []],
  ['Detail', 'Détail', []],
]
// Niveaux d'emplacement sous le chantier, du plus haut au plus bas : [colonne, table, libellé]
const NIVEAUX = [['Zone', 'Zones', 'Zone'], ['Base_vie', 'Bases_vie', 'Base vie'], ['Etage', 'Etages', 'Étage'], ['Piece', 'Pieces', 'Pièce'], ['Vestiaire', 'Vestiaires', 'Vestiaire']]
// Sans accents, en minuscules, ponctuation réduite à des espaces : « Base-vie » = « base vie »
const normaliser = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9@.+]+/g, ' ').trim()

// Date et heure d'une cellule : nombre Excel, ou texte « JJ/MM/AAAA HH:MM » ou « AAAA-MM-JJ HH:MM » → Date locale
function lireDate(v) {
  if (v === '' || v == null) return null
  if (typeof v === 'number') {
    const jour = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000)
    const minutes = Math.round((v - Math.floor(v)) * 1440)
    return new Date(jour.getUTCFullYear(), jour.getUTCMonth(), jour.getUTCDate(), Math.floor(minutes / 60), minutes % 60)
  }
  const t = String(v).trim()
  let m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:[ T]+(\d{1,2})[:hH](\d{2}))?/)
  if (m) return valide(new Date(+m[3], +m[2] - 1, +m[1], +(m[4] ?? 0), +(m[5] ?? 0)), +m[1], +m[2])
  m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T]+(\d{1,2}):(\d{2}))?/)
  if (m) return valide(new Date(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0)), +m[3], +m[2])
  return undefined // texte non reconnu
}
// 31/02 devient le 3 mars en JavaScript : on refuse
const valide = (dt, jour, mois) => (dt.getDate() === jour && dt.getMonth() === mois - 1 ? dt : undefined)
// Mois en toutes lettres : une date inversée par Excel (05/11 compris comme le 11 mai) se voit tout de suite dans l'aperçu
const texteDate = (dt) => dt.toLocaleString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })

// Lignes du premier onglet (« Tâches » s'il existe) : la ligne de titres est la première qui contient « Date début »
async function lireFichier(fichier) {
  const XLSX = await chargerXlsx()
  const classeur = XLSX.read(await fichier.arrayBuffer(), { type: 'array', raw: true }) // raw : les dates en texte du CSV restent du texte
  const feuille = classeur.Sheets[classeur.SheetNames.find((n) => normaliser(n) === 'taches') ?? classeur.SheetNames[0]]
  const lignes = XLSX.utils.sheet_to_json(feuille, { header: 1, raw: true, defval: '' })
  const iTitres = lignes.findIndex((l) => l.some((c) => normaliser(c) === 'date debut'))
  if (iTitres < 0) throw new Error('Colonne « Date début » introuvable : utilise le modèle.')
  const titres = lignes[iTitres].map(normaliser)
  const position = Object.fromEntries(COLONNES_IMPORT.map(([col, titre, autres]) =>
    [col, titres.findIndex((t) => t === normaliser(titre) || autres.includes(t))]))
  return lignes.slice(iTitres + 1)
    .map((cellules, i) => ({ numero: iTitres + i + 2, ...Object.fromEntries(COLONNES_IMPORT.map(([col]) => [col, position[col] >= 0 ? cellules[position[col]] : ''])) }))
    .filter((l) => COLONNES_IMPORT.some(([col]) => String(l[col] ?? '').trim() !== '')) // lignes vides ignorées
}

/**
 * Ligne du fichier → tâche Grist, ou liste d'erreurs. Chaque niveau est cherché par son nom parmi ceux du chantier
 * (et du niveau au-dessus s'il est donné) ; un niveau trouvé complète ceux au-dessus (un vestiaire donne son étage, sa base vie, sa zone).
 */
function analyserLigne(d, l, salarieParDefaut) {
  const erreurs = []
  const texte = (col) => String(l[col] ?? '').trim()
  const debut = lireDate(l.Date_debut)
  const fin = lireDate(l.Date_fin)
  if (!debut) erreurs.push(debut === undefined ? `Date début illisible (« ${texte('Date_debut')} »)` : 'Date début manquante')
  if (fin === undefined) erreurs.push(`Date fin illisible (« ${texte('Date_fin')} »)`)
  if (debut && fin && fin < debut) erreurs.push('Date fin avant la date début')
  if (!texte('Titre')) erreurs.push('Titre de tâche manquant')

  let salarie = salarieParDefaut
  if (texte('Salarie')) {
    salarie = d.Utilisateurs.find((u) => normaliser(u.Email) === normaliser(texte('Salarie')))
    if (!salarie) erreurs.push(`Salarié « ${texte('Salarie')} » introuvable (email du compte)`)
    else if (salarie.Profil !== ROLE_SALARIE) erreurs.push(`« ${texte('Salarie')} » n’a pas le rôle Salarié`)
  }

  // Emplacement
  const lieu = { Chantier: 0, Zone: 0, Base_vie: 0, Etage: 0, Piece: 0, Vestiaire: 0 }
  if (!texte('Chantier') && NIVEAUX.some(([n]) => texte(n))) erreurs.push('Chantier manquant : il faut le chantier pour retrouver l’emplacement')
  else if (texte('Chantier')) {
    const nomsEgaux = (r, col) => normaliser(r.Nom) === normaliser(texte(col))
    const chantiers = d.Chantiers.filter((c) => nomsEgaux(c, 'Chantier'))
    if (chantiers.length !== 1) erreurs.push(chantiers.length ? `Chantier « ${texte('Chantier')} » en double` : `Chantier « ${texte('Chantier')} » introuvable`)
    else {
      lieu.Chantier = chantiers[0].id
      const nomChantier = chantiers[0].Nom
      // Ancêtres d'une ligne (zone, base vie, étage) pour vérifier que les niveaux donnés vont ensemble
      const ancetres = (r) => {
        const base = r.Base_vie ? d.parId.Bases_vie.get(r.Base_vie) : null
        return { Zone: r.Zone ?? base?.Zone ?? 0, Base_vie: r.Base_vie ?? 0, Etage: r.Etage ?? 0 }
      }
      // Candidats de chaque niveau rempli : même nom, même chantier
      const candidats = Object.fromEntries(NIVEAUX.filter(([n]) => texte(n)).map(([n, table]) =>
        [n, (d[table] ?? []).filter((r) => r.Chantier === lieu.Chantier && nomsEgaux(r, n))]))
      const introuvables = new Set(Object.keys(candidats).filter((n) => candidats[n].length === 0))
      // Les niveaux se départagent entre eux (le vestiaire « V-1 » désigne le bon « RDC ») : on garde les combinaisons cohérentes
      for (let passe = 0; passe < 2; passe++) {
        for (const [haut] of NIVEAUX) for (const [bas] of NIVEAUX) {
          if (haut === bas || !candidats[haut] || !candidats[bas] || !['Zone', 'Base_vie', 'Etage'].includes(haut)) continue
          if (NIVEAUX.findIndex(([n]) => n === haut) >= NIVEAUX.findIndex(([n]) => n === bas)) continue
          const ids = new Set(candidats[haut].map((r) => r.id))
          candidats[bas] = candidats[bas].filter((r) => ids.has(ancetres(r)[haut]))
          candidats[haut] = candidats[haut].filter((h) => candidats[bas].some((r) => ancetres(r)[haut] === h.id))
        }
      }
      for (const [n, , libelle] of NIVEAUX) {
        if (!candidats[n]) continue
        if (introuvables.has(n)) erreurs.push(`${libelle} « ${texte(n)} » introuvable dans ${nomChantier}`)
        else if (candidats[n].length === 0) erreurs.push(`${libelle} « ${texte(n)} » ne correspond pas aux autres niveaux de la ligne`)
        else if (candidats[n].length > 1) erreurs.push(`${libelle} « ${texte(n)} » existe plusieurs fois dans ${nomChantier} : précise le niveau au-dessus`)
        else lieu[n] = candidats[n][0].id
      }
      // Niveaux au-dessus complétés à partir du plus bas trouvé (un vestiaire donne son étage, sa base vie, sa zone)
      if (erreurs.length === 0) {
        const plusBas = [...NIVEAUX].reverse().map(([n, table]) => lieu[n] && d.parId[table].get(lieu[n])).find(Boolean)
        if (plusBas) for (const [n, valeur] of Object.entries(ancetres(plusBas))) if (!lieu[n]) lieu[n] = valeur || 0
      }
    }
  }
  if (erreurs.length > 0) return { erreurs }
  return { tache: {
    Salarie: salarie.id, Date_debut: debut.getTime() / 1000, Date_fin: fin ? fin.getTime() / 1000 : null, ...lieu,
    Titre: texte('Titre'), Action: texte('Action'), Detail: texte('Detail'),
  }, salarie, debut, fin }
}

/**
 * Fenêtre d'import pour le salarié `salarie` (une colonne « Salarié (email) » remplie affecte la ligne à un autre salarié) :
 * choix du fichier, aperçu (ligne par ligne : prête ou erreurs), puis import des lignes prêtes. `apres(taches)` : après l'import.
 */
export function ouvrirImportTaches(d, salarie, apres) {
  const zone = h('div', { className: 'formulaire' })
  const lieuLisible = (t) => [['Chantiers', t.Chantier], ['Zones', t.Zone], ['Bases_vie', t.Base_vie], ['Etages', t.Etage], ['Pieces', t.Piece], ['Vestiaires', t.Vestiaire]]
    .map(([table, id]) => id && d.parId[table]?.get(id)?.Nom).filter(Boolean).join(' › ')

  const choix = () => zone.replaceChildren(
    h('p', null, `Importe un fichier Excel (.xlsx) ou CSV au format du modèle. Les tâches sans colonne « Salarié (email) » sont affectées à ${nomContact(salarie) || salarie.Email}.`),
    h('label', { className: 'zone-fichier' },
      h('span', { className: 'bouton bouton-compact' }, 'Choisir le fichier'),
      h('span', { className: 'sous-texte' }, 'Excel (.xlsx) ou CSV'),
      h('input', { type: 'file', hidden: true, accept: '.xlsx,.xls,.csv', onChange: (e) => e.target.files?.[0] && apercu(e.target.files[0]) })),
    h('button', { className: 'bouton', type: 'button', onClick: () => telechargerModeleTaches(d).catch((err) => alert(err.message)) }, 'Télécharger le modèle Excel'))

  async function apercu(fichier) {
    zone.replaceChildren(h('p', { className: 'attente' }, `Lecture de ${fichier.name}…`))
    let lignes
    try {
      lignes = await lireFichier(fichier)
    } catch (err) {
      zone.replaceChildren(h('p', { className: 'erreur' }, err.message || 'Le fichier n’a pas pu être lu.'),
        h('button', { className: 'bouton', type: 'button', onClick: choix }, 'Choisir un autre fichier'))
      return
    }
    const resultats = lignes.map((l) => ({ numero: l.numero, ...analyserLigne(d, l, salarie) }))
    const pretes = resultats.filter((r) => r.tache)
    const titres = ['Ligne', 'Salarié', 'Début', 'Fin', 'Emplacement', 'Titre de tâche', 'Statut']
    const corps = h('tbody', null, resultats.length === 0
      ? h('tr', null, h('td', { className: 'tableau-vide', colSpan: titres.length }, 'Aucune tâche dans le fichier.'))
      : resultats.map((r) => h('tr', { className: r.tache ? '' : 'ligne-erreur' },
        h('td', null, r.numero),
        h('td', null, r.salarie ? nomContact(r.salarie) || r.salarie.Email : '—'),
        h('td', null, r.debut ? texteDate(r.debut) : '—'),
        h('td', null, r.fin ? texteDate(r.fin) : '—'),
        h('td', null, r.tache ? lieuLisible(r.tache) || '—' : '—'),
        h('td', null, r.tache?.Titre || '—'),
        h('td', null, r.tache ? h('span', { className: 'badge badge-resolu' }, 'Prête') : h('span', { className: 'erreur-import' }, r.erreurs.join(' · '))))))
    etiqueterLignes(corps, titres)
    const erreur = h('p', { className: 'erreur', hidden: true })
    const importer = h('button', { className: 'bouton bouton-principal', type: 'button', disabled: pretes.length === 0, onClick: async () => {
      importer.disabled = true
      importer.textContent = 'Import en cours…'
      const taches = pretes.map((r) => r.tache)
      try {
        await importerTaches(taches)
      } catch (err) {
        erreur.textContent = err.message || 'L’import a échoué.'
        erreur.hidden = false
        importer.disabled = false
        importer.textContent = `Importer ${pretes.length} tâche${pretes.length > 1 ? 's' : ''}`
        return
      }
      fermer()
      await apres(taches).catch((err) => alert(`Les tâches sont importées, mais l’affichage n’a pas pu être mis à jour : ${err.message}`))
    } }, pretes.length ? `Importer ${pretes.length} tâche${pretes.length > 1 ? 's' : ''}` : 'Aucune tâche à importer')
    zone.replaceChildren(
      h('p', { className: 'sous-texte' }, 'Vérifie les dates (mois en toutes lettres) : Excel inverse parfois le jour et le mois.'),
      h('p', null, h('strong', null, `${resultats.length} ligne${resultats.length > 1 ? 's' : ''} : `),
        `${pretes.length} prête${pretes.length > 1 ? 's' : ''}`,
        resultats.length > pretes.length ? `, ${resultats.length - pretes.length} en erreur (elles ne seront pas importées ; corrige le fichier et recommence pour les ajouter)` : ''),
      h('div', { className: 'tableau-defilant' }, h('table', { className: 'tableau' }, h('thead', null, h('tr', null, titres.map((t) => h('th', null, t)))), corps)),
      erreur,
      h('div', { className: 'fiche-actions' }, importer, h('button', { className: 'bouton', type: 'button', onClick: choix }, 'Choisir un autre fichier')))
  }

  choix()
  const { fermer, section } = ouvrirPanneau('Importer des tâches', zone)
  section.classList.add('panneau-large')
}

/**
 * Modèle Excel : onglet « Tâches » (titres seuls, dates au format Texte), « Exemple » (jamais importé),
 * « Emplacements » (noms exacts à recopier, par chantier), « Salariés » (emails) et « Aide ».
 */
export async function telechargerModeleTaches(d) {
  const XLSX = await chargerXlsx()
  const nom = (table, id) => d.parId[table]?.get(id)?.Nom ?? ''
  const emplacements = [
    ...(d.Vestiaires ?? []).map((v) => [nom('Chantiers', v.Chantier), nom('Zones', d.parId.Bases_vie.get(v.Base_vie)?.Zone), nom('Bases_vie', v.Base_vie), nom('Etages', v.Etage), '', v.Nom]),
    ...(d.Pieces ?? []).map((p) => [nom('Chantiers', p.Chantier), nom('Zones', d.parId.Bases_vie.get(p.Base_vie)?.Zone), nom('Bases_vie', p.Base_vie), nom('Etages', p.Etage), p.Nom, '']),
  ].filter((e) => e[0]).sort((a, b) => a.join('|').localeCompare(b.join('|'))) // sans chantier : inutilisable à l'import
  const exemple = emplacements.find((e) => e[5]) ?? emplacements[0] ?? ['', '', '', '', '', ''] // de préférence un vestiaire
  const salaries = d.Utilisateurs.filter((u) => u.Profil === ROLE_SALARIE)
  const email = salaries[0]?.Email ?? ''
  const titres = COLONNES_IMPORT.map(([, titre]) => titre)
  const largeurs = [18, 18, 28, 18, 16, 14, 12, 16, 14, 30, 16, 40].map((wch) => ({ wch }))
  // Colonnes Date début et Date fin au format Texte (@) sur 300 lignes : Excel garde « 05/11/2026 08:00 » tel quel
  // au lieu d'en faire une date, qu'il lirait 11 mai sur un ordinateur réglé en mois/jour
  const taches = XLSX.utils.aoa_to_sheet([titres])
  for (let r = 1; r < 300; r++) for (const c of [0, 1]) taches[XLSX.utils.encode_cell({ r, c })] = { t: 's', v: '', z: '@' }
  taches['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 299, c: titres.length - 1 } })
  taches['!cols'] = largeurs
  const feuilleExemple = XLSX.utils.aoa_to_sheet([titres,
    ['03/11/2026 08:00', '03/11/2026 12:00', '', ...exemple, 'Nettoyage vestiaire', 'Nettoyage', 'Sols et bancs'],
    ['04/11/2026 13:30', '04/11/2026 17:00', email, exemple[0], '', '', '', '', '', 'Contrôle des casiers', 'Contrôle', 'Tâche d’un autre salarié (email)'],
    [], ['Exemple seulement : cet onglet n’est jamais importé. Recopie tes tâches dans l’onglet « Tâches ».']])
  feuilleExemple['!cols'] = largeurs
  const feuilleEmplacements = XLSX.utils.aoa_to_sheet([['Chantier', 'Zone', 'Base vie', 'Étage', 'Pièce', 'Vestiaire'], ...emplacements])
  feuilleEmplacements['!cols'] = [20, 18, 16, 14, 18, 16].map((wch) => ({ wch }))
  const feuilleSalaries = XLSX.utils.aoa_to_sheet([['Salarié', 'Email (à recopier dans « Salarié (email) »)'], ...salaries.map((u) => [nomContact(u), u.Email])])
  feuilleSalaries['!cols'] = [{ wch: 26 }, { wch: 40 }]
  const aide = XLSX.utils.aoa_to_sheet([
    ['Import des tâches de l’emploi du temps'], [''],
    ['Une ligne = une tâche, dans l’onglet « Tâches ». Les lignes vides sont ignorées. L’onglet « Exemple » n’est jamais importé.'],
    ['Date début (obligatoire) et Date fin : JJ/MM/AAAA HH:MM, par exemple 03/11/2026 08:00 (colonnes au format Texte : Excel ne les transforme pas).'],
    ['Si tu colles des dates venant d’ailleurs, vérifie l’aperçu : il écrit le mois en toutes lettres (Excel inverse parfois jour et mois).'],
    ['Titre de tâche : obligatoire.'],
    ['Salarié (email) : laisser vide pour le salarié dont la fiche est ouverte ; sinon l’email de son compte (onglet « Salariés »).'],
    ['Emplacement : le chantier est obligatoire si un niveau est rempli. Recopier les noms exacts de l’onglet « Emplacements ».'],
    ['Les niveaux au-dessus sont complétés tout seuls : un vestiaire suffit à retrouver son étage, sa base vie et sa zone.'],
    ['Si un nom existe plusieurs fois dans le chantier (« RDC »…), remplir aussi le niveau au-dessus (base vie, étage).'],
    ['Avant l’enregistrement, l’application montre un aperçu : les lignes en erreur ne sont pas importées.'],
  ])
  aide['!cols'] = [{ wch: 120 }]
  const classeur = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(classeur, taches, 'Tâches')
  XLSX.utils.book_append_sheet(classeur, feuilleExemple, 'Exemple')
  XLSX.utils.book_append_sheet(classeur, feuilleEmplacements, 'Emplacements')
  XLSX.utils.book_append_sheet(classeur, feuilleSalaries, 'Salariés')
  XLSX.utils.book_append_sheet(classeur, aide, 'Aide')
  XLSX.writeFile(classeur, 'modele-import-taches.xlsx')
}
