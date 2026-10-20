// Écran « Gestion des candidats » (admin) : tableau des candidats avec recherche, et formulaire
// « Ajouter un candidat » en blocs (le même sert à modifier un candidat), fiche détail en lecture, suppression,
// fiche d'entretien en onglets : Entretien (infos de base, nouvel entretien, entretiens réalisés) et Poste (poste affilié),
// fiche d'embauche des candidats acceptés (critères, documents recto / verso, tailles).
// Les 45 colonnes de la table ne tiennent pas dans un tableau : on affiche les plus utiles pour repérer et contacter.
import { h, depuisGrist, enFrancais, versGrist, euros, ouvrirPanneau, reduirePhoto, icone, etiqueterLignes, lienContact, fenetreSuppression } from './outils.js'
import { envoyerPhoto, enregistrerCandidat, supprimerCandidat, lienPhotos, creerEntretien, idsDeListe, enregistrerEmbauche, estAdmin, libelleHoraires } from './donnees.js'

const TITRES_CANDIDATS = ['Candidat', 'Statut', 'Nationalité', 'Téléphone', 'Email', 'Poste', 'CIP responsable', 'Pass IAE', '']

// Statuts d'une candidature (valeurs de la colonne Statut) ; les onglets les reprennent au pluriel, plus « Tous »
const STATUT_ACCEPTE = 'Acceptée' // ouvre la fiche d'embauche
const STATUTS_CANDIDAT = ['Reçue', 'En cours d’examen', 'Entretien programmé', STATUT_ACCEPTE, 'Refusée']
const ONGLETS_CANDIDATS = [['Reçue', 'Reçues'], ['En cours d’examen', 'En cours d’examen'], ['Entretien programmé', 'Entretien programmé'],
  ['Acceptée', 'Acceptés'], ['Refusée', 'Refusés'], ['', 'Tous']]
const CLASSES_STATUT_CANDIDAT = { 'Reçue': 'badge-nouveau', 'En cours d’examen': 'badge-en_cours', 'Entretien programmé': 'badge-termine', 'Acceptée': 'badge-resolu', 'Refusée': 'badge-ouvert' }

const OUI_NON = ['Oui', 'Non']
const NIVEAUX_LANGUE = ['Aucun', 'Débutant', 'Intermédiaire', 'Courant', 'Langue maternelle']

// Fiche d'embauche : critères d'éligibilité (mêmes valeurs que les colonnes Grist à choix multiples)
const CRITERES_NIVEAU_1 = ['RSA', 'ASS', 'AAH', 'Demandeur d’emploi depuis 24 mois ou plus']
const CRITERES_NIVEAU_2 = ['Niveau CAP/BEP ou inférieur', 'Moins de 26 ans', 'Sénior : 50 ans ou plus', 'Parent isolé', 'Situation de handicap / RQTH',
  'Demandeur d’emploi depuis 12 à 24 mois', 'Sans logement ou hébergé', 'Résident QPV', 'Résident FRR',
  'Réfugié / demandeur d’asile / bénéficiaire d’une protection', 'Sortant de l’ASE', 'Sortant de détention ou placé sous-main de justice',
  'Maîtrise de la langue française niveau A1 ou infra', 'Problème de mobilité']

// Situation de logement qui rend obligatoire la pièce d'identité de l'hébergeur
const LOGEMENT_HEBERGE = 'Hébergé(e) chez quelqu’un'
const DOC_HEBERGEUR = 'Pièce d’identité de l’hébergeur'

// Documents de la fiche d'embauche : [type (table Documents), titre, précision, faces demandées]
const DOCUMENTS_EMBAUCHE = [
  ['Pièce d’identité', 'Carte d’identité ou titre de séjour / récépissé / attestation d’instruction d’une demande de titre de séjour',
    'Document valide et couvrant au moins la durée du premier contrat (4 mois minimum)', ['Recto', 'Verso']],
  ['Carte Vitale / attestation d’assurance maladie', 'Carte Vitale / attestation d’assurance maladie', '', ['Recto', 'Verso']],
  ['Justificatif de domicile', 'Justificatif de domicile', '', ['Recto']],
  [DOC_HEBERGEUR, 'Si le salarié est hébergé : attestation d’hébergement + pièce d’identité de l’hébergeur', '', ['Recto', 'Verso']],
  ['Attestation d’inscription à France Travail', 'Attestation d’inscription à France Travail', 'Identifiant + durée d’inscription', ['Recto']],
  ['RIB', 'RIB', '', ['Recto']],
  ['Attestation CAF', 'Attestation CAF', 'Nécessaire pour savoir si le salarié bénéficie d’aides sociales', ['Recto']],
]

