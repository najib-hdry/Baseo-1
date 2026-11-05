// Widget « Gestion des incidents » : même navigation que les casiers ;
// toucher un casier ou une pièce ouvre le signalement, l'onglet Suivi présente les incidents en tableau.
import { h, icone, aujourdhui, dateHeure, depuisGrist, enFrancais, ouvrirPanneau, etiqueterLignes, fenetreSuppression, galeriePhotos, editeurPhotos, compte, choixEtiquettes } from './outils.js'
import { CATEGORIES, envoyerPhoto, lienPhotos, signaler, changerStatut, resoudreIncident, peutGerer, peutResoudre, estAdmin, idsDeListe, modifierIncident, supprimerIncident, attribuerIncident, nomContact, ROLE_SALARIE, peutModifier, peutAttribuer } from './donnees.js'
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
  const MAX_PHOTOS_INCIDENT = 4 // par incident, avant comme après réparation
  // Pictogramme et couleur de chaque catégorie (boutons du signalement)
  const PICTOS_CATEGORIES = { Plomberie: ['goutte', '#007EBD'], Électricité: ['eclair', '#D99A00'], Serrure: ['cadenas', '#3D5A73'],
    Propreté: ['nettoyage', '#1F8A4C'], Sécurité: ['casque', '#C8382E'], Autre: ['question', '#5B6B78'] }
  const chantierIncident = (i) => {
    const casier = d.parId.Casiers.get(i.Casier)
    const piece = d.parId.Pieces.get(i.Piece)
    return casier?.Chantier ?? piece?.Chantier ?? i.Chantier
  }
  const photoId = (v) => idsDeListe(v)[0] ?? null

  function rendre() {
    if (!d) return
    if (!etat.chantierId) {
      racine.replaceChildren(...cartesChantiers(d, {
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
          Object.assign(etat, { filtre: 'tous', onglet: peutModifier(d, 'incidents') ? 'signaler' : 'suivi', filtreSuivi: 'actifs', rechercheSuivi: '' }, selectionPourChantier(d, c.id))
          rendre()
        },
      }))
      return
    }

    const chantier = d.parId.Chantiers.get(etat.chantierId)
    // Lecture (RH, Client) : pas d'onglet Signaler, le suivi seulement
    if (!peutModifier(d, 'incidents')) etat.onglet = 'suivi'
    const bascule = !peutModifier(d, 'incidents') ? h('div', { hidden: true }) : h('div', { className: 'choix choix-2 bascule-vue' },
      [['signaler', 'Signaler'], ['suivi', 'Suivi']].map(([cle, libelle]) =>
        h('button', { className: 'filtre', 'aria-pressed': String(etat.onglet === cle), onClick: () => { etat.onglet = cle; rendre() } }, libelle)))

    const entete = [
      h('div', { className: 'entete-chantier' },
        h('button', { className: 'retour', onClick: () => { etat.chantierId = null; rendre() } }, '‹ Incidents'),
        h('h1', null, chantier?.Nom ?? '')),
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
    const form = { element: '', categorie: '', description: '' }
    const erreur = h('p', { className: 'erreur', hidden: true })
    const envoyer = h('button', { className: 'bouton bouton-principal', type: 'submit', disabled: true }, 'Envoyer')
    const majBouton = () => { envoyer.disabled = !(form.categorie && form.description.trim()) }

    const categories = h('div', { className: 'presence-tuiles' }, CATEGORIES.map((cat) => {
      const [picto, couleur] = PICTOS_CATEGORIES[cat] ?? ['question', '#5B6B78']
      const b = h('button', { className: 'presence-tuile', type: 'button', 'aria-pressed': 'false', style: { '--couleur': couleur } },
        h('span', { className: 'presence-tuile-picto' }, icone(picto, 30)), h('span', null, cat))
      b.addEventListener('click', () => {
        form.categorie = cat
        categories.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)))
        majBouton()
      })
      return b
    }))

    const photos = editeurPhotos({ max: MAX_PHOTOS_INCIDENT, libelle: 'Photos' })

    const formulaire = h('form', { className: 'formulaire', onSubmit: async (e) => {
      e.preventDefault()
      if (envoyer.disabled) return
      erreur.hidden = true
      envoyer.disabled = true
      envoyer.textContent = 'Envoi…'
      try {
        await signaler({ casierId: casier?.id, pieceId: piece?.id, element: piece ? form.element.trim() : '',
          categorie: form.categorie, description: form.description.trim(), photos: await photos.ids(envoyerPhoto) })
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
    photos.element, erreur, envoyer)

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

  // Boutons de changement de statut d'un incident : toutes les actions pour le chef d'équipe et l'admin ;
  // « Marquer résolu » seulement pour un salarié autorisé (« Gestion des incidents autorisée ») ; aucun sinon.
  // `apres` : appelé après l'écriture réussie, `surErreur(message)` en cas d'échec ;
  // « Marquer résolu » ouvre la fenêtre de résolution (photos et commentaire), par `ouvrirDepuis` depuis une fiche
  const actionsStatut = (i) => (peutGerer(d) ? ACTIONS[i.Statut] ?? ACTIONS.Ouvert
    : peutResoudre(d) && i.Statut !== 'Résolu' ? [['Résolu', 'Marquer résolu', 'bouton-principal']] : [])
  const boutonsStatut = (i, { compact = false, apres = () => {}, surErreur, ouvrirDepuis = (ouvrir) => ouvrir() }) =>
    actionsStatut(i).map(([statut, libelle, classe]) => {
      const b = h('button', { className: `bouton ${classe}${compact ? ' bouton-compact' : ''}` }, libelle)
      b.addEventListener('click', async (ev) => {
        ev.stopPropagation() // dans le tableau, le clic ne doit pas ouvrir le détail
        if (statut === 'Résolu') return ouvrirDepuis(() => ouvrirResolution(i))
        b.disabled = true
        try {
          await changerStatut(i.id, statut, aujourdhui())
          apres()
          await recharger()
        } catch {
          surErreur('La modification a échoué.')
          b.disabled = false
        }
      })
      return b
    })

  const TITRES_SUIVI = ['Photo', 'Signalé le', 'Lieu', 'Catégorie', 'Description', 'Statut', 'Attribué à', 'Résolu le', '']

  // Salariés qui ont une tâche liée à l'incident (tâches de l'emploi du temps), dans l'ordre des créneaux
  const tachesIncident = (i) => (d.Emploi_du_temps ?? []).filter((t) => t.Incident === i.id).sort((a, b) => (a.Date_debut ?? 0) - (b.Date_debut ?? 0))
  const nomSalarie = (id) => {
    const u = d.parId.Utilisateurs.get(id)
    const c = d.Candidats?.find((x) => x.Utilisateur === id)
    return nomContact(u) || (c && nomContact(c)) || u?.Email || 'Sans nom'
  }
  const attribuesA = (i) => [...new Set(tachesIncident(i).map((t) => nomSalarie(t.Salarie)))].join(', ')

  // Suivi : tableau des incidents du chantier (filtres en onglets, recherche, actions sur chaque ligne)
  async function rendreSuivi(zone) {
    const incidents = d.Incidents
      .filter((i) => chantierIncident(i) === etat.chantierId)
      .sort((a, b) => (b.Signale_le ?? 0) - (a.Signale_le ?? 0))
    const lien = await lienPhotos().catch(() => null)
    // Lieu calculé une fois par incident (et non à chaque frappe dans la recherche)
    const lieux = new Map(incidents.map((i) => [i.id, libelleLieu(d, { casier: d.parId.Casiers.get(i.Casier), piece: d.parId.Pieces.get(i.Piece), element: i.Element })]))
    const lieu = (i) => lieux.get(i.id)
    const corps = h('tbody')
    const compteur = h('p', { className: 'sous-texte' })
    const erreur = h('p', { className: 'erreur', hidden: true })

    // Ne redessine que les lignes : le champ de recherche garde le curseur
    const dessinerLignes = () => {
      const filtre = FILTRES_SUIVI.find((f) => f.cle === etat.filtreSuivi)
      const texte = (etat.rechercheSuivi ?? '').trim().toLowerCase()
      const visibles = incidents.filter(filtre.garde)
        .filter((i) => !texte || [lieu(i), i.Categorie, i.Description, i.Statut, attribuesA(i)].some((v) => String(v ?? '').toLowerCase().includes(texte)))
      compteur.textContent = compte(visibles.length, incidents.filter(filtre.garde).length, 'incident')
      corps.replaceChildren(...(visibles.length === 0
        ? [h('tr', null, h('td', { className: 'tableau-vide', colSpan: TITRES_SUIVI.length },
          texte ? 'Aucun incident ne correspond à la recherche.' : etat.filtreSuivi === 'actifs' ? 'Aucun incident à traiter.' : 'Aucun incident dans cette catégorie.'))]
        : visibles.map((i) => {
          const pid = photoId(i.Photo)
          const resolu = depuisGrist(i.Resolu_le)
          const sansClic = (fn) => (ev) => { ev.stopPropagation(); fn() } // un bouton de la ligne n'ouvre pas aussi la fiche
          return h('tr', { className: 'tableau-ligne', title: 'Voir la fiche', onClick: () => ouvrirDetail(i, lieu(i), lien) },
            h('td', null, pid && lien ? h('img', { className: 'tableau-photo', src: lien(pid), alt: 'Photo', loading: 'lazy' }) : '—'),
            h('td', null, i.Signale_le ? dateHeure(i.Signale_le) : '—'),
            h('td', { className: 'tableau-nom' }, lieu(i)),
            h('td', null, i.Categorie ?? ''),
            h('td', null, h('span', { className: 'cellule-description' }, i.Description ?? '')),
            h('td', null, h('span', { className: `badge badge-${STATUTS[i.Statut] ?? 'ouvert'}` }, i.Statut ?? 'Ouvert')),
            h('td', null, attribuesA(i) || '—'),
            h('td', null, resolu ? enFrancais(resolu) : '—'),
            // Action principale du statut, puis fiche, modification et suppression
            h('td', { className: 'tableau-actions' },
              boutonsStatut(i, { compact: true, surErreur: (m) => { erreur.textContent = m; erreur.hidden = false } }).slice(0, 1),
              h('button', { className: 'bouton bouton-compact', onClick: sansClic(() => ouvrirDetail(i, lieu(i), lien)) }, 'Fiche'),
              peutGerer(d) && h('button', { className: 'bouton bouton-compact', onClick: sansClic(() => ouvrirModification(i, lieu(i), lien)) }, 'Modifier'),
              estAdmin(d) && h('button', { className: 'bouton bouton-compact bouton-danger', onClick: sansClic(() => ouvrirSuppression(i, lieu(i))) }, 'Supprimer')))
        })))
      etiqueterLignes(corps, TITRES_SUIVI)
    }
    dessinerLignes()

    // Onglets de filtre : seules les lignes sont redessinées
    const onglets = h('div', { className: 'onglets onglets-statut', role: 'tablist', 'aria-label': 'Filtrer les incidents' },
      FILTRES_SUIVI.map((f) => h('button', { className: 'onglet', role: 'tab', 'aria-selected': String(f.cle === etat.filtreSuivi),
        onClick: (e) => {
          etat.filtreSuivi = f.cle
          onglets.querySelectorAll('[role="tab"]').forEach((b) => b.setAttribute('aria-selected', String(b === e.currentTarget)))
          dessinerLignes()
        } }, `${f.libelle} (${incidents.filter(f.garde).length})`)))
    zone.replaceChildren(h('section', { className: 'carte-tableau' },
      h('div', { className: 'barre-outils' }, onglets,
        h('input', { className: 'champ champ-compact', type: 'search', placeholder: 'Rechercher (lieu, catégorie, description…)', value: etat.rechercheSuivi ?? '',
          'aria-label': 'Rechercher un incident', onInput: (e) => { etat.rechercheSuivi = e.target.value; dessinerLignes() } })),
      compteur, erreur,
      h('div', { className: 'tableau-defilant' },
        h('table', { className: 'tableau' },
          h('thead', null, h('tr', null, TITRES_SUIVI.map((t) => h('th', null, t)))),
          corps))))
  }

  // Fiche d'un incident : informations, toutes les photos, actions
  function ouvrirDetail(i, lieu, lien) {
    const erreur = h('p', { className: 'erreur', hidden: true })
    // Le salarié consulte la fiche sans changer le statut
    const boutons = boutonsStatut(i, { apres: () => fermer(), surErreur: (m) => { erreur.textContent = m; erreur.hidden = false }, ouvrirDepuis: (o) => ouvrirDepuis(o) })
    const resolu = depuisGrist(i.Resolu_le)
    const ids = idsDeListe(i.Photo)
    const idsResolution = idsDeListe(i.Photos_resolution)
    const infos = [
      ['Statut', h('span', { className: `badge badge-${STATUTS[i.Statut] ?? 'ouvert'}` }, i.Statut ?? 'Ouvert')],
      ['Lieu', lieu],
      ['Catégorie', i.Categorie || '—'],
      ['Description', i.Description || '—'],
      ['Signalé le', i.Signale_le ? dateHeure(i.Signale_le) : '—'],
      ['Signalé par', i.Signale_par || '—'],
      ['Résolu le', resolu ? enFrancais(resolu) : '—'],
      ['Commentaire de résolution', i.Commentaire_resolution || '—'],
    ]
    const taches = tachesIncident(i)
    const creneau = (t) => `${dateHeure(t.Date_debut)}${t.Date_fin ? ` → ${new Date(t.Date_fin * 1000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : ''}`
    const { fermer, ouvrirDepuis, section } = ouvrirPanneau(`Incident · ${i.Categorie ?? ''}`, [
      h('dl', { className: 'fiche-infos' }, infos.map(([terme, valeur]) => [h('dt', null, terme), h('dd', null, valeur)])),
      h('h3', { className: 'titre-section' }, `Attribué à (${taches.length})`),
      taches.length === 0 ? h('p', { className: 'sous-texte' }, 'Personne pour l’instant.')
        : h('ul', { className: 'liste-attribution' }, taches.map((t) => h('li', null, h('strong', null, nomSalarie(t.Salarie)), ` · ${creneau(t)}`))),
      h('h3', { className: 'titre-section' }, `Photos du signalement (${ids.length})`),
      galeriePhotos(ids, lien),
      (idsResolution.length > 0 || i.Statut === 'Résolu') && [
        h('h3', { className: 'titre-section' }, `Photos de la résolution (${idsResolution.length})`),
        galeriePhotos(idsResolution, lien)],
      erreur,
      h('div', { className: 'fiche-boutons' }, ...boutons,
        peutAttribuer(d) && i.Statut !== 'Résolu' && h('button', { className: 'bouton bouton-principal', onClick: () => ouvrirDepuis(() => ouvrirAttribution(i, lieu)) }, 'Attribuer à des salariés'),
        peutGerer(d) && h('button', { className: 'bouton', onClick: () => ouvrirDepuis(() => ouvrirModification(i, lieu, lien)) }, 'Modifier'),
        estAdmin(d) && h('button', { className: 'bouton bouton-danger', onClick: () => ouvrirDepuis(() => ouvrirSuppression(i, lieu)) }, 'Supprimer')),
    ])
    section.classList.add('panneau-large')
  }

  // Attribution : salariés (ceux du chantier de l'incident d'abord), date, heures, consigne ; une tâche par salarié
  function ouvrirAttribution(i, lieu) {
    const duChantier = (u) => idsDeListe(u.Chantiers).includes(i.Chantier)
    const choix = choixEtiquettes({
      elements: () => d.Utilisateurs.filter((u) => u.Profil === ROLE_SALARIE && u.Actif)
        .sort((a, b) => duChantier(b) - duChantier(a))
        .map((u) => ({ id: u.id, libelle: `${nomSalarie(u.id)}${duChantier(u) ? '' : ' (autre chantier)'}` })),
      textes: { aucun: 'Aucun salarié choisi.', choisir: 'Ajouter un salarié…', tous: 'Tous les salariés sont ajoutés', vide: 'Aucun salarié actif' },
    })
    const demain = new Date(Date.now() + 86400000)
    const z = (n) => String(n).padStart(2, '0')
    const champs = { jour: `${demain.getFullYear()}-${z(demain.getMonth() + 1)}-${z(demain.getDate())}`, debut: '08:00', fin: '10:00', consigne: '' }
    const erreur = h('p', { className: 'erreur', hidden: true })
    const valider = h('button', { className: 'bouton bouton-principal', type: 'submit' }, 'Attribuer')
    const groupe = (libelle, champ) => h('label', { className: 'champ-groupe' }, libelle, champ)
    const saisie = (cle, type) => h('input', { className: 'champ', type, required: true, value: champs[cle], onInput: (e) => { champs[cle] = e.target.value } })
    const formulaire = h('form', { className: 'formulaire', onSubmit: async (e) => {
      e.preventDefault()
      erreur.hidden = true
      const debut = new Date(`${champs.jour}T${champs.debut}`)
      const fin = new Date(`${champs.jour}T${champs.fin}`)
      const probleme = choix.ids().length === 0 ? 'Choisis au moins un salarié.'
        : Number.isNaN(debut.getTime()) || Number.isNaN(fin.getTime()) ? 'Indique la date et les heures.'
          : fin <= debut ? 'L’heure de fin doit être après l’heure de début.' : null
      if (probleme) {
        erreur.textContent = probleme
        erreur.hidden = false
        return
      }
      valider.disabled = true
      try {
        await attribuerIncident(d, i, choix.ids(), debut.getTime() / 1000, fin.getTime() / 1000, champs.consigne.trim())
        fermer()
        await recharger()
      } catch (err) {
        erreur.textContent = err.message || 'L’attribution a échoué.'
        erreur.hidden = false
        valider.disabled = false
      }
    } },
    h('p', { className: 'sous-texte' }, `${lieu} · ${i.Description || i.Categorie || ''}`),
    h('div', { className: 'champ-groupe' }, 'Salariés (une tâche est créée dans l’emploi du temps de chacun)', choix.element),
    h('div', { className: 'grille-2' }, groupe('Date *', saisie('jour', 'date')), h('div', { className: 'grille-2' }, groupe('De *', saisie('debut', 'time')), groupe('À *', saisie('fin', 'time')))),
    groupe('Consigne', h('textarea', { className: 'champ champ-texte', placeholder: 'Ce qu’il faut faire, le matériel à prévoir…', onInput: (e) => { champs.consigne = e.target.value } })),
    erreur, valider)
    const { fermer, section } = ouvrirPanneau('Attribuer l’incident', formulaire)
    section.classList.add('panneau-large')
  }

  // Résolution : photos d'après et commentaire (facultatifs), puis statut Résolu daté d'aujourd'hui
  function ouvrirResolution(i) {
    let commentaire = ''
    const photos = editeurPhotos({ max: MAX_PHOTOS_INCIDENT, libelle: 'Photos après réparation' })
    const erreur = h('p', { className: 'erreur', hidden: true })
    const valider = h('button', { className: 'bouton bouton-principal', type: 'submit' }, 'Confirmer la résolution')
    const formulaire = h('form', { className: 'formulaire', onSubmit: async (e) => {
      e.preventDefault()
      erreur.hidden = true
      valider.disabled = true
      valider.textContent = 'Enregistrement…'
      try {
        await resoudreIncident(i.id, { photos: await photos.ids(envoyerPhoto), commentaire: commentaire.trim() }, aujourdhui())
        fermer()
        await recharger()
      } catch (err) {
        erreur.textContent = err.message || 'La résolution n’a pas pu être enregistrée.'
        erreur.hidden = false
        valider.disabled = false
        valider.textContent = 'Confirmer la résolution'
      }
    } },
    h('p', { className: 'lieu-choisi' }, [i.Categorie || 'Incident', i.Lieu].filter(Boolean).join(' · ')),
    h('label', { className: 'champ-groupe' }, 'Commentaire',
      h('textarea', { className: 'champ champ-texte', placeholder: 'Ex. : serrure changée', onInput: (e) => { commentaire = e.target.value } })),
    photos.element, erreur, valider)
    const { fermer } = ouvrirPanneau('Marquer résolu', formulaire)
  }

  // Modification : catégorie, élément (pièce), description, statut, photos et commentaire de résolution
  function ouvrirModification(i, lieu, lien) {
    const champs = { Categorie: i.Categorie ?? '', Element: i.Element ?? '', Description: i.Description ?? '', Statut: i.Statut || 'Ouvert',
      Commentaire_resolution: i.Commentaire_resolution ?? '' }
    const photos = editeurPhotos({ ids: idsDeListe(i.Photo), lien, max: MAX_PHOTOS_INCIDENT, libelle: 'Photos du signalement' })
    const photosResolution = editeurPhotos({ ids: idsDeListe(i.Photos_resolution), lien, max: MAX_PHOTOS_INCIDENT, libelle: 'Photos de la résolution' })
    const erreur = h('p', { className: 'erreur', hidden: true })
    const valider = h('button', { className: 'bouton bouton-principal', type: 'submit' }, 'Enregistrer')
    const choix = (libelle, cle, valeurs) => h('label', { className: 'champ-groupe' }, libelle,
      h('select', { className: 'champ', onChange: (e) => { champs[cle] = e.target.value } },
        valeurs.map((v) => h('option', { value: v, selected: champs[cle] === v }, v))))

    const formulaire = h('form', { className: 'formulaire', onSubmit: async (e) => {
      e.preventDefault()
      erreur.hidden = true
      valider.disabled = true
      valider.textContent = 'Enregistrement…'
      try {
        const nouvellesPhotos = photos.modifie() ? await photos.ids(envoyerPhoto) : null
        const nouvellesResolution = photosResolution.modifie() ? await photosResolution.ids(envoyerPhoto) : null
        await modifierIncident(i, { ...champs, Element: champs.Element.trim(), Description: champs.Description.trim(),
          Commentaire_resolution: champs.Commentaire_resolution.trim() || null, photos: nouvellesPhotos, photosResolution: nouvellesResolution }, aujourdhui())
        fermer()
        await recharger()
      } catch (err) {
        erreur.textContent = err.message || 'La modification a échoué.'
        erreur.hidden = false
        valider.disabled = false
        valider.textContent = 'Enregistrer'
      }
    } },
    h('p', { className: 'lieu-choisi' }, lieu),
    h('div', { className: 'grille-2' }, choix('Catégorie', 'Categorie', CATEGORIES), choix('Statut', 'Statut', Object.keys(STATUTS))),
    i.Piece ? h('label', { className: 'champ-groupe' }, 'Élément (lavabo, porte, lumière…)',
      h('input', { className: 'champ', autocomplete: 'off', value: champs.Element, onInput: (e) => { champs.Element = e.target.value } })) : null,
    h('label', { className: 'champ-groupe' }, 'Description',
      h('textarea', { className: 'champ champ-texte', value: champs.Description, onInput: (e) => { champs.Description = e.target.value } })),
    photos.element,
    h('label', { className: 'champ-groupe' }, 'Commentaire de résolution',
      h('textarea', { className: 'champ champ-texte', value: champs.Commentaire_resolution, onInput: (e) => { champs.Commentaire_resolution = e.target.value } })),
    photosResolution.element,
    erreur, valider)
    const { fermer, section } = ouvrirPanneau('Modifier l’incident', formulaire)
    section.classList.add('panneau-large')
  }

  function ouvrirSuppression(i, lieu) {
    fenetreSuppression(`Supprimer cet incident ?`, [
      h('p', null, `${i.Categorie ?? 'Incident'} · ${lieu}`),
      i.Description && h('p', { className: 'sous-texte' }, i.Description),
    ].filter(Boolean), [['Supprimer définitivement', 'bouton-danger', () => supprimerIncident(i.id)]], recharger)
  }

  return {
    // affiche l'écran avec des données à jour
    afficher(donnees) {
      d = donnees
      if (etat.chantierId && !d.parId.Chantiers.has(etat.chantierId)) etat.chantierId = null
      rendre()
    },
    // dessine dans `zone` le tableau de suivi des incidents de `chantierId` (onglet de la fiche chantier)
    tableauDuChantier(zone, donnees, chantierId) {
      d = donnees
      if (etat.chantierId !== chantierId) Object.assign(etat, { chantierId, filtreSuivi: 'actifs', rechercheSuivi: '' })
      return rendreSuivi(zone)
    },
    // revient à la liste des chantiers, ou ouvre le suivi des incidents de `chantierId` (tuile du Tableau de bord)
    accueil({ chantierId } = {}) {
      etat.chantierId = null
      if (chantierId && d?.parId.Chantiers.has(chantierId)) {
        Object.assign(etat, { filtre: 'tous', onglet: 'suivi', filtreSuivi: 'actifs', rechercheSuivi: '' }, selectionPourChantier(d, chantierId))
      }
      rendre()
    },
  }
}
