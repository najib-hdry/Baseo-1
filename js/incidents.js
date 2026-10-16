// Widget « Gestion des incidents » : même navigation que les casiers ;
// toucher un casier ou une pièce ouvre le signalement, l'onglet Suivi liste les incidents.
import { h, aujourdhui, dateHeure, depuisGrist, enFrancais, ouvrirPanneau, reduirePhoto } from './outils.js'
import { CATEGORIES, envoyerPhoto, lienPhotos, signaler, changerStatut } from './donnees.js'
import { cartesChantiers, vueChantier, selectionPourChantier, libelleLieu } from './navigation.js'

// Écran « Gestion des incidents », affiché dans `racine` ; `recharger()` relit les données après une écriture
export function creerEcranIncidents(racine, recharger) {
  let d = null

  const etat = {
    chantierId: null, zoneId: null, baseId: null, etageId: null, vestiaireId: null, filtre: 'tous',
    vue3d: { rotation: -35, inclinaison: 55 },
    onglet: 'signaler', filtreSuivi: 'actifs', confirmation: false,
  }

  const STATUTS = { Ouvert: 'ouvert', 'En cours': 'en_cours', Résolu: 'resolu' }
  const chantierIncident = (i) => {
    const casier = d.parId.Casiers.get(i.Casier)
    const piece = d.parId.Pieces.get(i.Piece)
    return casier?.Chantier ?? piece?.Chantier ?? i.Chantier
  }
  const photoId = (v) => (Array.isArray(v) ? v.filter((x) => x !== 'L')[0] : null)

  function rendre() {
    if (!d) return
    if (!etat.chantierId) {
      racine.replaceChildren(...cartesChantiers(d, {
        titre: 'Gestion des incidents',
        stats: (c) => {
          const liste = d.Incidents.filter((i) => chantierIncident(i) === c.id)
          const n = (s) => liste.filter((i) => i.Statut === s).length
          return [
            { type: 'ouverts', valeur: n('Ouvert'), libelle: 'Ouverts' },
            { type: 'en_cours', valeur: n('En cours'), libelle: 'En cours' },
            { type: 'resolus', valeur: n('Résolu'), libelle: 'Résolus' },
          ]
        },
        onOuvrir: (c) => {
          Object.assign(etat, { filtre: 'tous', onglet: 'signaler' }, selectionPourChantier(d, c.id))
          rendre()
        },
      }))
      return
    }

    const chantier = d.parId.Chantiers.get(etat.chantierId)
    const bascule = h('div', { className: 'choix choix-2 bascule-vue' },
      [['signaler', 'Signaler'], ['suivi', 'Suivi']].map(([cle, libelle]) =>
        h('button', { className: 'filtre', 'aria-pressed': String(etat.onglet === cle), onClick: () => { etat.onglet = cle; rendre() } }, libelle)))

    const entete = [
      h('button', { className: 'retour', onClick: () => { etat.chantierId = null; rendre() } }, '‹ Incidents'),
      h('h1', null, chantier?.Nom ?? ''),
      bascule,
    ]

    if (etat.onglet === 'suivi') {
      const zone = h('div')
      racine.replaceChildren(...entete, zone)
      rendreSuivi(zone)
      return
    }

    // Lieux qui ont un incident non résolu : pastille « ! »
    const actifs = d.Incidents.filter((i) => i.Statut !== 'Résolu')
    const marques = { casiers: new Set(actifs.map((i) => i.Casier).filter(Boolean)), pieces: new Set(actifs.map((i) => i.Piece).filter(Boolean)) }
    racine.replaceChildren(...entete,
      h('p', { className: 'aide-signalement' }, 'Choisis l’étage, puis touche le casier ou la pièce concerné.'),
      ...(etat.confirmation ? [h('p', { className: 'confirmation', role: 'status' }, 'Incident signalé ✓')] : []),
      ...vueChantier(d, etat, {
        mode: 'incidents', marques,
        onCasier: (casier) => ouvrirSignalement({ casier }),
        onPiece: (piece) => ouvrirSignalement({ piece }),
        rafraichir: rendre,
      }))
  }

  // ---- Signalement ----

  function ouvrirSignalement({ casier, piece }) {
    const form = { element: '', categorie: '', description: '', photo: null }
    const erreur = h('p', { className: 'erreur', hidden: true })
    const envoyer = h('button', { className: 'bouton bouton-principal', type: 'submit', disabled: true }, 'Envoyer')
    const majBouton = () => { envoyer.disabled = !(form.categorie && form.description.trim()) }

    const categories = h('div', { className: 'choix choix-3' }, CATEGORIES.map((cat) => {
      const b = h('button', { className: 'filtre', type: 'button', 'aria-pressed': 'false' }, cat)
      b.addEventListener('click', () => {
        form.categorie = cat
        categories.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)))
        majBouton()
      })
      return b
    }))

    const apercu = h('div', { className: 'apercu', hidden: true })
    const fichier = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true })
    const libellePhoto = h('span', null, '📷 Ajouter une photo')
    fichier.addEventListener('change', () => {
      form.photo = fichier.files?.[0] ?? null
      libellePhoto.textContent = form.photo ? 'Changer la photo' : '📷 Ajouter une photo'
      apercu.hidden = !form.photo
      if (form.photo) apercu.replaceChildren(h('img', { src: URL.createObjectURL(form.photo), alt: 'Aperçu de la photo' }),
        h('button', { className: 'bouton bouton-discret-clair', type: 'button', onClick: () => { form.photo = null; fichier.value = ''; apercu.hidden = true; libellePhoto.textContent = '📷 Ajouter une photo' } }, 'Retirer la photo'))
    })

    const formulaire = h('form', { className: 'formulaire', onSubmit: async (e) => {
      e.preventDefault()
      if (envoyer.disabled) return
      erreur.hidden = true
      envoyer.disabled = true
      envoyer.textContent = 'Envoi…'
      try {
        const photoId = form.photo ? await envoyerPhoto(await reduirePhoto(form.photo)) : null
        await signaler({ casierId: casier?.id, pieceId: piece?.id, element: piece ? form.element.trim() : '',
          categorie: form.categorie, description: form.description.trim(), photoId })
        fermer()
        etat.confirmation = true
        setTimeout(() => { etat.confirmation = false; rendre() }, 4000)
        await recharger()
      } catch (err) {
        erreur.textContent = err.message || 'L’incident n’a pas pu être enregistré.'
        erreur.hidden = false
        envoyer.disabled = false
        envoyer.textContent = 'Envoyer'
      }
    } },
    piece && h('input', { className: 'champ', placeholder: 'Élément (lavabo, porte, lumière…) — facultatif', 'aria-label': 'Élément concerné',
      onInput: (e) => { form.element = e.target.value } }),
    h('fieldset', { className: 'groupe' }, h('legend', null, 'Catégorie'), categories),
    h('textarea', { className: 'champ champ-texte', placeholder: 'Décris le problème', 'aria-label': 'Description',
      onInput: (e) => { form.description = e.target.value; majBouton() } }),
    h('label', { className: 'bouton bouton-photo' }, libellePhoto, fichier),
    apercu, erreur, envoyer)

    const { fermer } = ouvrirPanneau('Signaler un incident', [
      h('p', { className: 'lieu-choisi' }, libelleLieu(d, { casier, piece })),
      formulaire,
    ])
  }

  // ---- Suivi ----

  const FILTRES_SUIVI = [
    { cle: 'actifs', libelle: 'À traiter', garde: (i) => i.Statut !== 'Résolu' },
    { cle: 'resolu', libelle: 'Résolus', garde: (i) => i.Statut === 'Résolu' },
    { cle: 'tous', libelle: 'Tous', garde: () => true },
  ]
  const ACTIONS = {
    Ouvert: [['En cours', 'Prendre en charge', 'bouton-principal'], ['Résolu', 'Marquer résolu', '']],
    'En cours': [['Résolu', 'Marquer résolu', 'bouton-principal']],
    Résolu: [['Ouvert', 'Rouvrir', '']],
  }

  async function rendreSuivi(zone) {
    const incidents = d.Incidents
      .filter((i) => chantierIncident(i) === etat.chantierId)
      .sort((a, b) => (b.Signale_le ?? 0) - (a.Signale_le ?? 0))
    const filtre = FILTRES_SUIVI.find((f) => f.cle === etat.filtreSuivi)
    const visibles = incidents.filter(filtre.garde)
    const lien = await lienPhotos().catch(() => null)
    const lieu = (i) => libelleLieu(d, { casier: d.parId.Casiers.get(i.Casier), piece: d.parId.Pieces.get(i.Piece), element: i.Element })

    zone.replaceChildren(
      h('div', { className: 'filtres' }, FILTRES_SUIVI.map((f) =>
        h('button', { className: 'filtre', 'aria-pressed': String(f.cle === etat.filtreSuivi), onClick: () => { etat.filtreSuivi = f.cle; rendre() } },
          `${f.libelle} ${incidents.filter(f.garde).length}`))),
      visibles.length === 0
        ? h('p', { className: 'message' }, etat.filtreSuivi === 'actifs' ? 'Aucun incident à traiter.' : 'Aucun incident dans cette catégorie.')
        : h('ul', { className: 'incidents' }, visibles.map((i) => {
          const pid = photoId(i.Photo)
          return h('li', null, h('button', { className: 'incident', onClick: () => ouvrirDetail(i, lieu(i), pid && lien?.(pid)) },
            pid && lien && h('img', { className: 'incident-photo', src: lien(pid), alt: '', loading: 'lazy' }),
            h('span', { className: 'incident-corps' },
              h('span', { className: 'incident-haut' },
                h('span', { className: `badge badge-${STATUTS[i.Statut] ?? 'ouvert'}` }, i.Statut ?? 'Ouvert'),
                h('span', { className: 'incident-categorie' }, i.Categorie ?? ''),
                h('span', { className: 'incident-date' }, i.Signale_le ? dateHeure(i.Signale_le) : '')),
              h('span', { className: 'incident-lieu' }, lieu(i)),
              h('span', { className: 'incident-description' }, i.Description ?? ''))))
        })))
  }

  function ouvrirDetail(i, lieu, photo) {
    const erreur = h('p', { className: 'erreur', hidden: true })
    const boutons = (ACTIONS[i.Statut] ?? ACTIONS.Ouvert).map(([statut, libelle, classe]) => {
      const b = h('button', { className: `bouton ${classe}` }, libelle)
      b.addEventListener('click', async () => {
        b.disabled = true
        try {
          await changerStatut(i.id, statut, aujourdhui())
          fermer()
          await recharger()
        } catch {
          erreur.textContent = 'La modification a échoué.'
          erreur.hidden = false
          b.disabled = false
        }
      })
      return b
    })
    const resolu = depuisGrist(i.Resolu_le)
    const { fermer } = ouvrirPanneau(i.Categorie ?? 'Incident', [
      h('p', null, h('span', { className: `badge badge-${STATUTS[i.Statut] ?? 'ouvert'}` }, i.Statut ?? 'Ouvert')),
      h('p', { className: 'incident-lieu' }, lieu),
      h('p', null, i.Description ?? ''),
      h('p', { className: 'sous-texte' },
        `Signalé le ${i.Signale_le ? dateHeure(i.Signale_le) : '—'}${i.Signale_par ? ` par ${i.Signale_par}` : ''}${resolu ? ` · résolu le ${enFrancais(resolu)}` : ''}`),
      photo && h('a', { href: photo, target: '_blank', rel: 'noreferrer' }, h('img', { className: 'detail-photo', src: photo, alt: 'Photo de l’incident' })),
      erreur,
      ...boutons,
    ])
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