// Zone d'import d'un fichier (clic ou glisser-déposer) ; `onChoix(fichier)` reçoit le fichier choisi.
// `deja` : un fichier est déjà enregistré ; `lien` : adresse pour l'ouvrir
function zoneFichier(onChoix, { deja = false, lien = null, accept = '.pdf,.doc,.docx,.odt,image/*' } = {}) {
  const nom = h('span', { className: 'sous-texte' }, deja ? 'Un fichier est déjà enregistré ; en choisir un autre le remplace.' : 'Ou glissez et déposez votre fichier ici')
  const choisir = (f) => { if (f) { onChoix(f); nom.textContent = f.name } }
  const entree = h('input', { type: 'file', hidden: true, accept, onChange: (e) => choisir(e.target.files?.[0]) })
  const zone = h('label', { className: 'zone-fichier',
    onDragover: (e) => { e.preventDefault(); zone.classList.add('survol') },
    onDragleave: () => zone.classList.remove('survol'),
    onDrop: (e) => { e.preventDefault(); zone.classList.remove('survol'); choisir(e.dataTransfer.files?.[0]) } },
  h('span', { className: 'bouton bouton-compact' }, 'Importer un fichier'), nom, entree)
  return lien ? h('div', { className: 'zone-avec-lien' }, zone, h('a', { href: lien, target: '_blank', rel: 'noreferrer' }, 'Voir le fichier enregistré')) : zone
}

/**
 * Blocs du formulaire, deux par ligne, dans l'ordre des colonnes Grist.
 * Champ : [colonne, libellé, type, options] ; types : texte, long, date, tel, email, nombre, choix (options = valeurs),
 * ref (options = [table, colonne affichée]), photo, fichier.
 */
const BLOCS_CANDIDAT = [
  ['Suivi de la candidature', [
    ['Statut', 'Statut', 'choix', STATUTS_CANDIDAT], ['Valide_par_CIP', 'Validé par le CIP', 'choix', OUI_NON], ['Date_entretien', 'Date d’entretien', 'date'],
  ]],
  ['Informations personnelles', [
    ['Prenom', 'Prénom', 'texte'], ['Nom', 'Nom', 'texte'], ['Date_naissance', 'Date de naissance', 'date'],
    ['Nationalite', 'Nationalité', 'ref', ['Nationalites', 'Nationalite']], ['Telephone', 'Téléphone', 'tel'], ['Email', 'Email', 'email'],
  ]],
  ['Situation administrative', [
    ['Numero_securite_sociale', 'Numéro de sécurité sociale', 'texte'], ['Date_validite_piece_identite', 'Date de validité de la pièce d’identité', 'date'],
    ['Date_validite_titre_sejour', 'Date validité titre de séjour', 'date'],
    ['CMU', 'CMU', 'choix', OUI_NON], ['RQTH', 'RQTH', 'choix', OUI_NON],
    ['Pass_IAE_debut', 'Pass IAE date début', 'date'], ['Pass_IAE_fin', 'Pass IAE date fin', 'date'],
  ]],
  ['France Travail', [
    ['Inscrit_France_Travail', 'Inscrit à France Travail ?', 'choix', OUI_NON], ['Numero_allocataire_FT', 'Numéro d’allocataire France Travail', 'texte'],
    ['Conseiller_FT_prenom', 'Prénom du conseiller', 'texte'], ['Conseiller_FT_nom', 'Nom du conseiller', 'texte'],
    ['Conseiller_FT_telephone', 'Téléphone du conseiller', 'tel'], ['Conseiller_FT_email', 'Email du conseiller', 'email'],
  ]],
  ['Prescripteur', [
    ['Prescripteur', 'Prescripteur', 'choix', ['France Travail', 'Mission locale', 'Cap emploi', 'Département (RSA)', 'CCAS', 'Structure d’insertion (SIAE)', 'Association', 'Autre']],
    ['Prescripteur_nom', 'Nom du prescripteur', 'texte'], ['Prescripteur_prenom', 'Prénom du prescripteur', 'texte'],
    ['Prescripteur_telephone', 'Téléphone du prescripteur', 'tel'], ['Prescripteur_email', 'Email du prescripteur', 'email'],
  ]],
  ['Accompagnement social', [
    ['Assistant_social', 'Assistant social', 'choix', OUI_NON],
    ['Referent_social_prenom', 'Prénom du référent ou de l’assistant social', 'texte'], ['Referent_social_nom', 'Nom du référent ou de l’assistant social', 'texte'],
    ['Referent_social_telephone', 'Téléphone du référent ou de l’assistant social', 'tel'], ['Referent_social_email', 'Email du référent ou de l’assistant social', 'email'],
  ]],
  ['Logement', [
    ['Situation_logement', 'Logement ou hébergé(e) chez quelqu’un ?', 'choix', ['Logement personnel', LOGEMENT_HEBERGE, 'Hébergement d’urgence ou foyer', 'Sans domicile', 'Autre']],
    ['Demande_logement', 'Une demande de logement a-t-elle été effectuée ?', 'choix', OUI_NON], ['Demande_logement_par', 'Si oui, par qui ?', 'texte'],
  ]],
  ['Ressources', [
    ['Ressource', 'Ressource', 'choix', ['RSA', 'ARE (allocation chômage)', 'ASS', 'AAH', 'Salaire', 'Prime d’activité', 'Aucune', 'Autre']],
    ['Ressource_montant', 'Montant (€)', 'nombre'], ['Ressource_origine', 'Origine des ressources', 'texte'],
  ]],
  ['Parcours / Formation', [
    ['Formation', 'Formation', 'texte'], ['Diplome', 'Diplôme', 'texte'], ['Experiences', 'Expériences', 'long'],
  ]],
  ['Niveau de langue', [
    ['Francais_oral', 'Niveau de français oral', 'choix', NIVEAUX_LANGUE], ['Francais_ecrit', 'Niveau de français écrit', 'choix', NIVEAUX_LANGUE],
  ]],
  ['Autres', [
    ['Composition_famille', 'Composition de famille', 'texte'], ['Autres', 'Autres', 'long'],
  ]],
  ['CIP responsable', [['CIP_responsable', 'CIP responsable', 'ref', ['Utilisateurs', 'Nom']]]],
  ['Poste', [['Poste', 'Poste', 'ref', ['Postes', 'Titre']]]],
  ['Photo', [['Photo', 'Photo', 'photo']]],
  ['CV', [['CV', 'CV', 'fichier']]],
]

