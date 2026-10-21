// Écrans « Contrôle nettoyage » et « Maintenance » : choisir un chantier, puis remplir le formulaire
// (lieu, date, fiche, commentaire, 4 photos).
// - Nettoyage : bouton « Nouveau contrôle », lieu choisi dans des listes, derniers enregistrements dessous.
// - Maintenance (`parPlan`) : comme la déclaration d'incident, sans casiers — plan 3D, étage, puis on touche
//   le vestiaire ou la pièce ; l'onglet Historique liste les derniers enregistrements.
import { h, aujourdhui, depuisGrist, enFrancais, versGrist, ouvrirPanneau, reduirePhoto } from './outils.js'
import { envoyerPhoto, enregistrer } from './donnees.js'
import { cartesChantiers, vueChantier, selectionPourChantier, zonesDuChantier, basesVisibles, lieuRapport } from './navigation.js'

export const NETTOYAGE = {
  titre: 'Contrôle nettoyage', table: 'Controles_nettoyage', nouveau: 'Nouveau contrôle', horaire: true,
  choix: [{ col: 'Type_action', libelle: 'Type d’action', valeurs: ['Contrôle nettoyage', 'Déclarer écart de nettoyage'] }],
}
export const MAINTENANCE = {
  titre: 'Maintenance', table: 'Maintenance', nouveau: 'Nouvelle intervention', horaire: false, parPlan: true,
  choix: [
    { col: 'Action', libelle: 'Action', valeurs: ['Maintenance', 'Aménagement et nouvelle installation'] },
    { col: 'Type', libelle: 'Type', valeurs: ['Plomberie', 'Électricité', 'Manutention', 'Équipement'] },
  ],
}

const NB_PHOTOS = 4

