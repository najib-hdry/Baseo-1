// Écran « Communication » du terrain (salarié et chef d'équipe, sur téléphone) : en-tête, onglets Messages (communications
// par site de ses chantiers) et Informations (communications générales), une carte par communication (titre, date, début du
// contenu) et « Lire la suite », qui ouvre la fiche : titre, date, contenu, photo (ou bouton pour un autre fichier).
// Les communications temporaires expirées ne sont pas montrées.
import { h, icone, ouvrirPanneau, depuisGrist, enFrancais, aujourdhui } from './outils.js'
import { lienPhotos, idsDeListe, chantiersCommunication } from './donnees.js'

const ONGLETS_ACTUALITES = [['messages', 'Messages', 'Communication par site'], ['informations', 'Informations', 'Communication générale']]

export function creerEcranActualites(racine) {
  let d = null
  let lien = null // adresse temporaire des fichiers joints (demandée une seule fois)
  let onglet = 'messages'

  // Ses chantiers seulement parmi ceux de la communication (une communication peut viser plusieurs chantiers)
  const nomChantierActu = (c) => chantiersCommunication(c).filter((id) => d.moi.chantiers.includes(id))
    .map((id) => d.parId.Chantiers.get(id)?.Nom).filter(Boolean).join(', ')
  const valable = (c) => c.Type !== 'Temporaire' || !c.Date_expiration || depuisGrist(c.Date_expiration) >= aujourdhui()
  // Communications de l'onglet : générales pour tous, par site seulement pour ses chantiers
  const deLOnglet = (cle) => {
    const niveau = ONGLETS_ACTUALITES.find(([c]) => c === cle)[2]
    return (d.Communication ?? [])
      .filter((c) => (c.Niveau || 'Communication générale') === niveau && valable(c)
        && (niveau !== 'Communication par site' || chantiersCommunication(c).some((id) => d.moi.chantiers.includes(id))))
      .sort((a, b) => (b.Date ?? 0) - (a.Date ?? 0))
  }

  // Fichier joint : une photo s'affiche ; si le navigateur ne sait pas l'afficher (PDF…), un bouton pour l'ouvrir
  const fichierJoint = (id) => {
    if (!lien) return h('p', { className: 'sous-texte' }, 'Fichier joint (aperçu indisponible).')
    const bouton = h('a', { className: 'bouton actu-document', href: lien(id), target: '_blank', rel: 'noreferrer' }, icone('note', 20), 'Ouvrir le document')
    const image = h('img', { className: 'actu-photo', src: lien(id), alt: 'Photo de la communication' })
    image.addEventListener('error', () => image.replaceWith(bouton))
    return h('a', { href: lien(id), target: '_blank', rel: 'noreferrer' }, image)
  }

  function ouvrirActualite(c) {
    const id = idsDeListe(c.Fichier)[0]
    ouvrirPanneau(c.Titre || 'Communication', h('div', { className: 'actu-fiche' },
      h('p', { className: 'actu-date' }, icone('conges', 18), enFrancais(depuisGrist(c.Date)) || '—',
        nomChantierActu(c) ? [' · ', icone('grue', 18), nomChantierActu(c)] : null),
      h('p', { className: 'actu-contenu-complet' }, c.Contenu || ''),
      id && fichierJoint(id)))
  }

  function rendre() {
    if (!d) return
    if (d.absentes.has('Communication')) {
      racine.replaceChildren(h('p', { className: 'message' }, 'Ce document n’a pas de table Communication.'))
      return
    }
    const liste = deLOnglet(onglet)
    racine.replaceChildren(h('div', { className: 'mes-taches actualites' },
      h('section', { className: 'taches-entete' },
        h('span', { className: 'taches-pastille' }, 'Communication'),
        h('h1', null, 'Actualité et communication')),
      h('div', { className: 'actu-onglets', role: 'tablist' }, ONGLETS_ACTUALITES.map(([cle, libelle]) =>
        h('button', { className: 'actu-onglet', type: 'button', role: 'tab', 'aria-selected': String(cle === onglet),
          onClick: () => { onglet = cle; rendre() } },
        icone(cle === 'messages' ? 'communication' : 'note', 20), libelle, h('span', { className: 'actu-compte' }, deLOnglet(cle).length)))),
      liste.length === 0 ? h('p', { className: 'taches-vide' }, icone('libres', 32), onglet === 'messages' ? 'Aucun message pour tes chantiers.' : 'Aucune information pour le moment.')
        : liste.map((c) => h('article', { className: 'actu-carte' },
          h('h2', null, c.Titre || 'Sans titre'),
          h('p', { className: 'actu-date' }, icone('conges', 16), enFrancais(depuisGrist(c.Date)) || '—',
            onglet === 'messages' && nomChantierActu(c) ? [' · ', nomChantierActu(c)] : null,
            idsDeListe(c.Fichier).length > 0 ? [' · ', icone('note', 16)] : null),
          h('p', { className: 'actu-contenu' }, c.Contenu || ''),
          h('button', { className: 'actu-suite', type: 'button', onClick: () => ouvrirActualite(c) }, 'Lire la suite', icone('fleche', 18))))))
  }

  return {
    afficher(donnees) {
      d = donnees
      rendre()
      if (!lien) lienPhotos().then((f) => { lien = f }).catch(() => {})
    },
    accueil() {
      onglet = 'messages'
      rendre()
    },
  }
}
