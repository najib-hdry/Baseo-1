// Écran « Gestion des utilisateurs » (admin) : onglets par rôle (Salarié en premier, Tous en dernier), tableau avec recherche,
// fiche de création / modification (identité, rôle, chantiers, actif), suppression,
// fiche salarié en onglets (infos du candidat lié à l'embauche, contrats et suivi d'insertion du salarié ;
// détail du salarié : le candidat en lecture ; emploi du temps : calendrier du mois et tableau des tâches ; compte).
import { h, ouvrirPanneau, etiqueterLignes, lienContact, fenetreSuppression, choixEtiquettes, dateAvecAlerte, enFrancais, depuisGrist, versGrist, aujourdhui, icone, zoneFichier } from './outils.js'
import { blocsCandidatLecture } from './candidats.js'
import { ouvrirImportTaches, telechargerModeleTaches, ouvrirAjoutTache } from './taches.js'
import { estAdmin, ROLES, ROLE_SALARIE, enregistrerUtilisateur, supprimerFiche, idsDeListe, nomContact, lienPhotos, envoyerPhoto, enregistrerContrat, ajouterSuiviInsertion, supprimerTaches } from './donnees.js'

const TITRES_UTILISATEURS = ['Utilisateur', 'Rôle', 'Téléphone', 'Email', 'Chantiers', 'Actif', '']
const SANS_ROLE = '—' // onglet des utilisateurs sans rôle (ils n'ont pas accès à l'application)
const TITRES_CONTRATS = ['N° de contrat', 'Sites', 'Intitulé de poste', 'Date début', 'Date fin', 'Contrat', 'DPAE', '']
// Fichiers d'un contrat : [colonne, libellé]
const FICHIERS_CONTRAT = [['Fichier_contrat', 'Contrat'], ['Fichier_DPAE', 'DPAE']]