// Âge en années à partir d'une date ISO (AAAA-MM-JJ)
function age(iso) {
  if (!iso) return null
  const [a, m, j] = iso.split('-').map(Number)
  const auj = new Date()
  return auj.getFullYear() - a - (auj.getMonth() + 1 < m || (auj.getMonth() + 1 === m && auj.getDate() < j) ? 1 : 0)
}

// Écran affiché dans `racine` ; `recharger()` relit les données après une écriture
export function creerEcranCandidats(racine, recharger) {
  let d = null
  let recherche = ''
  let onglet = '' // statut affiché ; '' = tous

  const nom = (c) => [c.Prenom, c.Nom].filter(Boolean).join(' ') || 'Sans nom'
  const nationalite = (c) => d.parId.Nationalites.get(c.Nationalite)?.Nationalite ?? ''
  const poste = (c) => d.parId.Postes.get(c.Poste)?.Titre ?? ''
  const cip = (c) => d.parId.Utilisateurs.get(c.CIP_responsable)?.Nom ?? ''
  const passIae = (c) => {
    const [debut, fin] = [depuisGrist(c.Pass_IAE_debut), depuisGrist(c.Pass_IAE_fin)].map(enFrancais)
    return debut || fin ? `${debut || '?'} → ${fin || '?'}` : ''
  }

  function rendre() {
    if (!d) return
    if (!estAdmin(d)) {
      racine.replaceChildren(h('h1', null, 'Gestion des candidats'), h('p', { className: 'message' }, 'Page réservée aux administrateurs.'))
      return
    }
    if (d.absentes.has('Candidats')) {
      racine.replaceChildren(h('h1', null, 'Gestion des candidats'), h('p', { className: 'message' }, 'Ce document n’a pas de table Candidats.'))
      return
    }
    const corps = h('tbody')
    const compteur = h('p', { className: 'sous-texte' })
    // Ne redessine que les lignes : le champ de recherche garde le curseur
    const dessinerLignes = () => {
      const filtre = recherche.trim().toLowerCase()
      const liste = d.Candidats
        .filter((c) => !onglet || c.Statut === onglet)
        .filter((c) => !filtre || [nom(c), nationalite(c), c.Telephone, c.Email, poste(c), cip(c)].some((v) => String(v ?? '').toLowerCase().includes(filtre)))
        .sort((a, b) => String(a.Nom).localeCompare(String(b.Nom)) || String(a.Prenom).localeCompare(String(b.Prenom)))
      compteur.textContent = `${liste.length} candidat${liste.length > 1 ? 's' : ''}${filtre ? ` sur ${d.Candidats.length}` : ''}`
      corps.replaceChildren(...(liste.length === 0
        ? [h('tr', null, h('td', { className: 'tableau-vide', colSpan: TITRES_CANDIDATS.length }, filtre ? 'Aucun candidat ne correspond.' : 'Aucun candidat pour l’instant.'))]
        : liste.map((c) => {
          const naissance = depuisGrist(c.Date_naissance)
          return h('tr', { className: 'tableau-ligne', title: 'Voir la fiche du candidat', onClick: () => ouvrirFiche(c) },
            h('td', null,
              h('div', { className: 'tableau-nom' }, nom(c)),
              naissance && h('div', { className: 'sous-texte' }, `${enFrancais(naissance)} · ${age(naissance)} ans`)),
            h('td', null, c.Statut ? h('span', { className: `badge ${CLASSES_STATUT_CANDIDAT[c.Statut] ?? ''}` }, c.Statut) : '—',
              c.Embauche && h('span', { className: 'badge badge-embauche' }, 'Embauché')),
            h('td', null, nationalite(c)),
            h('td', null, lienContact('tel', c.Telephone)),
            h('td', null, lienContact('mailto', c.Email)),
            h('td', null, poste(c)),
            h('td', null, cip(c)),
            h('td', null, passIae(c)),
            h('td', { className: 'tableau-actions' },
              c.Statut === STATUT_ACCEPTE && h('button', { className: 'bouton bouton-compact bouton-embauche', onClick: (e) => { e.stopPropagation(); ouvrirFicheEmbauche(c) } }, 'Embauche'),
              h('button', { className: 'bouton bouton-compact bouton-principal', onClick: (e) => { e.stopPropagation(); ouvrirFicheEntretien(c) } }, 'Entretien'),
              h('button', { className: 'bouton bouton-compact', onClick: (e) => { e.stopPropagation(); ouvrirFormulaire(c) } }, 'Modifier'),
              h('button', { className: 'bouton bouton-compact bouton-danger', onClick: (e) => { e.stopPropagation(); ouvrirSuppression(c) } }, 'Supprimer')))
        })))
      etiqueterLignes(corps, TITRES_CANDIDATS)
    }
    dessinerLignes()
    racine.replaceChildren(
      h('h1', null, 'Gestion des candidats'),
      // Onglets, recherche et tableau dans une même carte blanche à bordure noire
      h('section', { className: 'carte-tableau' },
        h('div', { className: 'onglets onglets-statut onglets-candidats', role: 'tablist', 'aria-label': 'Statut des candidatures' },
          ONGLETS_CANDIDATS.map(([statut, libelle]) => h('button', { className: 'onglet', role: 'tab', 'aria-selected': String(statut === onglet),
            onClick: () => { onglet = statut; rendre() } }, `${libelle} (${statut ? d.Candidats.filter((c) => c.Statut === statut).length : d.Candidats.length})`))),
        h('div', { className: 'barre-outils' },
          h('input', { className: 'champ champ-compact', type: 'search', placeholder: 'Rechercher (nom, nationalité, téléphone, email, poste, CIP…)', value: recherche,
            'aria-label': 'Rechercher un candidat', onInput: (e) => { recherche = e.target.value; dessinerLignes() } }),
          h('button', { className: 'bouton bouton-principal bouton-compact', onClick: () => ouvrirFormulaire(null) }, '＋ Ajouter un candidat')),
        compteur,
        h('div', { className: 'tableau-defilant' },
          h('table', { className: 'tableau' },
            h('thead', null, h('tr', null, TITRES_CANDIDATS.map((t) => h('th', null, t)))),
            corps))))
  }

  // ---- Formulaire : ajout (`c` null) ou modification d'un candidat ----

  function ouvrirFormulaire(c) {
    const valeurs = {} // saisies en cours, au format du formulaire (texte, ISO, nombre, identifiant)
    const fichiers = {} // fichiers choisis, par colonne
    const erreur = h('p', { className: 'erreur', hidden: true })
    const valider = h('button', { className: 'bouton bouton-principal', type: 'submit' }, c ? 'Enregistrer les modifications' : 'Ajouter le candidat')

    // `seul` : unique champ d'un bloc portant le même nom → libellé masqué (le titre du bloc suffit), gardé pour les lecteurs d'écran
    const champ = ([col, libelle, type, options], seul = false) => {
      const etiquette = seul ? h('span', { className: 'visuellement-cache' }, libelle) : libelle
      const brut = c?.[col]
      const maj = (v) => { valeurs[col] = v }
      let saisie
      if (type === 'date') {
        valeurs[col] = depuisGrist(brut) ?? ''
        saisie = h('input', { className: 'champ', type: 'date', value: valeurs[col], onInput: (e) => maj(e.target.value) })
      } else if (type === 'choix') {
        valeurs[col] = brut ?? ''
        saisie = h('select', { className: 'champ', onChange: (e) => maj(e.target.value) },
          h('option', { value: '', selected: !valeurs[col] }, '-- Choisissez --'),
          options.map((v) => h('option', { value: v, selected: valeurs[col] === v }, v)))
      } else if (type === 'ref') {
        const [table, affichage] = options
        valeurs[col] = Number(brut) || 0
        const lignes = [...(d[table] ?? [])].sort((a, b) => String(a[affichage]).localeCompare(String(b[affichage])))
        saisie = h('select', { className: 'champ', onChange: (e) => maj(Number(e.target.value) || 0) },
          h('option', { value: '0', selected: !valeurs[col] }, '-- Choisissez --'),
          lignes.map((r) => h('option', { value: String(r.id), selected: r.id === valeurs[col] }, r[affichage] || 'Sans nom')))
      } else if (type === 'nombre') {
        valeurs[col] = brut ?? ''
        saisie = h('input', { className: 'champ', type: 'number', min: 0, step: 0.01, value: valeurs[col], onInput: (e) => maj(e.target.value) })
      } else if (type === 'long') {
        valeurs[col] = brut ?? ''
        saisie = h('textarea', { className: 'champ champ-texte', value: valeurs[col], onInput: (e) => maj(e.target.value) })
      } else if (type === 'photo' || type === 'fichier') {
        const zone = zoneFichier((f) => { fichiers[col] = f },
          { deja: Array.isArray(brut) && brut.length > 1, accept: type === 'photo' ? 'image/*' : '.pdf,.doc,.docx,.odt,image/*' })
        return h('div', { className: 'champ-groupe' }, etiquette, zone)
      } else {
        valeurs[col] = brut ?? ''
        saisie = h('input', { className: 'champ', autocomplete: 'off', type: type === 'tel' ? 'tel' : type === 'email' ? 'email' : 'text',
          required: col === 'Prenom' || col === 'Nom', value: valeurs[col], onInput: (e) => maj(e.target.value) })
      }
      return h('label', { className: 'champ-groupe' }, etiquette, saisie)
    }

    // Saisies → colonnes Grist : dates en secondes, montant en nombre, textes nettoyés, références en identifiant
    const versColonnes = () => Object.fromEntries(BLOCS_CANDIDAT.flatMap(([, champs]) => champs)
      .filter(([, , type]) => type !== 'photo' && type !== 'fichier')
      .map(([col, , type]) => {
        const v = valeurs[col]
        if (type === 'date') return [col, versGrist(v)]
        if (type === 'nombre') return [col, v === '' || v == null ? null : Number(v)]
        if (type === 'ref') return [col, v || 0]
        return [col, typeof v === 'string' ? v.trim() : v]
      }))

    const formulaire = h('form', { className: 'formulaire', onSubmit: async (e) => {
      e.preventDefault()
      erreur.hidden = true
      if (!String(valeurs.Prenom ?? '').trim() || !String(valeurs.Nom ?? '').trim()) {
        erreur.textContent = 'Le prénom et le nom sont obligatoires.'
        erreur.hidden = false
        return
      }
      valider.disabled = true
      valider.textContent = 'Enregistrement…'
      try {
        const champs = versColonnes()
        // Fichiers : un nouveau fichier remplace l'ancien ; sans nouveau fichier, l'ancien reste
        for (const [col, f] of Object.entries(fichiers)) {
          if (!f) continue
          const id = col === 'Photo' && f.type.startsWith('image/') ? await envoyerPhoto(await reduirePhoto(f)) : await envoyerPhoto(f, f.name)
          champs[col] = ['L', id]
        }
        await enregistrerCandidat(c?.id ?? null, champs)
        fermer()
        await recharger()
      } catch (err) {
        erreur.textContent = err.message || 'L’enregistrement a échoué.'
        erreur.hidden = false
        valider.disabled = false
        valider.textContent = c ? 'Enregistrer les modifications' : 'Ajouter le candidat'
      }
    } },
    h('div', { className: 'blocs-candidat' },
      BLOCS_CANDIDAT.map(([titre, champs]) => h('section', { className: 'bloc-candidat' }, h('h3', null, titre),
        champs.map((f) => champ(f, champs.length === 1 && f[1] === titre))))),
    erreur,
    h('div', { className: 'fiche-actions' }, valider))

    const titre = h('span', { className: 'titre-formulaire' }, h('span', { className: 'titre-icone' }, icone('occupes', 22)),
      c ? `${[c.Prenom, c.Nom].filter(Boolean).join(' ') || 'Candidat'}` : 'Ajouter un candidat')
    const { fermer, section } = ouvrirPanneau(titre, formulaire)
    section.classList.add('panneau-large', 'panneau-fiche', 'panneau-candidat')
  }

  // ---- Fiche détail (lecture) ----

  // Valeur lisible d'un champ selon son type ; vide → tiret
  function valeurLisible(c, [col, , type, options], lien) {
    const v = c[col]
    if (type === 'date') return enFrancais(depuisGrist(v)) || '—'
    if (type === 'ref') return d[options[0]] ? d.parId[options[0]].get(v)?.[options[1]] || '—' : '—'
    if (type === 'nombre') return v != null && v !== '' ? euros.format(v) : '—'
    if (type === 'tel') return lienContact('tel', v) || '—'
    if (type === 'email') return lienContact('mailto', v) || '—'
    if (type === 'photo' || type === 'fichier') {
      const id = idsDeListe(v)[0]
      if (!id) return '—'
      if (!lien) return 'Fichier enregistré'
      return type === 'photo'
        ? h('a', { href: lien(id), target: '_blank', rel: 'noreferrer' }, h('img', { className: 'photo-candidat', src: lien(id), alt: 'Photo du candidat' }))
        : h('a', { href: lien(id), target: '_blank', rel: 'noreferrer' }, 'Ouvrir le CV')
    }
    return v === '' || v == null ? '—' : String(v)
  }

  async function ouvrirFiche(c) {
    const lien = await lienPhotos().catch(() => null) // adresse temporaire des pièces jointes (photo, CV)
    const contenu = h('div', { className: 'blocs-candidat' },
      BLOCS_CANDIDAT.map(([titre, champs]) => h('section', { className: 'bloc-candidat' }, h('h3', null, titre),
        h('dl', { className: 'fiche-infos' }, champs.map((f) => [
          champs.length === 1 && f[1] === titre ? null : h('dt', null, f[1]),
          h('dd', { className: champs.length === 1 && f[1] === titre ? 'fiche-seule' : '' }, valeurLisible(c, f, lien)),
        ].filter(Boolean))))))
    const naissance = depuisGrist(c.Date_naissance)
    const titre = h('span', { className: 'titre-formulaire' }, h('span', { className: 'titre-icone' }, icone('occupes', 22)), nom(c))
    const { fermer, section } = ouvrirPanneau(titre, [
      h('div', { className: 'fiche-entete' },
        h('div', { className: 'carte-titre sous-texte' }, [naissance && `${enFrancais(naissance)} · ${age(naissance)} ans`, poste(c)].filter(Boolean).join(' · ') || ' '),
        c.Statut === STATUT_ACCEPTE && h('button', { className: 'bouton bouton-compact bouton-embauche', onClick: () => { fermer(); ouvrirFicheEmbauche(c) } }, 'Fiche d’embauche'),
        h('button', { className: 'bouton bouton-compact bouton-principal', onClick: () => { fermer(); ouvrirFicheEntretien(c) } }, 'Fiche d’entretien'),
        h('button', { className: 'bouton bouton-compact', onClick: () => { fermer(); ouvrirFormulaire(c) } }, 'Modifier'),
        h('button', { className: 'bouton bouton-compact bouton-danger', onClick: () => { fermer(); ouvrirSuppression(c) } }, 'Supprimer')),
      contenu,
    ])
    section.classList.add('panneau-large', 'panneau-fiche', 'panneau-candidat')
  }

  // ---- Fiche d'entretien : infos de base, nouvel entretien, entretiens réalisés ----

  // Date ISO échue (avant aujourd'hui) ou qui arrive à échéance dans les 30 jours
  const echeance = (iso) => {
    const jours = (new Date(iso) - new Date(new Date().toDateString())) / 86400000
    return jours < 0 ? ['badge-ouvert', 'Expirée'] : jours <= 30 ? ['badge-en_cours', 'Bientôt'] : null
  }
  const dateAvecAlerte = (v) => {
    const iso = depuisGrist(v)
    if (!iso) return '—'
    const alerte = echeance(iso)
    return [enFrancais(iso), alerte && h('span', { className: `badge ${alerte[0]}` }, alerte[1])]
  }
  const dateHeureComplete = (v) => (v ? new Date(v * 1000).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—')

  function ouvrirFicheEntretien(c) {
    const entretiens = (d.Entretiens ?? []).filter((e) => e.Candidat === c.id).sort((a, b) => (b.Cree_le ?? 0) - (a.Cree_le ?? 0))
    const infos = [
      ['Prénom', c.Prenom || '—'], ['Nom', c.Nom || '—'],
      ['Téléphone', lienContact('tel', c.Telephone) || '—'], ['RQTH', c.RQTH || '—'],
      ['Validité de la pièce d’identité', dateAvecAlerte(c.Date_validite_piece_identite)], ['Fin du Pass IAE', dateAvecAlerte(c.Pass_IAE_fin)],
    ]

    // Nouvel entretien : un compte rendu ; la date et l'heure sont ajoutées par Grist
    let texte = ''
    const erreur = h('p', { className: 'erreur', hidden: true })
    const valider = h('button', { className: 'bouton bouton-principal', type: 'submit', disabled: true }, 'Enregistrer l’entretien')
    const zone = h('textarea', { className: 'champ champ-texte', placeholder: 'Compte rendu de l’entretien…', 'aria-label': 'Compte rendu de l’entretien',
      onInput: (e) => { texte = e.target.value; valider.disabled = !texte.trim() } })
    const nouveau = h('form', { className: 'formulaire', onSubmit: async (e) => {
      e.preventDefault()
      if (!texte.trim()) return
      erreur.hidden = true
      valider.disabled = true
      valider.textContent = 'Enregistrement…'
      try {
        await creerEntretien(c.id, texte.trim())
        fermer()
        await recharger()
        const aJour = d.parId.Candidats.get(c.id)
        if (aJour) ouvrirFicheEntretien(aJour) // rouvre la fiche avec le nouvel entretien en tête
      } catch (err) {
        erreur.textContent = err.message || 'L’entretien n’a pas pu être enregistré.'
        erreur.hidden = false
        valider.disabled = false
        valider.textContent = 'Enregistrer l’entretien'
      }
    } }, zone, erreur, valider)

    // Onglet « Entretien » : infos de base, nouvel entretien, entretiens réalisés
    const ongletEntretien = [
      h('section', { className: 'bloc-candidat' }, h('h3', null, nom(c)),
        h('dl', { className: 'fiche-infos fiche-entretien-infos' }, infos.map(([terme, valeur]) => [h('dt', null, terme), h('dd', null, valeur)]))),
      h('section', { className: 'bloc-candidat' }, h('h3', null, 'Nouvel entretien'),
        d.absentes.has('Entretiens') ? h('p', { className: 'message' }, 'Ce document n’a pas de table Entretiens.') : nouveau),
      h('section', { className: 'bloc-candidat' }, h('h3', null, `Entretiens réalisés (${entretiens.length})`),
        entretiens.length === 0
          ? h('p', { className: 'message' }, 'Aucun entretien pour l’instant.')
          : h('ul', { className: 'entretiens' }, entretiens.map((e) => h('li', { className: 'entretien' },
            h('span', { className: 'entretien-date' }, dateHeureComplete(e.Cree_le)),
            h('p', { className: 'entretien-texte' }, e.Entretien || '—'))))),
    ]

    // Onglets de la fiche ; changer d'onglet ne redessine que le contenu (le texte en cours de saisie est gardé)
    const contenu = h('div', { className: 'fiche-contenu' })
    const barre = h('div', { className: 'onglets onglets-statut', role: 'tablist', 'aria-label': 'Fiche d’entretien' })
    const afficherOnglet = (cle) => {
      barre.replaceChildren(...[['entretien', 'Entretien'], ['poste', 'Poste']].map(([k, libelle]) =>
        h('button', { className: 'onglet', role: 'tab', 'aria-selected': String(k === cle), onClick: () => afficherOnglet(k) }, libelle)))
      contenu.replaceChildren(...(cle === 'poste' ? [ongletPoste(c)] : ongletEntretien))
    }
    afficherOnglet('entretien')

    const titre = h('span', { className: 'titre-formulaire' }, h('span', { className: 'titre-icone' }, icone('occupes', 22)), 'Fiche d’entretien')
    const { fermer, section } = ouvrirPanneau(titre, [barre, contenu])
    section.classList.add('panneau-large', 'panneau-fiche', 'panneau-candidat')
    zone.focus()
  }

  // Onglet « Poste » de la fiche d'entretien : informations du poste affilié au candidat
  function ongletPoste(c) {
    const p = d.parId.Postes.get(c.Poste)
    if (!p) return h('section', { className: 'bloc-candidat' }, h('h3', null, 'Poste'),
      h('p', { className: 'message' }, 'Aucun poste n’est affilié à ce candidat. Choisis-le avec « Modifier », bloc Poste.'))
    const chantiers = idsDeListe(p.Chantiers).map((id) => d.parId.Chantiers.get(id)?.Nom).filter(Boolean)
    const infos = [
      ['Statut', p.Statut || '—'],
      ['Date de démarrage', enFrancais(depuisGrist(p.Date_demarrage)) || '—'],
      ['Personnes recherchées', p.Nb_personnes ?? '—'],
      ['Horaires', libelleHoraires(p, '—')],
      ['Chantiers', chantiers.length ? chantiers.join(', ') : '—'],
    ]
    return h('section', { className: 'bloc-candidat' }, h('h3', null, p.Titre || 'Poste sans titre'),
      h('dl', { className: 'fiche-infos' }, infos.map(([terme, valeur]) => [h('dt', null, terme), h('dd', null, valeur)])),
      h('h3', null, 'Mission'),
      h('p', { className: 'entretien-texte' }, p.Mission || '—'))
  }

  // ---- Fiche d'embauche (candidats acceptés) : infos, critères, documents recto / verso, tailles ----

  async function ouvrirFicheEmbauche(c) {
    const lien = await lienPhotos().catch(() => null) // adresse temporaire des pièces jointes déjà enregistrées
    const coches = { Criteres_niveau_1: new Set(idsDeListe(c.Criteres_niveau_1)), Criteres_niveau_2: new Set(idsDeListe(c.Criteres_niveau_2)) }
    const tailles = { Taille_pantalon: c.Taille_pantalon ?? '', Taille_veste: c.Taille_veste ?? '', Pointure: c.Pointure ?? '' }
    const nouveaux = {} // { type: { Recto: fichier, Verso: fichier } }
    const documentsDuCandidat = (d.Documents ?? []).filter((r) => r.Candidat === c.id)
    const pieceJointe = (v) => idsDeListe(v)[0] ?? null
    const heberge = c.Situation_logement === LOGEMENT_HEBERGE
    const rectoExige = (type) => type !== DOC_HEBERGEUR || heberge
    // Recto déjà enregistré ou choisi dans cette fiche
    const aUnRecto = (type) => Boolean(pieceJointe(documentsDuCandidat.find((r) => r.Type_document === type)?.Recto) || nouveaux[type]?.Recto)

    // Informations de base (lecture)
    const infos = [
      ['Prénom', c.Prenom || '—'], ['Nom', c.Nom || '—'],
      ['Téléphone', lienContact('tel', c.Telephone) || '—'],
      ['Validité de la pièce d’identité', dateAvecAlerte(c.Date_validite_piece_identite)], ['RQTH', c.RQTH || '—'],
      ['Fin du Pass IAE', dateAvecAlerte(c.Pass_IAE_fin)], ['Validé par le CIP', c.Valide_par_CIP || '—'],
      ['Embauché', c.Embauche ? 'Oui' : 'Non (coché à l’enregistrement de cette fiche)'],
    ]

    // Critères : cases à cocher, avec le nombre coché face au minimum
    const blocCriteres = (col, titre, valeurs, minimum) => {
      const compteur = h('span', { className: 'badge' })
      const majCompteur = () => {
        const n = coches[col].size
        compteur.textContent = `${n} coché${n > 1 ? 's' : ''} · minimum ${minimum}`
        compteur.className = `badge ${n >= minimum ? 'badge-resolu' : 'badge-ouvert'}`
      }
      majCompteur()
      return h('section', { className: 'bloc-candidat' },
        h('h3', { className: 'titre-criteres' }, `${titre} *`, compteur),
        h('div', { className: 'cases-criteres' }, valeurs.map((v) => h('label', { className: 'case' },
          h('input', { type: 'checkbox', checked: coches[col].has(v), onChange: (e) => { e.target.checked ? coches[col].add(v) : coches[col].delete(v); majCompteur() } }),
          v))))
    }

    // Documents : une zone par face ; un fichier déjà enregistré peut être ouvert ou remplacé
    const blocDocument = ([type, titre, precision, faces]) => {
      const existant = documentsDuCandidat.find((r) => r.Type_document === type)
      return h('section', { className: 'bloc-document' },
        h('h4', null, titre), precision && h('p', { className: 'sous-texte' }, precision),
        faces.map((face) => {
          const id = pieceJointe(existant?.[face])
          const obligatoire = face === 'Recto' && rectoExige(type)
          const libelle = `${faces.length > 1 ? `${type} ${face.toLowerCase()}` : 'Fichier'}${obligatoire ? ' *' : ' (facultatif)'}`
          return h('div', { className: 'champ-groupe' }, libelle,
            zoneFichier((f) => { (nouveaux[type] ??= {})[face] = f }, { deja: Boolean(id), lien: id && lien ? lien(id) : null }))
        }))
    }

    const erreur = h('p', { className: 'erreur', hidden: true })
    const valider = h('button', { className: 'bouton bouton-principal', type: 'submit' }, 'Enregistrer la fiche d’embauche')
    const formulaire = h('form', { className: 'formulaire', onSubmit: async (e) => {
      e.preventDefault()
      erreur.hidden = true
      const manquants = DOCUMENTS_EMBAUCHE.filter(([type]) => rectoExige(type) && !aUnRecto(type)).map(([type]) => type)
      if (manquants.length > 0) {
        erreur.textContent = `Recto obligatoire manquant : ${manquants.join(', ')}.`
        erreur.hidden = false
        return
      }
      valider.disabled = true
      valider.textContent = 'Enregistrement…'
      try {
        // Envoi des nouveaux fichiers (les images sont réduites), puis une seule écriture Grist
        const documents = {}
        for (const [type, faces] of Object.entries(nouveaux)) {
          for (const [face, f] of Object.entries(faces)) {
            const id = f.type.startsWith('image/') ? await envoyerPhoto(await reduirePhoto(f), `${type} ${face}.jpg`) : await envoyerPhoto(f, f.name)
            ;(documents[type] ??= {})[face] = id
          }
        }
        const liste = (ensemble, ordre) => { const v = ordre.filter((x) => ensemble.has(x)); return v.length ? ['L', ...v] : null }
        await enregistrerEmbauche(d, c.id, {
          Embauche: true, // la fiche d'embauche enregistrée vaut embauche
          Criteres_niveau_1: liste(coches.Criteres_niveau_1, CRITERES_NIVEAU_1),
          Criteres_niveau_2: liste(coches.Criteres_niveau_2, CRITERES_NIVEAU_2),
          ...Object.fromEntries(Object.entries(tailles).map(([col, v]) => [col, String(v).trim()])),
        }, documents)
        fermer()
        await recharger()
        const aJour = d.parId.Candidats.get(c.id)
        if (aJour) ouvrirFicheEmbauche(aJour) // rouvre la fiche à jour
      } catch (err) {
        erreur.textContent = err.message || 'L’enregistrement a échoué.'
        erreur.hidden = false
        valider.disabled = false
        valider.textContent = 'Enregistrer la fiche d’embauche'
      }
    } },
    h('section', { className: 'bloc-candidat' }, h('h3', null, nom(c)),
      h('dl', { className: 'fiche-infos fiche-entretien-infos' }, infos.map(([terme, valeur]) => [h('dt', null, terme), h('dd', null, valeur)]))),
    blocCriteres('Criteres_niveau_1', 'Niveau 1 (1 critère minimum)', CRITERES_NIVEAU_1, 1),
    blocCriteres('Criteres_niveau_2', 'Niveau 2 (3 critères minimum)', CRITERES_NIVEAU_2, 3),
    h('section', { className: 'bloc-candidat' }, h('h3', null, 'Documents'),
      h('p', { className: 'sous-texte' }, `Recto obligatoire (*), verso facultatif.${heberge ? '' : ' Pièce d’identité de l’hébergeur : seulement si le candidat est hébergé.'}`),
      d.absentes.has('Documents') ? h('p', { className: 'message' }, 'Ce document n’a pas de table Documents.') : h('div', { className: 'documents-embauche' }, DOCUMENTS_EMBAUCHE.map(blocDocument))),
    h('section', { className: 'bloc-candidat' }, h('h3', null, 'Équipement'),
      h('div', { className: 'grille-2' }, [['Taille_pantalon', 'Taille de pantalon'], ['Taille_veste', 'Taille de veste'], ['Pointure', 'Pointure']]
        .map(([col, libelle]) => h('label', { className: 'champ-groupe' }, libelle,
          h('input', { className: 'champ', autocomplete: 'off', value: tailles[col], onInput: (e) => { tailles[col] = e.target.value } }))))),
    erreur,
    h('div', { className: 'fiche-actions' }, valider))

    const titre = h('span', { className: 'titre-formulaire' }, h('span', { className: 'titre-icone' }, icone('occupes', 22)), 'Fiche d’embauche')
    const { fermer, section } = ouvrirPanneau(titre, formulaire)
    section.classList.add('panneau-large', 'panneau-fiche', 'panneau-candidat')
  }

  // ---- Suppression ----

  function ouvrirSuppression(c) {
    const nb = (table) => (d[table] ?? []).filter((r) => r.Candidat === c.id).length
    const lies = [[nb('Documents'), 'document(s)'], [nb('Entretiens'), 'entretien(s)']].filter(([n]) => n > 0).map(([n, libelle]) => `${n} ${libelle}`)
    fenetreSuppression(`Supprimer ${nom(c)} ?`, [
      h('p', null, `Toutes les informations de ce candidat seront supprimées${lies.length ? `, avec ses ${lies.join(' et ses ')}` : ''}.`),
    ], [['Supprimer définitivement', 'bouton-danger', () => supprimerCandidat(d, c.id)]], recharger)
  }

  return {
    afficher(donnees) {
      d = donnees
      rendre()
    },
    accueil() {
      recherche = ''
      rendre()
    },
  }
}
