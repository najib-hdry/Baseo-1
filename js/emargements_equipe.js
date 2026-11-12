// Page « Émargements » du chef d'équipe (téléphone) : deux onglets.
// - À émarger : émargements de son équipe pas encore faits, aujourd'hui et jours passés (les oublis restent visibles) ;
//   le chef émarge à la place du salarié (même fiche à pictogrammes que la page Présence).
// - À valider : émargements faits et pas encore validés, toutes dates ; corriger, valider un par un ou « Tout valider ».
// Regroupés par jour (le plus récent en haut), puis une carte par salarié. Un émargement validé n'apparaît plus.
import { h, icone, depuisGrist } from './outils.js'
import { nomContact, validerEmargements, equipeDuChef } from './donnees.js'
import { ETATS_PRESENCE, dureePresence, heurePrevueEmargement, ouvrirFicheEmargement } from './presence.js'

const ONGLETS_EMARGEMENT_CHEF = [['aemarger', 'À émarger'], ['avalider', 'À valider']]
const heureEmargementChef = (v) => (v ? new Date(v * 1000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—')
// Jour d'un émargement (AAAA-MM-JJ, heure locale)
const jourEmargementChef = (v) => {
  const j = new Date(v * 1000)
  return `${j.getFullYear()}-${String(j.getMonth() + 1).padStart(2, '0')}-${String(j.getDate()).padStart(2, '0')}`
}

// Vue dessinée dans `racine` par l'écran Émargements quand la personne connectée est chef d'équipe
export function creerEmargementsEquipe(racine, recharger) {
  let d = null
  let onglet = 'aemarger'

  const pastille = (picto, couleur, texte) => h('span', { className: 'presence-pastille', style: { '--couleur': couleur } }, icone(picto, 16), texte)
  // « Aujourd’hui », « Hier » ou la date en toutes lettres
  const libelleJour = (iso) => {
    const ref = new Date(); ref.setHours(0, 0, 0, 0)
    const ecart = Math.round((new Date(`${iso}T00:00:00`) - ref) / 86400000)
    if (ecart === 0) return 'Aujourd’hui'
    if (ecart === -1) return 'Hier'
    return new Date(`${iso}T00:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
  }
  // Congé accepté qui couvre le jour `iso`
  const enConge = (u, iso) => (d.Demande_de_conge ?? []).some((c) => c.Salarie === u.id && c.Statut === 'Acceptée'
    && depuisGrist(c.Date_debut) <= iso && (depuisGrist(c.Date_fin) || depuisGrist(c.Date_debut)) >= iso)
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
    const prevue = heurePrevueEmargement(e)
    const erreur = h('p', { className: 'erreur', hidden: true })
    const ouvrir = () => ouvrirFicheEmargement(e, {
      titre: `${nomContact(u) || 'Salarié'} · ${type}`,
      question: `${new Date(prevue * 1000).toLocaleDateString('fr-FR')} · ${type === 'Départ' ? 'Départ prévu' : 'Arrivée prévue'} à ${heureEmargementChef(prevue)}`,
      recharger, chef: true,
    })
    const boutonValider = h('button', { className: 'bouton bouton-principal bouton-compact', type: 'button' }, icone('libres', 18), 'Valider')
    boutonValider.addEventListener('click', () => valider([e.id], boutonValider, erreur))
    return h('li', { className: 'emarg-ligne' },
      h('div', { className: 'emarg-ligne-haut' },
        h('strong', null, type), h('span', { className: 'sous-texte' }, `prévu${type === 'Départ' ? '' : 'e'} à ${heureEmargementChef(prevue)}`)),
      h('div', { className: 'equipe-etats' }, ...etats(e)),
      h('div', { className: 'emarg-boutons' },
        h('button', { className: 'bouton bouton-compact', type: 'button', onClick: ouvrir }, icone('crayon', 18), e.Emarge_le ? 'Corriger' : 'Émarger à sa place'),
        e.Emarge_le && boutonValider),
      erreur)
  }

  function rendre() {
    if (!d) return
    const equipe = d.absentes.has('Utilisateurs') ? [] : equipeDuChef(d)
    const finAujourdhui = new Date().setHours(24, 0, 0, 0) / 1000
    const deLEquipe = (d.Emargement_Salarie ?? []).filter((e) => !e.Emargement_valide && heurePrevueEmargement(e) && equipe.some((u) => u.id === e.Salarie))
    const aEmarger = deLEquipe.filter((e) => !e.Emarge_le && heurePrevueEmargement(e) < finAujourdhui)
    const aValider = deLEquipe.filter((e) => e.Emarge_le)
    const liste = onglet === 'aemarger' ? aEmarger : aValider

    // Par jour (le plus récent en haut), puis par salarié ; arrivée avant départ
    const parJour = new Map()
    for (const e of [...liste].sort((a, b) => heurePrevueEmargement(b) - heurePrevueEmargement(a))) {
      const jour = jourEmargementChef(heurePrevueEmargement(e))
      if (!parJour.has(jour)) parJour.set(jour, new Map())
      const parSalarie = parJour.get(jour)
      parSalarie.set(e.Salarie, [...(parSalarie.get(e.Salarie) ?? []), e])
    }
    const ordreLigne = (a, b) => (a.Arrivee_Depart === 'Départ') - (b.Arrivee_Depart === 'Départ')

    const erreurTout = h('p', { className: 'erreur', hidden: true })
    const toutValider = h('button', { className: 'bouton bouton-principal presence-emarger', type: 'button' }, icone('cadenas', 22), `Tout valider (${aValider.length})`)
    toutValider.addEventListener('click', () => valider(aValider.map((e) => e.id), toutValider, erreurTout))
    const vide = onglet === 'aemarger' ? 'Tous les émargements de l’équipe sont faits.' : 'Rien à valider.'

    racine.replaceChildren(h('div', { className: 'mes-taches' },
      h('section', { className: 'taches-entete' },
        h('span', { className: 'taches-pastille' }, 'Émargements'),
        h('h1', null, 'Présence de l’équipe'),
        h('p', { className: 'sous-texte' }, `${aEmarger.length} à émarger · ${aValider.length} à valider`)),
      h('div', { className: 'onglets', role: 'tablist', 'aria-label': 'Émargements' }, ONGLETS_EMARGEMENT_CHEF.map(([cle, libelle]) =>
        h('button', { className: 'onglet', role: 'tab', 'aria-selected': String(cle === onglet), onClick: () => { onglet = cle; rendre() } },
          `${libelle} (${(cle === 'aemarger' ? aEmarger : aValider).length})`))),
      onglet === 'avalider' && aValider.length > 0 && toutValider, erreurTout,
      parJour.size === 0 ? h('p', { className: 'taches-vide' }, icone('libres', 32), vide)
        : [...parJour].map(([jour, parSalarie]) => h('section', { className: 'emarg-jour' },
          h('h2', { className: 'emarg-jour-titre' }, libelleJour(jour)),
          h('ul', { className: 'emarg-cartes' }, [...parSalarie].map(([id, lignes]) => {
            const u = d.parId.Utilisateurs.get(id)
            return h('li', { className: 'emarg-carte' },
              h('h2', null, h('span', { className: 'tache-ligne-picto' }, icone('occupes', 24)), nomContact(u) || 'Sans nom',
                enConge(u, jour) && pastille('soleil', '#007EBD', 'En congé')),
              h('ul', { className: 'emarg-lignes' }, lignes.sort(ordreLigne).map((e) => ligne(u, e))))
          }))))))
  }

  return {
    afficher(donnees) {
      d = donnees
      rendre()
    },
    accueil() {
      onglet = 'aemarger'
      rendre()
    },
  }
}