// `modifierCandidat(id)` : ouvre le formulaire du candidat (page Gestion des candidats)
export function creerEcranUtilisateurs(racine, recharger, modifierCandidat) {
  let d = null
  let recherche = ''
  let onglet = ROLE_SALARIE // rôle affiché ; '' = tous

  const nom = (u) => nomContact(u) || 'Sans nom'
  const chantiers = (u) => idsDeListe(u.Chantiers).map((id) => d.parId.Chantiers.get(id)?.Nom).filter(Boolean).join(', ')
  const dansOnglet = (u, role) => !role || (role === SANS_ROLE ? !u.Profil : u.Profil === role)
  const estSalarie = (u) => u.Profil === ROLE_SALARIE
  // Clic sur une ligne : fiche salarié pour un salarié, sinon modification du compte
  const ouvrir = (u) => (estSalarie(u) ? ouvrirFicheSalarie(u) : ouvrirFiche(u))

  function rendre() {
    if (!d) return
    if (!estAdmin(d)) {
      racine.replaceChildren(h('p', { className: 'message' }, 'Page réservée aux administrateurs.'))
      return
    }
    if (d.absentes.has('Utilisateurs')) {
      racine.replaceChildren(h('p', { className: 'message' }, 'Ce document n’a pas de table Utilisateurs.'))
      return
    }
    // Salarié en premier, Tous en dernier ; l'onglet « Sans rôle » n'apparaît que s'il en reste
    const onglets = [[ROLE_SALARIE, ROLE_SALARIE], ...ROLES.filter((r) => r !== ROLE_SALARIE).map((r) => [r, r]),
      ...(d.Utilisateurs.some((u) => !u.Profil) ? [[SANS_ROLE, 'Sans rôle']] : []), ['', 'Tous']]
    if (!onglets.some(([r]) => r === onglet)) onglet = ROLE_SALARIE

    const corps = h('tbody')
    const compteur = h('p', { className: 'sous-texte' })
    // Ne redessine que les lignes : le champ de recherche garde le curseur
    const dessinerLignes = () => {
      const filtre = recherche.trim().toLowerCase()
      const liste = d.Utilisateurs
        .filter((u) => dansOnglet(u, onglet))
        .filter((u) => !filtre || [nom(u), u.Profil, u.Telephone, u.Email, chantiers(u)].some((v) => String(v ?? '').toLowerCase().includes(filtre)))
        .sort((a, b) => String(a.Nom).localeCompare(String(b.Nom)) || String(a.Prenom).localeCompare(String(b.Prenom)))
      compteur.textContent = `${liste.length} utilisateur${liste.length > 1 ? 's' : ''}`
      corps.replaceChildren(...(liste.length === 0
        ? [h('tr', null, h('td', { className: 'tableau-vide', colSpan: TITRES_UTILISATEURS.length }, filtre ? 'Aucun résultat.' : 'Aucun utilisateur dans cet onglet.'))]
        : liste.map((u) => h('tr', { className: 'tableau-ligne', onClick: () => ouvrir(u) },
          h('td', { className: 'tableau-nom' }, nom(u)),
          h('td', null, u.Profil || 'Sans rôle'),
          h('td', null, lienContact('tel', u.Telephone)),
          h('td', null, lienContact('mailto', u.Email)),
          h('td', null, chantiers(u)),
          h('td', null, u.Actif ? 'Oui' : 'Non'),
          h('td', { className: 'tableau-actions' },
            estSalarie(u) && h('button', { className: 'bouton bouton-compact bouton-principal', onClick: (ev) => { ev.stopPropagation(); ouvrirFicheSalarie(u) } }, 'Fiche'),
            h('button', { className: 'bouton bouton-compact', onClick: (ev) => { ev.stopPropagation(); ouvrirFiche(u) } }, 'Modifier'),
            h('button', { className: 'bouton bouton-compact bouton-danger', onClick: (ev) => { ev.stopPropagation(); ouvrirSuppression(u) } }, 'Supprimer'))))))
      etiqueterLignes(corps, TITRES_UTILISATEURS)
    }
    dessinerLignes()
    racine.replaceChildren(
      // Onglets, recherche et tableau dans une même carte blanche à bordure noire
      h('section', { className: 'carte-tableau' },
        h('div', { className: 'onglets onglets-statut onglets-candidats', role: 'tablist', 'aria-label': 'Rôle des utilisateurs' },
          onglets.map(([role, libelle]) => h('button', { className: 'onglet', role: 'tab', 'aria-selected': String(role === onglet),
            onClick: () => { onglet = role; rendre() } }, `${libelle} (${d.Utilisateurs.filter((u) => dansOnglet(u, role)).length})`))),
        h('div', { className: 'barre-outils' },
          h('input', { className: 'champ champ-compact', type: 'search', placeholder: 'Rechercher (nom, téléphone, email, chantier…)', value: recherche,
            'aria-label': 'Rechercher un utilisateur', onInput: (e) => { recherche = e.target.value; dessinerLignes() } }),
          h('button', { className: 'bouton bouton-principal bouton-compact', onClick: () => ouvrirFiche(null) }, '＋ Nouvel utilisateur')),
        compteur,
        h('div', { className: 'tableau-defilant' },
          h('table', { className: 'tableau' },
            h('thead', null, h('tr', null, TITRES_UTILISATEURS.map((t) => h('th', null, t)))),
            corps))))
  }

  // ---- Fiche : création (`u` null) ou modification ----

  function ouvrirFiche(u) {
    const champs = {
      Prenom: u?.Prenom ?? '', Nom: u?.Nom ?? '', Email: u?.Email ?? '', Telephone: u?.Telephone ?? '',
      // Nouvel utilisateur : rôle de l'onglet ouvert, actif par défaut
      Profil: u ? u.Profil ?? '' : (ROLES.includes(onglet) ? onglet : ''),
      Actif: u ? Boolean(u.Actif) : true,
    }
    const choixChantiers = choixEtiquettes({
      elements: () => d.Chantiers.map((c) => ({ id: c.id, libelle: c.Nom || 'Sans nom' })),
      choisis: idsDeListe(u?.Chantiers),
      textes: { aucun: 'Aucun chantier.', choisir: 'Ajouter un chantier…', tous: 'Tous les chantiers sont ajoutés', vide: 'Aucun chantier dans l’application' },
    })
    const erreur = h('p', { className: 'erreur', hidden: true })
    const valider = h('button', { className: 'bouton bouton-principal', type: 'submit' }, u ? 'Enregistrer' : 'Créer l’utilisateur')
    const texte = (libelle, col, attributs = {}) => h('label', { className: 'champ-groupe' }, libelle,
      h('input', { className: 'champ', autocomplete: 'off', value: champs[col], ...attributs, onInput: (e) => { champs[col] = e.target.value } }))

    const formulaire = h('form', { className: 'formulaire', onSubmit: async (ev) => {
      ev.preventDefault()
      erreur.hidden = true
      valider.disabled = true
      try {
        const propres = Object.fromEntries(Object.entries(champs).map(([col, v]) => [col, typeof v === 'string' ? v.trim() : v]))
        await enregistrerUtilisateur(d, u?.id ?? null, { ...propres, Profil: propres.Profil || null, Chantiers: choixChantiers.ids() })
        fermer()
        await recharger()
      } catch (err) {
        erreur.textContent = err.message || 'L’enregistrement a échoué.'
        erreur.hidden = false
        valider.disabled = false
      }
    } },
    h('div', { className: 'grille-2' },
      texte('Prénom', 'Prenom'),
      texte('Nom', 'Nom'),
      texte('Email (compte Grist)', 'Email', { type: 'email', required: true }),
      texte('Téléphone', 'Telephone', { type: 'tel' }),
      h('label', { className: 'champ-groupe' }, 'Rôle',
        h('select', { className: 'champ', onChange: (e) => { champs.Profil = e.target.value } },
          h('option', { value: '', selected: !champs.Profil }, 'Sans rôle (pas d’accès)'),
          ROLES.map((r) => h('option', { value: r, selected: r === champs.Profil }, r)))),
      h('label', { className: 'case' },
        h('input', { type: 'checkbox', checked: champs.Actif, onChange: (e) => { champs.Actif = e.target.checked } }), 'Actif (peut utiliser l’application)')),
    h('div', { className: 'champ-groupe' }, 'Chantiers', choixChantiers.element),
    h('p', { className: 'sous-texte' }, 'L’email doit être celui du compte Grist de la personne : c’est lui qui donne son rôle et ses droits.'),
    erreur, valider,
    u && h('button', { className: 'bouton bouton-danger', type: 'button', onClick: () => { fermer(); ouvrirSuppression(u) } }, 'Supprimer cet utilisateur'))

    const { fermer } = ouvrirPanneau(u ? nom(u) : 'Nouvel utilisateur', formulaire)
  }

  // ---- Fiche salarié (lecture) : onglets « Fiche salarié » (candidat lié à l'embauche) et « Compte » ----

  // `ongletInitial` : onglet ouvert ; `moisPlanning` : premier jour du mois affiché par l'emploi du temps (par défaut le mois en cours)
  async function ouvrirFicheSalarie(u, ongletInitial = 'salarie', moisPlanning = null) {
    const lien = await lienPhotos().catch(() => null) // adresse temporaire de la photo
    const c = (d.Candidats ?? []).find((x) => x.Utilisateur === u.id) // candidat lié à ce compte (fiche d'embauche)
    const infos = (lignes) => h('dl', { className: 'fiche-infos' }, lignes.map(([terme, valeur]) => [h('dt', null, terme), h('dd', null, valeur)]))
    const passIae = c && (c.Pass_IAE_debut || c.Pass_IAE_fin)
      ? [enFrancais(depuisGrist(c.Pass_IAE_debut)) || '—', ' → ', dateAvecAlerte(c.Pass_IAE_fin)] : '—'

    // Après un enregistrement dans un formulaire ouvert par-dessus : la fiche est redessinée avec les données à jour
    const rouvrir = () => { fermer(); ouvrirFicheSalarie(d.parId.Utilisateurs.get(u.id) ?? u) }

    const ongletSalarie = () => [infosSalarie(), blocContrats(u, lien, rouvrir), blocSuivi(u)]
    const infosSalarie = () => {
      if (!c) return h('section', { className: 'bloc-candidat' },
        infos([['Nom', u.Nom || '—'], ['Prénom', u.Prenom || '—'], ['Téléphone', lienContact('tel', u.Telephone) || '—']]),
        h('p', { className: 'message' }, 'Aucun candidat n’est lié à ce compte. Lie-le depuis la fiche d’embauche du candidat (Gestion des candidats).'))
      const photo = idsDeListe(c.Photo)[0]
      // Photo à gauche, informations au centre, bouton à droite
      return h('section', { className: 'bloc-candidat' },
        h('div', { className: 'fiche-salarie' },
          h('div', { className: 'fiche-salarie-photo' }, photo && lien
            ? h('a', { href: lien(photo), target: '_blank', rel: 'noreferrer', title: 'Ouvrir la photo en grand' },
              h('img', { className: 'photo-candidat', src: lien(photo), alt: `Photo de ${nom(u)}` }))
            : h('span', { className: 'photo-vide', 'aria-label': 'Pas de photo' }, icone('occupes', 48))),
          infos([
            ['Nom', c.Nom || '—'], ['Prénom', c.Prenom || '—'],
            ['Téléphone', lienContact('tel', c.Telephone) || '—'],
            ['Date titre de séjour', dateAvecAlerte(c.Date_validite_titre_sejour)],
            ['Pass IAE', passIae],
            ['RQTH', c.RQTH || '—'],
          ]),
          h('button', { className: 'bouton bouton-principal bouton-compact fiche-salarie-modifier', onClick: () => { fermer(); modifierCandidat(c.id) } }, 'Modifier les infos')))
    }

    // Toutes les informations du candidat lié, en lecture, sans le suivi de la candidature
    const ongletDetail = () => (c
      ? blocsCandidatLecture(d, c, lien, ['Suivi de la candidature'])
      : h('p', { className: 'message' }, 'Aucun candidat n’est lié à ce compte. Lie-le depuis la fiche d’embauche du candidat (Gestion des candidats).'))

    const ongletCompte = () => h('section', { className: 'bloc-candidat' },
      infos([
        ['Email (compte Grist)', lienContact('mailto', u.Email) || '—'], ['Rôle', u.Profil || 'Sans rôle'],
        ['Chantiers', chantiers(u) || '—'], ['Actif', u.Actif ? 'Oui' : 'Non'],
      ]),
      h('div', { className: 'fiche-actions' },
        h('button', { className: 'bouton', onClick: () => { fermer(); ouvrirFiche(u) } }, 'Modifier le compte')))

    // Changer d'onglet ne redessine que le contenu
    const ONGLETS_FICHE = [['salarie', 'Fiche salarié', ongletSalarie], ['detail', 'Détail du salarié', ongletDetail],
      // Après un import : fiche rouverte sur l'emploi du temps, au mois de la première tâche importée
      ['planning', 'Emploi du temps', () => blocEmploiDuTemps(u, moisPlanning, (mois) => { fermer(); ouvrirFicheSalarie(d.parId.Utilisateurs.get(u.id) ?? u, 'planning', mois) })],
      ['compte', 'Compte', ongletCompte]]
    const contenu = h('div', { className: 'fiche-contenu' })
    const barre = h('div', { className: 'onglets onglets-statut', role: 'tablist', 'aria-label': 'Fiche salarié' })
    const afficherOnglet = (cle) => {
      barre.replaceChildren(...ONGLETS_FICHE.map(([k, libelle]) =>
        h('button', { className: 'onglet', role: 'tab', 'aria-selected': String(k === cle), onClick: () => afficherOnglet(k) }, libelle)))
      contenu.replaceChildren(...[ONGLETS_FICHE.find(([k]) => k === cle)[2]()].flat())
    }
    afficherOnglet(ongletInitial)

    // Compte sans prénom ni nom : nom du candidat lié, sinon email
    const titre = h('span', { className: 'titre-formulaire' }, h('span', { className: 'titre-icone' }, icone('occupes', 22)),
      nomContact(u) || (c && nomContact(c)) || u.Email || 'Sans nom')
    const { fermer, section } = ouvrirPanneau(titre, [barre, contenu])
    section.classList.add('panneau-large', 'panneau-fiche')
  }

  // ---- Contrats du salarié (dans la fiche salarié) : contrat actuel / contrats précédents, ajout, modification, suppression ----

  // Contrat en cours (ou à venir) : sans date de fin ou date de fin pas encore passée
  const estActuel = (k) => { const fin = depuisGrist(k.Date_fin); return !fin || fin >= aujourdhui() }

  function blocContrats(u, lien, rouvrir) {
    if (d.absentes.has('Contrats')) return h('section', { className: 'bloc-candidat' }, h('h3', null, 'Contrats'),
      h('p', { className: 'message' }, 'Ce document n’a pas de table Contrats.'))
    const tous = d.Contrats.filter((k) => k.Salarie === u.id)
      .sort((a, b) => (b.Date_debut ?? 0) - (a.Date_debut ?? 0))
    let vue = 'actuel'
    let recherche = ''
    const sites = (k) => idsDeListe(k.Chantiers).map((id) => d.parId.Chantiers.get(id)?.Nom).filter(Boolean).join(', ')
    const poste = (k) => d.parId.Postes?.get(k.Poste)?.Titre ?? ''
    const fichier = (k, col) => {
      const id = idsDeListe(k[col])[0]
      if (!id) return '—'
      return lien ? h('a', { href: lien(id), target: '_blank', rel: 'noreferrer', onClick: (e) => e.stopPropagation() }, 'Voir') : 'Enregistré'
    }

    const onglets = h('div', { className: 'onglets onglets-statut', role: 'tablist', 'aria-label': 'Contrats' })
    const compteur = h('p', { className: 'sous-texte' })
    const corps = h('tbody')
    const dessiner = () => {
      onglets.replaceChildren(...[['actuel', 'Contrat actuel', tous.filter(estActuel)], ['precedents', 'Contrats précédents', tous.filter((k) => !estActuel(k))]]
        .map(([cle, libelle, liste]) => h('button', { className: 'onglet', role: 'tab', 'aria-selected': String(cle === vue),
          onClick: () => { vue = cle; dessiner() } }, `${libelle} (${liste.length})`)))
      const filtre = recherche.trim().toLowerCase()
      const liste = tous.filter((k) => (vue === 'actuel') === estActuel(k))
        .filter((k) => !filtre || [k.Numero, sites(k), poste(k)].some((v) => String(v ?? '').toLowerCase().includes(filtre)))
      compteur.textContent = `${liste.length} résultat${liste.length > 1 ? 's' : ''}`
      corps.replaceChildren(...(liste.length === 0
        ? [h('tr', null, h('td', { className: 'tableau-vide', colSpan: TITRES_CONTRATS.length }, 'Aucun contrat à afficher.'))]
        : liste.map((k) => h('tr', { className: 'tableau-ligne', onClick: () => ouvrirContrat(u, k, lien, rouvrir) },
          h('td', { className: 'tableau-nom' }, k.Numero || '—'),
          h('td', null, sites(k) || '—'),
          h('td', null, poste(k) || '—'),
          h('td', null, enFrancais(depuisGrist(k.Date_debut)) || '—'),
          h('td', null, enFrancais(depuisGrist(k.Date_fin)) || '—'),
          FICHIERS_CONTRAT.map(([col]) => h('td', null, fichier(k, col))),
          h('td', { className: 'tableau-actions' },
            h('button', { className: 'bouton bouton-compact', onClick: (e) => { e.stopPropagation(); ouvrirContrat(u, k, lien, rouvrir) } }, 'Modifier'),
            h('button', { className: 'bouton bouton-compact bouton-danger', onClick: (e) => { e.stopPropagation(); supprimerContrat(k, rouvrir) } }, 'Supprimer'))))))
      etiqueterLignes(corps, TITRES_CONTRATS)
    }
    dessiner()

    return h('section', { className: 'bloc-candidat bloc-contrats' },
      h('div', { className: 'contrats-haut' }, h('h3', null, 'Contrats'),
        h('button', { className: 'bouton bouton-principal bouton-compact', onClick: () => ouvrirContrat(u, null, lien, rouvrir) }, '＋ Ajouter un contrat')),
      onglets,
      h('div', { className: 'barre-outils' }, compteur,
        h('input', { className: 'champ champ-compact', type: 'search', placeholder: 'Rechercher (n°, site, poste…)', 'aria-label': 'Rechercher un contrat',
          onInput: (e) => { recherche = e.target.value; dessiner() } })),
      h('div', { className: 'tableau-defilant' },
        h('table', { className: 'tableau' }, h('thead', null, h('tr', null, TITRES_CONTRATS.map((t) => h('th', null, t)))), corps)))
  }

  // Formulaire d'un contrat (`k` null : nouveau contrat du salarié `u`), ouvert par-dessus la fiche salarié
  function ouvrirContrat(u, k, lien, rouvrir) {
    const champs = {
      Numero: k?.Numero ?? '', Poste: Number(k?.Poste) || 0,
      Date_debut: depuisGrist(k?.Date_debut) ?? '', Date_fin: depuisGrist(k?.Date_fin) ?? '', Date_signature: depuisGrist(k?.Date_signature) ?? '',
    }
    const nouveaux = {} // fichiers choisis, par colonne
    const choixSites = choixEtiquettes({
      elements: () => d.Chantiers.map((x) => ({ id: x.id, libelle: x.Nom || 'Sans nom' })),
      choisis: k ? idsDeListe(k.Chantiers) : idsDeListe(u.Chantiers), // nouveau contrat : chantiers du salarié
      textes: { aucun: 'Aucun site.', choisir: 'Ajouter un site…', tous: 'Tous les sites sont ajoutés', vide: 'Aucun chantier dans l’application' },
    })
    const erreur = h('p', { className: 'erreur', hidden: true })
    const valider = h('button', { className: 'bouton bouton-principal', type: 'submit' }, k ? 'Enregistrer' : 'Ajouter le contrat')
    const date = (libelle, col) => h('label', { className: 'champ-groupe' }, libelle,
      h('input', { className: 'champ', type: 'date', value: champs[col], onInput: (e) => { champs[col] = e.target.value } }))

    const formulaire = h('form', { className: 'formulaire', onSubmit: async (e) => {
      e.preventDefault()
      erreur.hidden = true
      if (champs.Date_debut && champs.Date_fin && champs.Date_fin < champs.Date_debut) {
        erreur.textContent = 'La date de fin est avant la date de début.'
        erreur.hidden = false
        return
      }
      valider.disabled = true
      valider.textContent = 'Enregistrement…'
      try {
        const valeurs = {
          Numero: champs.Numero.trim(), Poste: champs.Poste || 0, Salarie: u.id,
          Chantiers: choixSites.ids().length > 0 ? ['L', ...choixSites.ids()] : null,
          Date_debut: versGrist(champs.Date_debut), Date_fin: versGrist(champs.Date_fin), Date_signature: versGrist(champs.Date_signature),
        }
        // Un nouveau fichier remplace l'ancien ; sans nouveau fichier, l'ancien reste
        for (const [col, f] of Object.entries(nouveaux)) valeurs[col] = ['L', await envoyerPhoto(f, f.name)]
        await enregistrerContrat(k?.id ?? null, valeurs)
        fermerContrat()
        await recharger()
        rouvrir()
      } catch (err) {
        erreur.textContent = err.message || 'L’enregistrement a échoué.'
        erreur.hidden = false
        valider.disabled = false
        valider.textContent = k ? 'Enregistrer' : 'Ajouter le contrat'
      }
    } },
    h('div', { className: 'grille-2' },
      h('label', { className: 'champ-groupe' }, 'N° de contrat',
        h('input', { className: 'champ', autocomplete: 'off', value: champs.Numero, onInput: (e) => { champs.Numero = e.target.value } })),
      h('label', { className: 'champ-groupe' }, 'Intitulé de poste',
        h('select', { className: 'champ', onChange: (e) => { champs.Poste = Number(e.target.value) || 0 } },
          h('option', { value: '0', selected: !champs.Poste }, '-- Choisissez --'),
          [...(d.Postes ?? [])].sort((a, b) => String(a.Titre).localeCompare(String(b.Titre)))
            .map((p) => h('option', { value: String(p.id), selected: p.id === champs.Poste }, p.Titre || 'Sans titre')))),
      date('Date début', 'Date_debut'), date('Date fin', 'Date_fin'), date('Date signature', 'Date_signature')),
    h('div', { className: 'champ-groupe' }, 'Sites (chantiers)', choixSites.element),
    h('div', { className: 'grille-2' }, FICHIERS_CONTRAT.map(([col, libelle]) => {
      const id = idsDeListe(k?.[col])[0]
      return h('div', { className: 'champ-groupe' }, `Fichier ${libelle}`,
        zoneFichier((f) => { nouveaux[col] = f }, { deja: Boolean(id), lien: id && lien ? lien(id) : null }))
    })),
    erreur, valider)

    const titre = k ? `Contrat ${k.Numero || ''}`.trim() : `Nouveau contrat · ${nom(u)}`
    const { fermer: fermerContrat, section } = ouvrirPanneau(titre, formulaire)
    section.classList.add('panneau-large')
  }

  function supprimerContrat(k, rouvrir) {
    fenetreSuppression(`Supprimer le contrat ${k.Numero || ''} ?`.replace('  ', ' '), [
      h('p', null, 'Le contrat et ses fichiers (contrat, DPAE) seront retirés de la fiche du salarié.'),
    ], [['Supprimer définitivement', 'bouton-danger', () => supprimerFiche('Contrats', k.id)]], async () => { await recharger(); rouvrir() })
  }

  // ---- Emploi du temps du salarié (onglet de la fiche) : calendrier du mois, puis tableau des tâches de ce mois ----

  const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
  const TITRES_TACHES = ['', 'Date début', 'Date fin', 'Emplacement', 'Titre de tâche', 'Action', 'Détail', '']
  const enDate = (v) => (v ? new Date(v * 1000) : null) // colonnes Date et heure : secondes depuis 1970
  const cleJour = (dt) => `${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}`
  const heure = (dt) => dt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  // Emplacement lisible : niveaux remplis, du chantier au vestiaire
  const emplacement = (t) => [['Chantiers', t.Chantier], ['Zones', t.Zone], ['Bases_vie', t.Base_vie], ['Etages', t.Etage], ['Pieces', t.Piece], ['Vestiaires', t.Vestiaire]]
    .map(([table, id]) => id && d.parId[table]?.get(id)?.Nom).filter(Boolean).join(' › ')

  // `moisInitial` : premier jour du mois affiché (null : mois en cours) ; `rouvrir(mois)` : redessine la fiche à ce mois
  function blocEmploiDuTemps(u, moisInitial, rouvrir) {
    if (d.absentes.has('Emploi_du_temps')) return h('p', { className: 'message' }, 'Ce document n’a pas de table Emploi du temps.')
    const taches = d.Emploi_du_temps.filter((t) => t.Salarie === u.id && t.Date_debut).sort((a, b) => a.Date_debut - b.Date_debut)
    const auj = new Date()
    let mois = moisInitial ?? new Date(auj.getFullYear(), auj.getMonth(), 1)
    const choisies = new Set() // tâches cochées du mois affiché (suppression en masse)
    const moisDe = (t) => { const dt = enDate(t.Date_debut); return new Date(dt.getFullYear(), dt.getMonth(), 1) }
    // Fiche de la tâche (même formulaire que l'ajout, pré-rempli)
    const modifier = (t) => ouvrirAjoutTache(d, u, apresAjout, t)
    // Suppression d'une ou plusieurs tâches, après confirmation ; la fiche est ensuite redessinée au même mois
    const confirmerSuppression = (liste) => fenetreSuppression(
      liste.length === 1 ? `Supprimer la tâche « ${liste[0].Titre || 'sans titre'} » ?` : `Supprimer ${liste.length} tâches ?`,
      [h('p', null, liste.length === 1 ? `Le ${dateHeure(liste[0].Date_debut)}.` : 'Les tâches cochées de ce mois seront supprimées de l’emploi du temps.')],
      [['Supprimer définitivement', 'bouton-danger', () => supprimerTaches(liste.map((t) => t.id))]],
      async () => { await recharger(); rouvrir(mois) })
    // Après un ajout ou un import : la fiche est rouverte sur cet onglet, au mois de la première nouvelle tâche
    const apresAjout = async (nouvelles) => {
      await recharger()
      const premiere = [...nouvelles].sort((a, b) => a.Date_debut - b.Date_debut)[0]
      rouvrir(premiere ? moisDe(premiere) : mois)
    }
    const zone = h('div', { className: 'planning' })
    const remplir = (...parties) => zone.replaceChildren(...parties.filter((p) => p !== false && p != null))

    const dessiner = () => {
      const annee = mois.getFullYear()
      const m = mois.getMonth()
      const duMois = taches.filter((t) => { const dt = enDate(t.Date_debut); return dt.getFullYear() === annee && dt.getMonth() === m })
      const parJour = new Map()
      for (const t of duMois) {
        const cle = cleJour(enDate(t.Date_debut))
        parJour.set(cle, [...(parJour.get(cle) ?? []), t])
      }
      // Grille du lundi précédant le 1er au dimanche suivant le dernier jour du mois
      const debut = new Date(annee, m, 1 - ((new Date(annee, m, 1).getDay() + 6) % 7))
      const nbJours = Math.ceil(((new Date(annee, m + 1, 0) - debut) / 86400000 + 1) / 7) * 7
      const cases = Array.from({ length: nbJours }, (_, i) => new Date(debut.getFullYear(), debut.getMonth(), debut.getDate() + i))
      const changer = (n) => { mois = new Date(annee, m + n, 1); choisies.clear(); dessiner() }

      // Les parties absentes (false) sont ignorées : replaceChildren les écrirait en texte
      remplir(
        h('div', { className: 'planning-haut' },
          h('button', { className: 'bouton bouton-compact', type: 'button', 'aria-label': 'Mois précédent', onClick: () => changer(-1) }, '‹'),
          h('h3', null, mois.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })),
          h('button', { className: 'bouton bouton-compact', type: 'button', 'aria-label': 'Mois suivant', onClick: () => changer(1) }, '›'),
          h('button', { className: 'bouton bouton-compact', type: 'button', onClick: () => { mois = new Date(auj.getFullYear(), auj.getMonth(), 1); choisies.clear(); dessiner() } }, 'Aujourd’hui'),
          h('span', { className: 'planning-actions' },
            h('button', { className: 'bouton bouton-compact', type: 'button', onClick: () => telechargerModeleTaches(d).catch((err) => alert(err.message)) }, 'Modèle Excel'),
            h('button', { className: 'bouton bouton-compact', type: 'button', onClick: () => ouvrirImportTaches(d, u, apresAjout) }, 'Importer des tâches'),
            h('button', { className: 'bouton bouton-principal bouton-compact', type: 'button', onClick: () => ouvrirAjoutTache(d, u, apresAjout) }, '＋ Ajouter une tâche'))),
        h('div', { className: 'calendrier' },
          JOURS.map((j) => h('div', { className: 'calendrier-jour-nom' }, j)),
          cases.map((jour) => h('div', { className: `calendrier-case${jour.getMonth() !== m ? ' hors-mois' : ''}${cleJour(jour) === cleJour(auj) ? ' aujourdhui' : ''}` },
            h('span', { className: 'calendrier-numero' }, jour.getDate()),
            (parJour.get(cleJour(jour)) ?? []).map((t) => h('div', { className: 'calendrier-tache', title: [t.Titre, emplacement(t), t.Action].filter(Boolean).join(' · ') },
              h('strong', null, heure(enDate(t.Date_debut))), ' ', t.Titre || 'Tâche'))))),
        h('h3', null, `Tâches du mois (${duMois.length})`),
        // Mois sans tâche : raccourcis vers la tâche précédente et la suivante
        duMois.length === 0 && taches.length > 0 && (() => {
          const precedente = [...taches].reverse().find((t) => enDate(t.Date_debut) < mois)
          const suivante = taches.find((t) => enDate(t.Date_debut) >= new Date(annee, m + 1, 1))
          const aller = (t) => { mois = moisDe(t); choisies.clear(); dessiner() }
          const date = (t) => enDate(t.Date_debut).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
          return h('div', { className: 'planning-saut' },
            precedente && h('button', { className: 'bouton bouton-compact', type: 'button', onClick: () => aller(precedente) }, `‹ Tâche précédente : ${date(precedente)}`),
            suivante && h('button', { className: 'bouton bouton-compact', type: 'button', onClick: () => aller(suivante) }, `Tâche suivante : ${date(suivante)} ›`))
        })(),
        // Suppression en masse des tâches cochées
        duMois.length > 0 && h('div', { className: 'planning-saut' },
          h('button', { className: 'bouton bouton-compact bouton-danger', type: 'button', disabled: choisies.size === 0,
            onClick: () => confirmerSuppression(duMois.filter((t) => choisies.has(t.id))) },
          `Supprimer la sélection (${choisies.size})`)),
        h('div', { className: 'tableau-defilant' },
          h('table', { className: 'tableau' },
            h('thead', null, h('tr', null, TITRES_TACHES.map((t, i) => h('th', null, i === 0 && duMois.length > 0
              ? h('input', { type: 'checkbox', 'aria-label': 'Tout sélectionner', checked: duMois.every((x) => choisies.has(x.id)),
                onChange: (e) => { for (const x of duMois) e.target.checked ? choisies.add(x.id) : choisies.delete(x.id); dessiner() } })
              : t)))),
            (() => {
              const corps = h('tbody', null, duMois.length === 0
                ? h('tr', null, h('td', { className: 'tableau-vide', colSpan: TITRES_TACHES.length }, 'Aucune tâche ce mois-ci.'))
                : duMois.map((t) => h('tr', { className: 'tableau-ligne', onClick: () => modifier(t) },
                  h('td', { onClick: (e) => e.stopPropagation() },
                    h('input', { type: 'checkbox', 'aria-label': `Sélectionner ${t.Titre || 'la tâche'}`, checked: choisies.has(t.id),
                      onChange: (e) => { e.target.checked ? choisies.add(t.id) : choisies.delete(t.id); dessiner() } })),
                  h('td', { className: 'tableau-nom' }, dateHeure(t.Date_debut)),
                  h('td', null, dateHeure(t.Date_fin)),
                  h('td', null, emplacement(t) || '—'),
                  h('td', null, t.Titre || '—'),
                  h('td', null, t.Action || '—'),
                  h('td', { className: 'cellule-detail' }, t.Detail || '—'),
                  h('td', { className: 'tableau-actions' },
                    h('button', { className: 'bouton bouton-compact', type: 'button', onClick: (e) => { e.stopPropagation(); modifier(t) } }, 'Modifier'),
                    h('button', { className: 'bouton bouton-compact bouton-danger', type: 'button', onClick: (e) => { e.stopPropagation(); confirmerSuppression([t]) } }, 'Supprimer')))))
              etiqueterLignes(corps, TITRES_TACHES)
              return corps
            })())))
    }
    dessiner()
    return zone
  }

  // ---- Suivi d'insertion du salarié (dans la fiche salarié) : nouveau commentaire, puis historique du plus récent au plus ancien ----

  const dateHeure = (v) => (v ? new Date(v * 1000).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—')

  function blocSuivi(u) {
    if (d.absentes.has('Suivi_d_insertion')) return h('section', { className: 'bloc-candidat bloc-contrats' }, h('h3', null, 'Suivi insertion'),
      h('p', { className: 'message' }, 'Ce document n’a pas de table Suivi d’insertion.'))
    const commentaires = d.Suivi_d_insertion.filter((s) => s.Salarie === u.id).sort((a, b) => (b.Cree_le ?? 0) - (a.Cree_le ?? 0))
    const texte = h('textarea', { className: 'champ champ-texte suivi-texte', placeholder: 'Écrire un commentaire de suivi…', 'aria-label': 'Nouveau commentaire de suivi' })
    const prive = h('input', { type: 'checkbox' })
    const erreur = h('p', { className: 'erreur', hidden: true })
    const ajouter = h('button', { className: 'bouton bouton-principal', type: 'button', onClick: async () => {
      erreur.hidden = true
      if (!texte.value.trim()) {
        erreur.textContent = 'Le commentaire est vide.'
        erreur.hidden = false
        return
      }
      ajouter.disabled = true
      try {
        await ajouterSuiviInsertion(u.id, texte.value.trim(), prive.checked)
        await recharger()
        section.replaceWith(blocSuivi(u)) // seule cette partie est redessinée : la fiche garde sa position
      } catch (err) {
        erreur.textContent = err.message || 'L’enregistrement a échoué.'
        erreur.hidden = false
        ajouter.disabled = false
      }
    } }, 'Ajouter commentaire')

    const section = h('section', { className: 'bloc-candidat bloc-contrats' },
      h('h3', null, 'Suivi insertion'),
      h('div', { className: 'suivi-saisie' },
        texte,
        h('div', { className: 'suivi-options' }, ajouter,
          h('label', { className: 'case' }, prive, 'Cochez cette case pour que le commentaire ne soit visible que par l’équipe Admin'))),
      erreur,
      h('div', { className: 'suivi-historique' }, commentaires.length === 0
        ? h('p', { className: 'sous-texte' }, 'Aucun commentaire pour l’instant.')
        : commentaires.map((s) => h('article', { className: 'suivi-commentaire' },
          h('div', { className: 'suivi-entete' },
            h('span', null, h('strong', null, 'De '), d.parId.Utilisateurs.get(s.Fait_par) ? nomContact(d.parId.Utilisateurs.get(s.Fait_par)) || d.parId.Utilisateurs.get(s.Fait_par).Email : 'Inconnu'),
            s.Pas_visible_pour_tous && h('span', { className: 'badge badge-termine' }, 'Équipe Admin uniquement'),
            h('span', { className: 'suivi-date' }, `Le ${dateHeure(s.Cree_le)}`)),
          h('p', { className: 'suivi-texte-lu' }, s.Commentaire || '')))))
    return section
  }

  // ---- Suppression ----

  function ouvrirSuppression(u) {
    const suivis = d.Candidats.filter((c) => c.CIP_responsable === u.id).length
    fenetreSuppression(`Supprimer ${nom(u)} ?`, [
      h('p', null, 'La personne n’aura plus accès à l’application. Pour couper l’accès sans effacer la fiche, décoche plutôt « Actif ».'),
      suivis > 0 && h('p', null, `${suivis} candidat(s) l’ont comme CIP responsable : ils resteront, sans CIP.`),
    ], [['Supprimer définitivement', 'bouton-danger', () => supprimerFiche('Utilisateurs', u.id)]], recharger)
  }

  return {
    afficher(donnees) {
      d = donnees
      rendre()
    },
    accueil() {
      recherche = ''
      onglet = ROLE_SALARIE
      rendre()
    },
  }
}
