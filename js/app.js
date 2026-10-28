// Application « Casiers chantier » dans Grist : en-tête, menu « Mes pages »
// et les deux écrans (casiers, incidents), comme l'application Supabase.
/* global grist */
import { h, icone, afficherErreur, logoMarque } from './outils.js'
import { chargerTout, estAdmin } from './donnees.js'
import { creerEcranCasiers } from './casiers.js'
import { creerEcranIncidents } from './incidents.js'
import { creerEcranRapport, NETTOYAGE, MAINTENANCE } from './rapports.js'
import { creerEcranAdmin } from './admin.js'
import { creerEcranAnnuaire, ENTREPRISES, SOUS_TRAITANTS } from './annuaire.js'
import { creerEcranPostes } from './postes.js'
import { creerEcranCandidats } from './candidats.js'
import { creerEcranUtilisateurs } from './utilisateurs.js'
import { creerEcranEmargements } from './emargements.js'
import { creerEcranAcomptes } from './acomptes.js'
import { creerEcranConges } from './conges.js'
import { creerEcranStocks } from './stocks.js'
import { creerEcranTableauDeBord } from './tableau_bord.js'

// Groupes du menu, dans l'ordre : titre et couleur (pastille, icônes, sur-titre de la page)
const GROUPES = [
  { cle: 'pilotage', titre: 'Pilotage', couleur: '#00A470' },
  { cle: 'chantiers', titre: 'Chantiers', couleur: '#007EBD' },
  { cle: 'partenaires', titre: 'Partenaires', couleur: '#7E9A12' },
  { cle: 'rh', titre: 'Ressources humaines', couleur: '#946AAB' },
  { cle: 'stocks', titre: 'Stocks', couleur: '#C9861A' },
]
// `groupe` : groupe du menu ; `admin` : page visible seulement par le profil Admin ;
// `parent` : sous-page, affichée décalée sous sa page. La première page visible s'ouvre au démarrage.
const PAGES = [
  { cle: 'tableau_bord', libelle: 'Tableau de bord', icone: 'tableau_bord', groupe: 'pilotage', admin: true },
  { cle: 'chantiers', libelle: 'Chantiers', icone: 'grue', groupe: 'chantiers', admin: true },
  { cle: 'casiers', libelle: 'Casiers', icone: 'total', groupe: 'chantiers' },
  { cle: 'incidents', libelle: 'Incidents', icone: 'hs', groupe: 'chantiers' },
  { cle: 'nettoyage', libelle: 'Nettoyage', icone: 'nettoyage', groupe: 'chantiers' },
  { cle: 'maintenance', libelle: 'Maintenance', icone: 'maintenance', groupe: 'chantiers' },
  { cle: 'entreprises', libelle: 'Entreprises', icone: 'entreprise', groupe: 'partenaires', admin: true },
  { cle: 'sous_traitants', libelle: 'Sous-traitants', icone: 'sous_traitant', groupe: 'partenaires', admin: true },
  { cle: 'postes', libelle: 'Postes', icone: 'poste', groupe: 'rh', admin: true },
  { cle: 'candidats', libelle: 'Candidats', icone: 'occupes', groupe: 'rh', admin: true },
  { cle: 'utilisateurs', libelle: 'Utilisateurs', icone: 'utilisateurs', groupe: 'rh', admin: true },
  { cle: 'emargements', libelle: 'Émargements', icone: 'emargements', groupe: 'rh', admin: true },
  { cle: 'conges', libelle: 'Congés', icone: 'conges', groupe: 'rh', admin: true },
  { cle: 'acomptes', libelle: 'Acomptes', icone: 'acomptes', groupe: 'rh', admin: true },
  { cle: 'stocks', libelle: 'Stocks', icone: 'stock', groupe: 'stocks', admin: true },
  { cle: 'catalogue', libelle: 'Catalogue', icone: 'catalogue', groupe: 'stocks', admin: true, parent: 'stocks' },
]
const groupeDe = (page) => GROUPES.find((g) => g.cle === page.groupe) ?? GROUPES[0]
const pagesVisibles = () => PAGES.filter((p) => !p.admin || estAdmin(donnees))

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
  candidats: creerEcranCandidats(zones.candidats, () => recharger()),
  emargements: creerEcranEmargements(zones.emargements, () => recharger()),
  acomptes: creerEcranAcomptes(zones.acomptes, () => recharger()),
  conges: creerEcranConges(zones.conges, () => recharger()),
  stocks: creerEcranStocks(zones.stocks, () => recharger(), 'stocks'),
  tableau_bord: creerEcranTableauDeBord(zones.tableau_bord, () => recharger(), (cle) => allerA(cle)),
  catalogue: creerEcranStocks(zones.catalogue, () => recharger(), 'catalogue'),
  utilisateurs: creerEcranUtilisateurs(zones.utilisateurs, () => recharger(), (id) => ecrans.candidats.modifier(donnees, id)),
}
// Page choisie dans le menu ; tant qu'il n'y en a pas (ou si elle n'est pas visible), la première page visible
let choix = null
const pageCourante = () => (pagesVisibles().some((p) => p.cle === choix) ? choix : pagesVisibles()[0].cle)
let donnees = null

// ---- En-tête et menu ----

// Barre du haut : icône, groupe (sur-titre) et nom de la page ouverte
const iconeTitre = h('span', { className: 'entete-icone', 'aria-hidden': 'true' })
const surTitre = h('div', { className: 'entete-groupe' })
const titrePage = h('div', { className: 'entete-titre' })

