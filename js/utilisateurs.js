// Écran « Gestion des utilisateurs » (admin) : onglets par rôle, tableau avec recherche,
// fiche de création / modification (identité, rôle, chantiers, actif), suppression.
import { h, ouvrirPanneau, etiqueterLignes, lienContact, fenetreSuppression, choixEtiquettes } from './outils.js'
import { estAdmin, ROLES, enregistrerUtilisateur, supprimerFiche, idsDeListe, nomContact } from './donnees.js'

const TITRES_UTILISATEURS = ['Utilisateur', 'Rôle', 'Téléphone', 'Email', 'Chantiers', 'Actif', '']
const SANS_ROLE = '—' // onglet des utilisateurs sans rôle (ils n'ont pas accès à l'application)

export function creerEcranUtilisateurs(racine, recharger) {
  let d = null
  let recherche = ''
  let onglet = '' // rôle affiché ; '' = tous

  const nom = (u) => nomContact(u) || 'Sans nom'
  const chantiers = (u) => idsDeListe(u.Chantiers).map((id) => d.parId.Chantiers.get(id)?.Nom).filter(Boolean).join(', ')
  const dansOnglet = (u, role) => !role || (role === SANS_ROLE ? !u.Profil : u.Profil === role)

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
    // L'onglet « Sans rôle » n'apparaît que s'il en reste
    const onglets = [['', 'Tous'], ...ROLES.map((r) => [r, r]), ...(d.Utilisateurs.some((u) => !u.Profil) ? [[SANS_ROLE, 'Sans rôle']] : [])]
    if (!onglets.some(([r]) => r === onglet)) onglet = ''

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
        : liste.map((u) => h('tr', { className: 'tableau-ligne', onClick: () => ouvrirFiche(u) },
          h('td', { className: 'tableau-nom' }, nom(u)),
          h('td', null, u.Profil || 'Sans rôle'),
          h('td', null, lienContact('tel', u.Telephone)),
          h('td', null, lienContact('mailto', u.Email)),
          h('td', null, chantiers(u)),
          h('td', null, u.Actif ? 'Oui' : 'Non'),
          h('td', { className: 'tableau-actions' },
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
      onglet = ''
      rendre()
    },
  }
}
