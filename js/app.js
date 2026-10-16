// Application « Casiers chantier » dans Grist : en-tête, menu « Mes pages »
// et les deux écrans (casiers, incidents), comme l'application Supabase.
/* global grist */
import { h, icone, afficherErreur } from './outils.js'
import { chargerTout } from './donnees.js'
import { creerEcranCasiers } from './casiers.js'
import { creerEcranIncidents } from './incidents.js'
import { creerEcranRapport, NETTOYAGE, MAINTENANCE } from './rapports.js'

const PAGES = [
  { cle: 'casiers', libelle: 'Gestion des casiers', icone: 'total' },
  { cle: 'incidents', libelle: 'Gestion des incidents', icone: 'hs' },
  { cle: 'nettoyage', libelle: 'Contrôle nettoyage', icone: 'nettoyage' },
  { cle: 'maintenance', libelle: 'Maintenance', icone: 'maintenance' },
]

const principal = document.getElementById('app')
const zones = Object.fromEntries(PAGES.map((p) => [p.cle, h('div')]))
const ecrans = {
  casiers: creerEcranCasiers(zones.casiers, () => recharger()),
  incidents: creerEcranIncidents(zones.incidents, () => recharger()),
  nettoyage: creerEcranRapport(zones.nettoyage, () => recharger(), NETTOYAGE),
  maintenance: creerEcranRapport(zones.maintenance, () => recharger(), MAINTENANCE),
}
let page = 'casiers'
let donnees = null

// ---- En-tête et menu ----

const sousTitre = h('div', { className: 'entete-info' })

function ouvrirMenu() {
  const fermer = () => {
    voile.remove()
    window.removeEventListener('keydown', touche)
  }
  const touche = (e) => e.key === 'Escape' && fermer()
  const voile = h('div', { className: 'voile voile-tiroir', onClick: fermer },
    h('nav', { className: 'tiroir', 'aria-label': 'Mes pages', onClick: (e) => e.stopPropagation() },
      h('div', { className: 'tiroir-haut' },
        h('span', { className: 'tiroir-titre' }, 'Mes pages'),
        h('button', { className: 'bouton bouton-fermer', 'aria-label': 'Fermer', onClick: fermer }, '✕')),
      PAGES.map((p) => h('button', {
        className: `tiroir-lien${p.cle === page ? ' active' : ''}`,
        onClick: () => { fermer(); allerA(p.cle) },
      }, h('span', { className: 'tiroir-icone' }, icone(p.icone)), p.libelle))))
  document.body.append(voile)
  window.addEventListener('keydown', touche)
}

const entete = h('header', { className: 'entete' },
  h('button', { className: 'burger', 'aria-label': 'Menu', onClick: ouvrirMenu },
    (() => {
      const span = document.createElement('span')
      span.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>'
      return span.firstChild
    })()),
  h('div', { className: 'entete-centre' },
    sousTitre,
    h('div', { className: 'entete-titre' }, 'Casiers chantier')),
  h('span', { className: 'profil-bouton', 'aria-hidden': 'true' }, icone('grue', 24)))

// ---- Navigation entre les écrans ----

// Choisir une page dans le menu ouvre toujours sa liste des chantiers
function allerA(cle) {
  page = cle
  afficherPage()
  if (donnees) ecrans[cle].accueil()
}

function afficherPage() {
  sousTitre.textContent = PAGES.find((p) => p.cle === page).libelle
  principal.replaceChildren(zones[page])
  if (donnees) ecrans[page].afficher(donnees)
}

// ---- Chargement et suivi des changements ----

// Un appel pendant un chargement en demande un nouveau à la suite : le chargement en cours
// a pu lire les tables avant la dernière écriture
let enCours = null
let aRefaire = false
function recharger() {
  if (enCours) {
    aRefaire = true
    return enCours
  }
  enCours = (async () => {
    try {
      do {
        aRefaire = false
        donnees = await chargerTout()
        ecrans[page].afficher(donnees)
      } while (aRefaire)
    } catch (e) {
      afficherErreur(e)
    } finally {
      enCours = null
    }
  })()
  return enCours
}

try {
  document.body.prepend(entete)
  afficherPage()
  grist.ready({ requiredAccess: 'full' })
  grist.onRecords(() => recharger()) // toute modification de la table liée relance l'affichage
  recharger()
} catch (e) {
  afficherErreur(e)
}