// Liens des pages (communs au tiroir du téléphone et au menu latéral de l'ordinateur) ;
// `profil` : le tiroir affiche la personne connectée en tête, le menu latéral dans sa carte du bas
const liensMenu = (avant = () => {}, profil = true) => [
  profil && donnees?.moi && h('p', { className: 'tiroir-profil' }, [donnees.moi.nom, donnees.moi.profil].filter(Boolean).join(' · ')),
  // Un titre par groupe qui a au moins une page visible, puis ses pages ; la couleur du groupe passe par --groupe
  GROUPES.map((g) => {
    const pages = pagesVisibles().filter((p) => groupeDe(p) === g)
    return pages.length === 0 ? [] : [
      h('div', { className: 'menu-groupe', style: { '--groupe': g.couleur } }, g.titre),
      pages.map((p) => h('button', {
        className: `tiroir-lien${p.parent ? ' sous-lien' : ''}${p.cle === pageCourante() ? ' active' : ''}`,
        style: { '--groupe': g.couleur },
        'aria-current': p.cle === pageCourante() ? 'page' : null,
        onClick: () => { avant(); allerA(p.cle) },
      }, h('span', { className: 'tiroir-icone' }, icone(p.icone)), p.libelle)),
    ]
  }),
]

// Téléphone : menu en tiroir, ouvert par le bouton ☰
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
      liensMenu(fermer)))
  document.body.append(voile)
  window.addEventListener('keydown', touche)
}

// Ordinateur : menu latéral toujours ouvert (le CSS l'affiche à partir de 900 px et masque alors le bouton ☰) :
// logo, pages, puis la carte de la personne connectée
const menuLateral = h('nav', { className: 'menu-lateral', 'aria-label': 'Mes pages' })
// Redessiné à chaque changement de page : sur un petit écran, la liste des pages garde sa position de défilement
// et la page active est ramenée dans la partie visible (sans faire défiler le reste de l'écran)
function dessinerMenuLateral() {
  const position = menuLateral.querySelector('.menu-liens')?.scrollTop ?? 0
  const liste = h('div', { className: 'menu-liens' }, liensMenu(undefined, false))
  menuLateral.replaceChildren(
    h('div', { className: 'menu-logo' }, logoMarque(), h('span', { className: 'menu-sous-titre' }, 'Gestion des chantiers')),
    liste,
    ...(donnees?.moi ? [h('div', { className: 'menu-utilisateur' },
      h('span', { className: 'menu-avatar' }, icone('occupes', 22)),
      h('span', { className: 'menu-utilisateur-texte' }, h('strong', null, donnees.moi.nom || donnees.moi.profil),
        donnees.moi.nom && h('span', null, donnees.moi.profil)))] : []))
  liste.scrollTop = position
  const actif = liste.querySelector('.tiroir-lien.active')
  if (!actif) return
  const zone = liste.getBoundingClientRect()
  const lien = actif.getBoundingClientRect()
  if (lien.top < zone.top) liste.scrollTop -= zone.top - lien.top + 8
  else if (lien.bottom > zone.bottom) liste.scrollTop += lien.bottom - zone.bottom + 8
}

const entete = h('header', { className: 'entete' },
  h('button', { className: 'burger', 'aria-label': 'Menu', onClick: ouvrirMenu },
    (() => {
      const span = document.createElement('span')
      span.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>'
      return span.firstChild
    })()),
  iconeTitre,
  h('div', { className: 'entete-centre' }, surTitre, titrePage),
  h('span', { className: 'entete-logo' }, logoMarque()))

// ---- Navigation entre les écrans ----

// Choisir une page dans le menu la ramène toujours à son accueil
function allerA(cle) {
  choix = cle
  afficherPage()
  if (donnees?.moi) ecrans[cle].accueil()
  window.scrollTo(0, 0) // la nouvelle page s'ouvre en haut, pas au défilement de la précédente
}

function afficherPage() {
  const page = pageCourante()
  const infos = PAGES.find((p) => p.cle === page)
  titrePage.textContent = infos.libelle
  surTitre.textContent = groupeDe(infos).titre
  entete.style.setProperty('--groupe', groupeDe(infos).couleur) // couleur du groupe : icône et sur-titre
  iconeTitre.replaceChildren(icone(infos.icone, 24))
  dessinerMenuLateral() // page active et pages visibles (admin) à jour
  if (donnees && !donnees.moi) {
    principal.replaceChildren(h('h1', null, donnees.refus ? 'Profil non vérifié' : 'Accès non configuré'),
      h('p', { className: 'message' }, donnees.refus ?? 'Ton compte n’a pas encore de profil actif dans l’application. Demande à l’administrateur de t’ajouter dans la table Utilisateurs.'))
    return
  }
  // Avant le premier chargement : un message plutôt qu'une page vide
  principal.replaceChildren(donnees ? zones[page] : h('p', { className: 'attente' }, 'Chargement des données…'))
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
    document.body.classList.add('synchro') // barre animée sous l'en-tête pendant la mise à jour
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
      document.body.classList.remove('synchro')
    }
  })()
  return enCours
}

try {
  // Menu latéral sur toute la hauteur à gauche ; à droite, la barre du haut puis la page (le menu n'apparaît que sur grand écran)
  const disposition = h('div', { className: 'disposition' })
  principal.replaceWith(disposition)
  disposition.append(menuLateral, h('div', { className: 'colonne-principale' }, entete, principal))
  afficherPage()
  grist.ready({ requiredAccess: 'full' })
  grist.onRecords(() => recharger()) // toute modification de la table liée relance l'affichage
  recharger()
} catch (e) {
  afficherErreur(e)
}
