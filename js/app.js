// Application « Casiers chantier » dans Grist : en-tête, menu « Mes pages »
// et les deux écrans (casiers, incidents), comme l'application Supabase.
/* global grist */
import { h, icone, afficherErreur } from './outils.js'
import { chargerTout } from './donnees.js'
import { creerEcranCasiers } from './casiers.js'
import { creerEcranIncidents } from './incidents.js'
import { creerEcranRapport, NETTOYAGE, MAINTENANCE } from './rapports.js'
import { creerEcranAdmin } from './admin.js'
import { creerEcranAnnuaire, ENTREPRISES, SOUS_TRAITANTS } from './annuaire.js'
import { creerEcranPostes } from './postes.js'

// `admin` : page visible seulement par le profil Admin. La première page visible s'ouvre au démarrage.
const PAGES = [
  { cle: 'chantiers', libelle: 'Gestion des chantiers', icone: 'grue', admin: true },
  { cle: 'casiers', libelle: 'Gestion des casiers', icone: 'total' },
  { cle: 'incidents', libelle: 'Gestion des incidents', icone: 'hs' },
  { cle: 'nettoyage', libelle: 'Contrôle nettoyage', icone: 'nettoyage' },
  { cle: 'maintenance', libelle: 'Maintenance', icone: 'maintenance' },
  { cle: 'entreprises', libelle: 'Gestion des entreprises', icone: 'entreprise', admin: true },
  { cle: 'sous_traitants', libelle: 'Gestion des sous-traitants', icone: 'sous_traitant', admin: true },
  { cle: 'postes', libelle: 'Gestion des postes', icone: 'poste', admin: true },
]
const pagesVisibles = () => PAGES.filter((p) => !p.admin || donnees?.moi?.profil === 'Admin')

const principal = document.getElementById('app')
const zones = Object.fromEntries(PAGES.map((p) => [p.cle, h('div')]))
const ecrans = {
  casiers: creerEcranCasiers(zones.casiers, () => recharger()),
  incidents: creerEcranIncidents(zones.incidents, () => recharger()),
  nettoyage: creerEcranRapport(zones.nettoyage, () => recharger(), NETTOYAGE),
  maintenance: creerEcranRapport(zones.maintenance, () => recharger(), MAINTENANCE),
  chantiers: creerEcranAdmin(zones.chantiers, () => recharger()),
  entreprises: creerEcranAnnuaire(zones.entreprises, () => recharger(), ENTREPRISES),
  sous_traitants: creerEcranAnnuaire(zones.sous_traitants, () => recharger(), SOUS_TRAITANTS),
  postes: creerEcranPostes(zones.postes, () => recharger()),
}
// Page choisie dans le menu ; tant qu'il n'y en a pas (ou si elle n'est pas visible), la première page visible
let choix = null
const pageCourante = () => (pagesVisibles().some((p) => p.cle === choix) ? choix : pagesVisibles()[0].cle)
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
      donnees?.moi && h('p', { className: 'tiroir-profil' }, [donnees.moi.nom, donnees.moi.profil].filter(Boolean).join(' · ')),
      pagesVisibles().map((p) => h('button', {
        className: `tiroir-lien${p.cle === pageCourante() ? ' active' : ''}`,
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
  choix = cle
  afficherPage()
  if (donnees?.moi) ecrans[cle].accueil()
}

function afficherPage() {
  const page = pageCourante()
  sousTitre.textContent = PAGES.find((p) => p.cle === page).libelle
  if (donnees && !donnees.moi) {
    principal.replaceChildren(h('h1', null, 'Accès non configuré'),
      h('p', { className: 'message' }, 'Ton compte n’a pas encore de profil actif dans l’application. Demande à l’administrateur de t’ajouter dans la table Utilisateurs.'))
    return
  }
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
        afficherPage()
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
