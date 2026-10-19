// Écran « Gestion des candidats » (admin) : tableau des candidats avec recherche.
// Les 45 colonnes de la table ne tiennent pas dans un tableau : on affiche les plus utiles pour repérer et contacter.
import { h, depuisGrist, enFrancais, etiqueterLignes } from './outils.js'

const TITRES_CANDIDATS = ['Candidat', 'Nationalité', 'Téléphone', 'Email', 'Poste', 'CIP responsable', 'Pass IAE', 'France Travail']

// Âge en années à partir d'une date ISO (AAAA-MM-JJ)
function age(iso) {
  if (!iso) return null
  const [a, m, j] = iso.split('-').map(Number)
  const auj = new Date()
  return auj.getFullYear() - a - (auj.getMonth() + 1 < m || (auj.getMonth() + 1 === m && auj.getDate() < j) ? 1 : 0)
}

// Écran affiché dans `racine`
export function creerEcranCandidats(racine) {
  let d = null
  let recherche = ''

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
    if (d.moi?.profil !== 'Admin') {
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
        .filter((c) => !filtre || [nom(c), nationalite(c), c.Telephone, c.Email, poste(c), cip(c)].some((v) => String(v ?? '').toLowerCase().includes(filtre)))
        .sort((a, b) => String(a.Nom).localeCompare(String(b.Nom)) || String(a.Prenom).localeCompare(String(b.Prenom)))
      compteur.textContent = `${liste.length} candidat${liste.length > 1 ? 's' : ''}${filtre ? ` sur ${d.Candidats.length}` : ''}`
      corps.replaceChildren(...(liste.length === 0
        ? [h('tr', null, h('td', { className: 'tableau-vide', colSpan: TITRES_CANDIDATS.length }, filtre ? 'Aucun candidat ne correspond.' : 'Aucun candidat pour l’instant.'))]
        : liste.map((c) => {
          const naissance = depuisGrist(c.Date_naissance)
          return h('tr', null,
            h('td', null,
              h('div', { className: 'tableau-nom' }, nom(c)),
              naissance && h('div', { className: 'sous-texte' }, `${enFrancais(naissance)} · ${age(naissance)} ans`)),
            h('td', null, nationalite(c)),
            h('td', null, c.Telephone ? h('a', { href: `tel:${c.Telephone}` }, c.Telephone) : ''),
            h('td', null, c.Email ? h('a', { href: `mailto:${c.Email}` }, c.Email) : ''),
            h('td', null, poste(c)),
            h('td', null, cip(c)),
            h('td', null, passIae(c)),
            h('td', null, c.Inscrit_France_Travail ?? ''))
        })))
      etiqueterLignes(corps, TITRES_CANDIDATS)
    }
    dessinerLignes()
    racine.replaceChildren(
      h('h1', null, 'Gestion des candidats'),
      h('div', { className: 'barre-outils' },
        h('input', { className: 'champ champ-compact', type: 'search', placeholder: 'Rechercher (nom, nationalité, téléphone, email, poste, CIP…)', value: recherche,
          'aria-label': 'Rechercher un candidat', onInput: (e) => { recherche = e.target.value; dessinerLignes() } })),
      compteur,
      h('div', { className: 'tableau-defilant' },
        h('table', { className: 'tableau' },
          h('thead', null, h('tr', null, TITRES_CANDIDATS.map((t) => h('th', null, t)))),
          corps)))
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
