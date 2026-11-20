// Écran « Formation » (Admin, RH, CIP, chef d'équipe, salarié) : page en préparation, sans contenu pour l'instant.
// La table Grist « Formation » existe déjà (sans colonne) ; elle n'est pas encore chargée par l'application.
import { h } from './outils.js'
import { accesPage } from './donnees.js'

export function creerEcranFormation(racine) {
  let d = null

  function rendre() {
    if (!d) return
    if (!accesPage(d, 'formation')) {
      racine.replaceChildren(h('p', { className: 'message' }, 'Cette page n’est pas disponible pour ton profil.'))
      return
    }
    racine.replaceChildren(h('section', { className: 'carte-tableau' },
      h('p', { className: 'message' }, 'Page en préparation : les formations arriveront bientôt.')))
  }

  return {
    afficher(donnees) {
      d = donnees
      rendre()
    },
    accueil() {
      rendre()
    },
  }
}
