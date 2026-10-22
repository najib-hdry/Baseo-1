// Écran « Gestion des utilisateurs » (admin) : onglets par rôle (Salarié en premier, Tous en dernier), tableau avec recherche,
// fiche de création / modification (identité, rôle, chantiers, actif), suppression,
// fiche salarié en onglets (infos du candidat lié à l'embauche, compte).
import { h, ouvrirPanneau, etiqueterLignes, lienContact, fenetreSuppression, choixEtiquettes, dateAvecAlerte, enFrancais, depuisGrist, icone } from './outils.js'
import { estAdmin, ROLES, ROLE_SALARIE, enregistrerUtilisateur, supprimerFiche, idsDeListe, nomContact, lienPhotos } from './donnees.js'

const TITRES_UTILISATEURS = ['Utilisateur', 'Rôle', 'Téléphone', 'Email', 'Chantiers', 'Actif', '']
const SANS_ROLE = '—' // onglet des utilisateurs sans rôle (ils n'ont pas accès à l'application)

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

  async function ouvrirFicheSalarie(u) {
    const lien = await lienPhotos().catch(() => null) // adresse temporaire de la photo
    const c = (d.Candidats ?? []).find((x) => x.Utilisateur === u.id) // candidat lié à ce compte (fiche d'embauche)
    const infos = (lignes) => h('dl', { className: 'fiche-infos' }, lignes.map(([terme, valeur]) => [h('dt', null, terme), h('dd', null, valeur)]))
    const passIae = c && (c.Pass_IAE_debut || c.Pass_IAE_fin)
      ? [enFrancais(depuisGrist(c.Pass_IAE_debut)) || '—', ' → ', dateAvecAlerte(c.Pass_IAE_fin)] : '—'

    const ongletSalarie = () => {
      if (!c) return h('section', { className: 'bloc-candidat' },
        infos([['Nom', u.Nom || '—'], ['Prénom', u.Prenom || '—'], ['Téléphone', lienContact('tel', u.Telephone) || '—']]),
        h('p', { className: 'message' }, 'Aucun candidat n’est lié à ce compte. Lie-le depuis la fiche d’embauche du candidat (Gestion des candidats).'))
      const photo = idsDeListe(c.Photo)[0]
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
          ])),
        h('div', { className: 'fiche-actions' },
          h('button', { className: 'bouton bouton-principal', onClick: () => { fermer(); modifierCandidat(c.id) } }, 'Modifier le candidat')))
    }

    const ongletCompte = () => h('section', { className: 'bloc-candidat' },
      infos([
        ['Email (compte Grist)', lienContact('mailto', u.Email) || '—'], ['Rôle', u.Profil || 'Sans rôle'],
        ['Chantiers', chantiers(u) || '—'], ['Actif', u.Actif ? 'Oui' : 'Non'],
      ]),
      h('div', { className: 'fiche-actions' },
        h('button', { className: 'bouton', onClick: () => { fermer(); ouvrirFiche(u) } }, 'Modifier le compte')))

    // Changer d'onglet ne redessine que le contenu
    const ONGLETS_FICHE = [['salarie', 'Fiche salarié', ongletSalarie], ['compte', 'Compte', ongletCompte]]
    const contenu = h('div', { className: 'fiche-contenu' })
    const barre = h('div', { className: 'onglets onglets-statut', role: 'tablist', 'aria-label': 'Fiche salarié' })
    const afficherOnglet = (cle) => {
      barre.replaceChildren(...ONGLETS_FICHE.map(([k, libelle]) =>
        h('button', { className: 'onglet', role: 'tab', 'aria-selected': String(k === cle), onClick: () => afficherOnglet(k) }, libelle)))
      contenu.replaceChildren(ONGLETS_FICHE.find(([k]) => k === cle)[2]())
    }
    afficherOnglet('salarie')

    const titre = h('span', { className: 'titre-formulaire' }, h('span', { className: 'titre-icone' }, icone('occupes', 22)), nom(u))
    const { fermer, section } = ouvrirPanneau(titre, [barre, contenu])
    section.classList.add('panneau-large', 'panneau-fiche')
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
