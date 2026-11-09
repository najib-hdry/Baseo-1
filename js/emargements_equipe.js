// Page « Émargements » du chef d'équipe (téléphone) : les émargements de son équipe pour un jour (hier, aujourd'hui, demain),
// une carte par salarié avec son arrivée et son départ. Le chef émarge à la place d'un salarié, corrige ce qu'il a déclaré
// (même fiche à pictogrammes que la page Présence) et valide, un par un ou tous les émargements signés du jour.
// Un émargement validé est verrouillé.
import { h, icone, depuisGrist } from './outils.js'
import { nomContact, validerEmargements, equipeDuChef } from './donnees.js'
import { ETATS_PRESENCE, dureePresence, heurePrevueEmargement, ouvrirFicheEmargement } from './presence.js'

const JOURS_EMARGEMENT_CHEF = [[-1, 'Hier'], [0, 'Aujourd’hui'], [1, 'Demain']]
const heureEmargementChef = (v) => (v ? new Date(v * 1000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—')

// Vue dessinée dans `racine` par l'écran Émargements quand la personne connectée est chef d'équipe
export function creerEmargementsEquipe(racine, recharger) {
  let d = null
  let decalage = 0 // jour affiché : -1 hier, 0 aujourd'hui, 1 demain

  const pastille = (picto, couleur, texte) => h('span', { className: 'presence-pastille', style: { '--couleur': couleur } }, icone(picto, 16), texte)
  const jourAffiche = () => { const j = new Date(); j.setHours(0, 0, 0, 0); j.setDate(j.getDate() + decalage); return j }
  const duJour = (e) => {
    const debut = jourAffiche().getTime() / 1000
    const v = heurePrevueEmargement(e)
    return v >= debut && v < debut + 86400
  }
  // Congé accepté qui couvre le jour affiché (dates au format AAAA-MM-JJ)
  const enConge = (u) => {
    const j = jourAffiche()
    const iso = `${j.getFullYear()}-${String(j.getMonth() + 1).padStart(2, '0')}-${String(j.getDate()).padStart(2, '0')}`
    return (d.Demande_de_conge ?? []).some((c) => c.Salarie === u.id && c.Statut === 'Acceptée'
      && depuisGrist(c.Date_debut) <= iso && (depuisGrist(c.Date_fin) || depuisGrist(c.Date_debut)) >= iso)
  }
  // Ce que le salarié a déclaré (ou le chef à sa place)
  const etats = (e) => {
    if (!e.Emarge_le) return [pastille('en_cours', '#5B6B78', 'Pas encore émargé')]
    const [, libelle, picto, couleur] = ETATS_PRESENCE.find(([etat]) => etat === e.Etat) ?? ETATS_PRESENCE[0]
    return [pastille(picto, couleur, e.Etat === 'En retard' && e.Duree_retard ? `${libelle} · ${dureePresence(e.Duree_retard)}` : libelle),
      e.Parti_plus_tot && pastille('sortie', '#7C3AED', `Parti plus tôt${e.Duree_parti_tot ? ` · ${dureePresence(e.Duree_parti_tot)}` : ''}`),
      e.Heures_sup_faites && pastille('heures_sup', '#007EBD', `Heures sup${e.Duree_heures_sup ? ` · ${dureePresence(e.Duree_heures_sup)}` : ''}`)].filter(Boolean)
  }

  // Validation d'un ou plusieurs émargements ; `bouton` : désactivé pendant l'envoi, message en cas de refus
  async function valider(ids, bouton, erreur) {
    bouton.disabled = true
    erreur.hidden = true
    try {
      await validerEmargements(ids)
      await recharger()
    } catch (err) {
      erreur.textContent = /access|blocked|permission/i.test(err?.message ?? '')
        ? 'Ton compte ne peut pas valider ces émargements (droits). Préviens le bureau.' : err.message || 'La validation a échoué.'
      erreur.hidden = false
      bouton.disabled = false
    }
  }

  // Une ligne : arrivée ou départ, heure prévue, ce qui est déclaré, et les boutons du chef
  function ligne(u, e) {
    const type = e.Arrivee_Depart || 'Arrivée'
    const erreur = h('p', { className: 'erreur', hidden: true })
    const ouvrir = () => ouvrirFicheEmargement(e, {
      titre: `${nomContact(u) || 'Salarié'} · ${type}`,
      question: `${jourAffiche().toLocaleDateString('fr-FR')} · ${type === 'Départ' ? 'Départ prévu' : 'Arrivée prévue'} à ${heureEmargementChef(heurePrevueEmargement(e))}`,
      recharger, chef: true,
    })
    const boutonValider = h('button', { className: 'bouton bouton-principal bouton-compact', type: 'button' }, icone('libres', 18), 'Valider')
    boutonValider.addEventListener('click', () => valider([e.id], boutonValider, erreur))
    return h('li', { className: 'emarg-ligne' },
      h('div', { className: 'emarg-ligne-haut' },
        h('strong', null, type), h('span', { className: 'sous-texte' }, `prévu${type === 'Départ' ? '' : 'e'} à ${heureEmargementChef(heurePrevueEmargement(e))}`)),
      h('div', { className: 'equipe-etats' }, ...etats(e)),
      e.Emargement_valide
        ? h('p', { className: 'presence-valide' }, icone('cadenas', 18), 'Validé')
        : h('div', { className: 'emarg-boutons' },
          h('button', { className: 'bouton bouton-compact', type: 'button', onClick: ouvrir }, icone('crayon', 18), e.Emarge_le ? 'Corriger' : 'Émarger à sa place'),
          e.Emarge_le && boutonValider),
      erreur)
  }

  function rendre() {
    if (!d) return
    const equipe = d.absentes.has('Utilisateurs') ? [] : equipeDuChef(d)
    const parSalarie = equipe.map((u) => [u, (d.Emargement_Salarie ?? []).filter((e) => e.Salarie === u.id && heurePrevueEmargement(e) && duJour(e))
      .sort((a, b) => (a.Arrivee_Depart === 'Départ') - (b.Arrivee_Depart === 'Départ'))]).filter(([, liste]) => liste.length > 0)
    const aValider = parSalarie.flatMap(([, liste]) => liste).filter((e) => e.Emarge_le && !e.Emargement_valide)
    const erreurTout = h('p', { className: 'erreur', hidden: true })
    const toutValider = h('button', { className: 'bouton bouton-principal presence-emarger', type: 'button' }, icone('cadenas', 22), `Tout valider (${aValider.length})`)
    toutValider.addEventListener('click', () => valider(aValider.map((e) => e.id), toutValider, erreurTout))

    racine.replaceChildren(h('div', { className: 'mes-taches' },
      h('section', { className: 'taches-entete' },
        h('span', { className: 'taches-pastille' }, 'Émargements'),
        h('h1', null, 'Présence de l’équipe'),
        h('p', { className: 'sous-texte' }, aValider.length ? `${aValider.length} émargement${aValider.length > 1 ? 's' : ''} à valider` : 'Rien à valider')),
      h('div', { className: 'onglets', role: 'tablist', 'aria-label': 'Jour' }, JOURS_EMARGEMENT_CHEF.map(([n, libelle]) =>
        h('button', { className: 'onglet', role: 'tab', 'aria-selected': String(n === decalage), onClick: () => { decalage = n; rendre() } }, libelle))),
      aValider.length > 0 && toutValider, erreurTout,
      parSalarie.length === 0 ? h('p', { className: 'taches-vide' }, icone('libres', 32), 'Aucun émargement prévu ce jour-là.')
        : h('ul', { className: 'emarg-cartes' }, parSalarie.map(([u, liste]) => h('li', { className: 'emarg-carte' },
          h('h2', null, h('span', { className: 'tache-ligne-picto' }, icone('occupes', 24)), nomContact(u) || 'Sans nom',
            enConge(u) && pastille('soleil', '#007EBD', 'En congé')),
          h('ul', { className: 'emarg-lignes' }, liste.map((e) => ligne(u, e))))))))
  }

  return {
    afficher(donnees) {
      d = donnees
      rendre()
    },
    accueil() {
      decalage = 0
      rendre()
    },
  }
}