// Écran d'un type de rapport (`config` : NETTOYAGE ou MAINTENANCE), affiché dans `racine`
export function creerEcranRapport(racine, recharger, config) {
  let d = null
  const etat = {
    chantierId: null, zoneId: null, baseId: null, etageId: null, vestiaireId: null, filtre: 'tous',
    vue3d: { rotation: -35, inclinaison: 55 }, onglet: 'declarer',
  }
  let banniere = null
  let minuteur = null

  const duChantier = (chantierId) => d[config.table].filter((r) => r.Chantier === chantierId)

  function rendre() {
    if (!d) return
    if (d.absentes.has(config.table)) {
      racine.replaceChildren(h('h1', null, config.titre),
        h('p', { className: 'message' }, `Ce document n’a pas de table ${config.table}.`))
      return
    }
    if (!etat.chantierId) {
      racine.replaceChildren(...cartesChantiers(d, {
        titre: config.titre,
        stats: (c) => {
          const liste = duChantier(c.id)
          const mois = aujourdhui().slice(0, 7)
          return [
            { type: 'total', valeur: liste.length, libelle: 'Total' },
            { type: 'en_cours', valeur: liste.filter((r) => depuisGrist(r.Date)?.startsWith(mois)).length, libelle: 'Ce mois' },
            { type: 'hs', valeur: liste.filter((r) => !r.Fiche_passage_complete).length, libelle: 'Incomplètes' },
          ]
        },
        onOuvrir: (c) => { Object.assign(etat, { onglet: 'declarer' }, selectionPourChantier(d, c.id)); rendre() },
      }))
      return
    }
    const chantier = d.parId.Chantiers.get(etat.chantierId)
    const entete = [h('div', { className: 'entete-chantier' },
      h('button', { className: 'retour', onClick: () => { etat.chantierId = null; rendre() } }, '‹ Chantiers'),
      h('h1', null, chantier?.Nom ?? ''))]
    const confirmation = banniere ? [banniere] : []

    if (!config.parPlan) {
      racine.replaceChildren(...entete, ...confirmation,
        h('button', { className: 'bouton bouton-principal bouton-nouveau', onClick: () => ouvrirFormulaire() }, `＋ ${config.nouveau}`),
        ...[derniers()].flat())
      return
    }

    const bascule = h('div', { className: 'choix choix-2 bascule-vue' },
      [['declarer', 'Déclarer'], ['historique', 'Historique']].map(([cle, libelle]) =>
        h('button', { className: 'filtre', 'aria-pressed': String(etat.onglet === cle), onClick: () => { etat.onglet = cle; rendre() } }, libelle)))
    racine.replaceChildren(...entete, bascule, ...confirmation,
      ...(etat.onglet === 'historique'
        ? [derniers()].flat()
        : [
          h('p', { className: 'aide-signalement' }, 'Choisis l’étage, puis touche le vestiaire ou la pièce concerné.'),
          ...vueChantier(d, etat, {
            mode: 'lieux',
            onVestiaire: (vestiaire) => ouvrirFormulaire({ vestiaire }),
            onPiece: (piece) => ouvrirFormulaire({ piece }),
            rafraichir: rendre,
          }),
        ]))
  }

  // Zone, base vie, étage et lieu d'un vestiaire ou d'une pièce touché sur le plan
  function lieuChoisi({ vestiaire, piece }) {
    const etage = d.parId.Etages.get((vestiaire ?? piece).Etage)
    const base = etage && d.parId.Bases_vie.get(etage.Base_vie)
    return {
      zoneId: base?.Zone || null, baseId: base?.id ?? null, etageId: etage?.id ?? null,
      lieu: vestiaire ? `v:${vestiaire.id}` : `p:${piece.id}`,
    }
  }

  // ---- Derniers enregistrements du chantier ----

  function derniers() {
    const liste = duChantier(etat.chantierId)
      .sort((a, b) => (depuisGrist(b.Date) ?? '').localeCompare(depuisGrist(a.Date) ?? '') || b.id - a.id)
      .slice(0, 10)
    if (liste.length === 0) return h('p', { className: 'message' }, 'Aucun enregistrement pour ce chantier.')
    return [
      h('h2', { className: 'titre-section' }, 'Derniers enregistrements'),
      h('ul', { className: 'incidents' }, liste.map((r) => {
        const photos = Array.from({ length: NB_PHOTOS }, (_, i) => r[`Photo_${i + 1}`]).filter((p) => Array.isArray(p) && p.length > 1).length
        return h('li', { className: 'rapport' },
          h('span', { className: 'incident-haut' },
            config.choix.map((c) => r[c.col] && h('span', { className: 'incident-categorie' }, r[c.col])),
            h('span', { className: 'incident-date' }, [enFrancais(depuisGrist(r.Date)), r.Horaire_passage].filter(Boolean).join(' · '))),
          h('span', { className: 'incident-lieu' }, lieuRapport(d, etat.chantierId, r)),
          r.Commentaire && h('span', { className: 'incident-description' }, r.Commentaire),
          h('span', { className: 'rapport-pied' },
            h('span', { className: `badge ${r.Fiche_passage_complete ? 'badge-resolu' : 'badge-ouvert'}` },
              r.Fiche_passage_complete ? 'Fiche complète' : 'Fiche incomplète'),
            photos > 0 && h('span', { className: 'incident-lieu' }, `📷 ${photos}`)))
      })),
    ]
  }

  // ---- Formulaire ----

  // Zone → base vie → étage → vestiaire ou pièce ; chaque choix remet les suivants sur leur premier élément.
  // « Toutes les bases vie » / « Tous les étages » enregistrent une base vie / un étage vide.
  // Si `form` arrive déjà rempli (lieu touché sur le plan), les listes partent de ce lieu.
  function selecteurLieu(form) {
    const zones = zonesDuChantier(d, etat.chantierId)
    const bases = () => basesVisibles(d, { chantierId: etat.chantierId, zoneId: form.zoneId })
    const etages = () => d.Etages.filter((e) => e.Base_vie === form.baseId)
    const conteneur = h('div', { className: 'formulaire' })

    // `tous` : libellé de l'option « tous » (valeur vide → null), absente pour la zone
    const liste = (libelle, elements, valeur, onChange, tous) => h('label', { className: 'champ-groupe' }, libelle,
      h('select', { className: 'champ', disabled: elements.length === 0 && !tous, onChange: (e) => onChange(e.target.value ? Number(e.target.value) : null) },
        tous && h('option', { value: '', selected: valeur == null }, tous),
        elements.map((el) => h('option', { value: String(el.id), selected: el.id === valeur }, el.Nom))))

    const choisirZone = (id) => { form.zoneId = id; choisirBase(bases()[0]?.id ?? null) }
    const choisirBase = (id) => { form.baseId = id; choisirEtage(id ? etages()[0]?.id ?? null : null) }
    const choisirEtage = (id) => { form.etageId = id; form.lieu = ''; dessiner() }

    function dessiner() {
      const vestiaires = d.Vestiaires.filter((v) => v.Etage === form.etageId)
      const pieces = d.Pieces.filter((p) => p.Etage === form.etageId)
      conteneur.replaceChildren(...[
        zones.length > 0 && liste('Zone', zones, form.zoneId, choisirZone),
        liste('Base vie', bases(), form.baseId, choisirBase, 'Toutes les bases vie'),
        form.baseId && liste('Étage', etages(), form.etageId, choisirEtage, 'Tous les étages'),
        form.etageId && h('label', { className: 'champ-groupe' }, 'Vestiaire ou pièce',
          h('select', { className: 'champ', onChange: (e) => { form.lieu = e.target.value } },
            h('option', { value: '' }, 'Tout l’étage'),
            vestiaires.length > 0 && h('optgroup', { label: 'Vestiaires' }, vestiaires.map((v) =>
              h('option', { value: `v:${v.id}`, selected: form.lieu === `v:${v.id}` }, v.Nom))),
            pieces.length > 0 && h('optgroup', { label: 'Pièces' }, pieces.map((p) =>
              h('option', { value: `p:${p.id}`, selected: form.lieu === `p:${p.id}` }, p.Nom))))),
      ].filter(Boolean))
    }

    if (form.etageId) dessiner()
    else choisirZone(zones[0]?.id ?? null)
    return conteneur
  }

  // `lieu` : { vestiaire } ou { piece } quand il a été touché sur le plan ; les listes partent alors de ce lieu
  function ouvrirFormulaire(lieu) {
    const form = {
      zoneId: null, baseId: null, etageId: null, lieu: '', ...(lieu ? lieuChoisi(lieu) : {}),
      date: aujourdhui(), horaire: '', complete: false, commentaire: '', photos: [],
    }
    for (const c of config.choix) form[c.col] = ''

    const erreur = h('p', { className: 'erreur', hidden: true })
    const envoyer = h('button', { className: 'bouton bouton-principal', type: 'submit', disabled: true }, 'Enregistrer')
    const majBouton = () => { envoyer.disabled = !(config.choix.every((c) => form[c.col]) && form.date && form.date <= aujourdhui()) }

    const groupesChoix = config.choix.map((c) => {
      const boutons = h('div', { className: `choix ${c.valeurs.length === 3 ? 'choix-3' : 'choix-2'}` }, c.valeurs.map((v) =>
        h('button', { className: 'filtre', type: 'button', 'aria-pressed': 'false', onClick: (e) => {
          form[c.col] = v
          boutons.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget)))
          majBouton()
        } }, v)))
      return h('fieldset', { className: 'groupe' }, h('legend', null, c.libelle), boutons)
    })

    // Photos : jusqu'à 4, ajoutées une par une ou plusieurs à la fois
    const apercu = h('div', { className: 'photos' })
    const fichier = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true })
    const libellePhoto = h('span')
    const boutonPhoto = h('label', { className: 'bouton bouton-photo' }, libellePhoto, fichier)
    const dessinerPhotos = () => {
      apercu.replaceChildren(...form.photos.map((f, i) => h('div', { className: 'photo' },
        h('img', { src: URL.createObjectURL(f), alt: `Photo ${i + 1}`, onLoad: (e) => URL.revokeObjectURL(e.target.src) }),
        h('button', { className: 'photo-retirer', type: 'button', 'aria-label': `Retirer la photo ${i + 1}`,
          onClick: () => { form.photos.splice(i, 1); dessinerPhotos() } }, '✕'))))
      apercu.hidden = form.photos.length === 0
      boutonPhoto.hidden = form.photos.length >= NB_PHOTOS
      libellePhoto.textContent = `📷 Ajouter des photos (${form.photos.length}/${NB_PHOTOS})`
    }
    fichier.addEventListener('change', () => {
      form.photos.push(...[...fichier.files].slice(0, NB_PHOTOS - form.photos.length))
      fichier.value = ''
      dessinerPhotos()
    })
    dessinerPhotos()

    const formulaire = h('form', { className: 'formulaire', onSubmit: async (e) => {
      e.preventDefault()
      if (envoyer.disabled) return
      erreur.hidden = true
      envoyer.disabled = true
      envoyer.textContent = 'Envoi…'
      try {
        const photos = []
        for (const p of form.photos) photos.push(await envoyerPhoto(await reduirePhoto(p)))
        const [genre, lieuId] = form.lieu.split(':')
        await enregistrer(config.table, {
          ...Object.fromEntries(config.choix.map((c) => [c.col, form[c.col]])),
          Chantier: etat.chantierId,
          Zone: form.zoneId ?? 0,
          Base_vie: form.baseId ?? 0,
          Etage: form.etageId ?? 0,
          Vestiaire: genre === 'v' ? Number(lieuId) : 0,
          Piece: genre === 'p' ? Number(lieuId) : 0,
          Date: versGrist(form.date),
          ...(config.horaire ? { Horaire_passage: form.horaire.trim() } : {}),
          Fiche_passage_complete: form.complete,
          Commentaire: form.commentaire.trim(),
          ...Object.fromEntries(photos.map((id, i) => [`Photo_${i + 1}`, ['L', id]])),
        })
        fermer()
        banniere = h('p', { className: 'confirmation', role: 'status' }, 'Enregistré ✓')
        clearTimeout(minuteur)
        minuteur = setTimeout(() => { banniere?.remove(); banniere = null }, 4000)
        await recharger()
      } catch (err) {
        erreur.textContent = err.message || 'L’enregistrement a échoué.'
        erreur.hidden = false
        envoyer.disabled = false
        envoyer.textContent = 'Enregistrer'
      }
    } },
    groupesChoix,
    selecteurLieu(form),
    h('label', { className: 'champ-groupe' }, 'Date',
      h('input', { className: 'champ', type: 'date', value: form.date, max: aujourdhui(), required: true,
        onInput: (e) => { form.date = e.target.value; majBouton() } })),
    config.horaire && h('label', { className: 'champ-groupe' }, 'Horaire de passage',
      h('input', { className: 'champ', placeholder: 'ex. 15h30-17h', autocomplete: 'off', onInput: (e) => { form.horaire = e.target.value } })),
    h('label', { className: 'case' },
      h('input', { type: 'checkbox', onChange: (e) => { form.complete = e.target.checked } }),
      'Fiche de passage complète'),
    h('textarea', { className: 'champ champ-texte', placeholder: 'Commentaire', 'aria-label': 'Commentaire',
      onInput: (e) => { form.commentaire = e.target.value } }),
    boutonPhoto, apercu, erreur, envoyer)

    const chantier = d.parId.Chantiers.get(etat.chantierId)
    const { fermer } = ouvrirPanneau(config.nouveau, [h('p', { className: 'lieu-choisi' }, chantier?.Nom ?? ''), formulaire])
  }

  return {
    // affiche l'écran avec des données à jour
    afficher(donnees) {
      d = donnees
      if (etat.chantierId && !d.parId.Chantiers.has(etat.chantierId)) etat.chantierId = null
      rendre()
    },
    // revient à la liste des chantiers
    accueil() {
      etat.chantierId = null
      rendre()
    },
  }
}
