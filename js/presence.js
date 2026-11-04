// Écran « Présence » (salarié avec auto-émargement, sur téléphone) : en-tête, une fiche de présence par émargement du jour
// (arrivée, départ) et le bouton « Émarger », qui ouvre la fiche d'émargement à gros pictogrammes : présent, en retard
// (arrivée), absent ; parti plus tôt et heures sup (départ), avec leur durée. Un émargement validé ne se modifie plus.
import { h, icone, ouvrirPanneau } from './outils.js'
import { ROLE_SALARIE, modifierLigne } from './donnees.js'

const TABLE_PRESENCE = 'Emargement_Salarie'
// [état, libellé, pictogramme, couleur]
const ETATS_PRESENCE = [
  ['Présent', 'Présent', 'libres', '#1F8A4C'],
  ['En retard', 'En retard', 'en_cours', '#E07B2E'],
  ['Absent', 'Absent', 'croix', '#C8382E'],
]
const DUREES_PRESENCE = [15, 30, 45, 60, 90, 120] // minutes proposées en un toucher
const datePresence = (v) => (v ? new Date(v * 1000) : null) // colonnes Date et heure : secondes depuis 1970
const heurePresence = (v) => (v ? datePresence(v).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—')
const dureePresence = (min) => (min >= 60 ? `${Math.floor(min / 60)} h${min % 60 ? ` ${String(min % 60).padStart(2, '0')}` : ''}` : `${min} min`)
const memeJourPresence = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

export function creerEcranPresence(racine, recharger) {
  let d = null

  // Heure prévue : début pour l'arrivée, fin pour le départ
  const heurePrevue = (e) => (e.Arrivee_Depart === 'Départ' ? e.Heure_fin || e.Heure_debut : e.Heure_debut || e.Heure_fin)
  const ligneFiche = (picto, libelle, valeur) => h('div', { className: 'presence-ligne' },
    h('span', { className: 'presence-ligne-libelle' }, icone(picto, 18), libelle), h('strong', null, valeur))

  // Ce que le salarié a déclaré, en pastilles à pictogramme
  const resume = (e) => {
    const [, libelle, picto, couleur] = ETATS_PRESENCE.find(([etat]) => etat === e.Etat) ?? ETATS_PRESENCE[0]
    return h('div', { className: 'presence-resume' },
      h('span', { className: 'presence-pastille', style: { '--couleur': couleur } }, icone(picto, 18),
        e.Etat === 'En retard' && e.Duree_retard ? `${libelle} · ${dureePresence(e.Duree_retard)}` : libelle),
      e.Parti_plus_tot && h('span', { className: 'presence-pastille', style: { '--couleur': '#7C3AED' } }, icone('sortie', 18),
        `Parti plus tôt${e.Duree_parti_tot ? ` · ${dureePresence(e.Duree_parti_tot)}` : ''}`),
      e.Heures_sup_faites && h('span', { className: 'presence-pastille', style: { '--couleur': '#007EBD' } }, icone('heures_sup', 18),
        `Heures sup${e.Duree_heures_sup ? ` · ${dureePresence(e.Duree_heures_sup)}` : ''}`))
  }

  const fichePresence = (e) => {
    const emarge = Boolean(e.Emarge_le)
    return h('section', { className: 'presence-fiche' },
      h('div', { className: 'presence-fiche-haut' }, h('span', { className: 'presence-fiche-picto' }, icone('crayon', 20)), 'Fiche de présence'),
      h('div', { className: 'presence-fiche-corps' },
        ligneFiche('conges', 'Date', new Date().toLocaleDateString('fr-FR')),
        ligneFiche('en_cours', 'Demi-journée', h('span', { className: 'presence-type' }, e.Arrivee_Depart || 'Arrivée')),
        ligneFiche('en_cours', 'Heure prévue', heurePresence(heurePrevue(e))),
        emarge && ligneFiche('libres', 'Émargé à', heurePresence(e.Emarge_le)),
        emarge && resume(e),
        e.Emargement_valide
          ? h('p', { className: 'presence-valide' }, icone('cadenas', 18), 'Validé par le responsable')
          : h('button', { className: 'bouton bouton-principal presence-emarger', type: 'button', onClick: () => ouvrirEmargement(e) },
            icone('crayon', 22), emarge ? 'Modifier mon émargement' : 'Émarger')))
  }

  // Fiche d'émargement : un gros bouton par état, puis (départ) les cases parti plus tôt / heures sup ; durées en un toucher
  function ouvrirEmargement(e) {
    const depart = e.Arrivee_Depart === 'Départ'
    const champs = {
      Etat: e.Emarge_le ? e.Etat || 'Présent' : 'Présent', Duree_retard: e.Duree_retard || 0,
      Parti_plus_tot: Boolean(e.Parti_plus_tot), Duree_parti_tot: e.Duree_parti_tot || 0,
      Heures_sup_faites: Boolean(e.Heures_sup_faites), Duree_heures_sup: e.Duree_heures_sup || 0,
    }
    const erreur = h('p', { className: 'erreur', hidden: true })
    const valider = h('button', { className: 'bouton bouton-principal presence-emarger', type: 'submit' }, icone('libres', 22), 'Valider')
    const zone = h('div', { className: 'presence-choix' })

    // Durée : boutons de minutes ; `col` : colonne de la durée
    const durees = (col) => h('div', { className: 'presence-durees' },
      DUREES_PRESENCE.map((min) => h('button', { className: 'presence-duree', type: 'button', 'aria-pressed': String(champs[col] === min),
        onClick: () => { champs[col] = min; dessiner() } }, dureePresence(min))))
    // Gros bouton à pictogramme ; `actif` : choisi ou coché
    const tuile = (libelle, picto, couleur, actif, choisir) => h('button', { className: 'presence-tuile', type: 'button',
      style: { '--couleur': couleur }, 'aria-pressed': String(actif), onClick: choisir },
    h('span', { className: 'presence-tuile-picto' }, icone(picto, 34)), h('span', null, libelle))

    function dessiner() {
      const absent = champs.Etat === 'Absent'
      // Les parties absentes (false) sont ignorées : replaceChildren les écrirait en texte
      zone.replaceChildren(...[
        h('div', { className: `presence-tuiles${depart ? ' presence-tuiles-2' : ''}` }, ETATS_PRESENCE.filter(([etat]) => !depart || etat !== 'En retard').map(([etat, libelle, picto, couleur]) =>
          tuile(libelle, picto, couleur, champs.Etat === etat, () => { champs.Etat = etat; dessiner() }))),
        champs.Etat === 'En retard' && [h('p', { className: 'presence-question' }, icone('en_cours', 20), 'Combien de retard ?'), durees('Duree_retard')],
        depart && !absent && h('div', { className: 'presence-tuiles presence-tuiles-2' },
          tuile('Parti plus tôt', 'sortie', '#7C3AED', champs.Parti_plus_tot, () => { champs.Parti_plus_tot = !champs.Parti_plus_tot; dessiner() }),
          tuile('Heures sup', 'heures_sup', '#007EBD', champs.Heures_sup_faites, () => { champs.Heures_sup_faites = !champs.Heures_sup_faites; dessiner() })),
        depart && !absent && champs.Parti_plus_tot && [h('p', { className: 'presence-question' }, icone('sortie', 20), 'Parti combien de temps plus tôt ?'), durees('Duree_parti_tot')],
        depart && !absent && champs.Heures_sup_faites && [h('p', { className: 'presence-question' }, icone('heures_sup', 20), 'Combien d’heures sup ?'), durees('Duree_heures_sup')],
      ].flat().filter(Boolean))
    }
    dessiner()

    const formulaire = h('form', { className: 'formulaire', onSubmit: async (ev) => {
      ev.preventDefault()
      erreur.hidden = true
      const absent = champs.Etat === 'Absent'
      const parti = depart && !absent && champs.Parti_plus_tot
      const sup = depart && !absent && champs.Heures_sup_faites
      const probleme = champs.Etat === 'En retard' && !champs.Duree_retard ? 'Choisis la durée du retard.'
        : parti && !champs.Duree_parti_tot ? 'Choisis de combien tu es parti plus tôt.'
          : sup && !champs.Duree_heures_sup ? 'Choisis la durée des heures sup.' : null
      if (probleme) {
        erreur.textContent = probleme
        erreur.hidden = false
        return
      }
      valider.disabled = true
      try {
        // Les choix masqués sont vidés (un « Présent » ne garde pas une ancienne durée de retard)
        await modifierLigne(TABLE_PRESENCE, e.id, {
          Etat: champs.Etat, Duree_retard: champs.Etat === 'En retard' ? champs.Duree_retard : null,
          Parti_plus_tot: parti, Duree_parti_tot: parti ? champs.Duree_parti_tot : null,
          Heures_sup_faites: sup, Duree_heures_sup: sup ? champs.Duree_heures_sup : null,
          Emarge_le: Date.now() / 1000,
        })
        fermer()
        await recharger()
      } catch (err) {
        erreur.textContent = /access|blocked|permission/i.test(err?.message ?? '')
          ? 'Ton compte ne peut pas émarger (droits). Préviens ton responsable.' : err.message || 'L’émargement n’a pas pu être enregistré.'
        erreur.hidden = false
        valider.disabled = false
      }
    } },
    h('p', { className: 'presence-question' }, icone('conges', 20), `${new Date().toLocaleDateString('fr-FR')} · ${depart ? 'Départ prévu' : 'Arrivée prévue'} à ${heurePresence(heurePrevue(e))}`),
    zone, erreur, valider)
    const { fermer } = ouvrirPanneau(depart ? 'Émarger mon départ' : 'Émarger mon arrivée', formulaire)
  }

  function rendre() {
    if (!d) return
    if (d.moi.profil !== ROLE_SALARIE || !d.moi.emargement) {
      racine.replaceChildren(h('p', { className: 'message' }, 'L’auto-émargement n’est pas activé pour ton compte.'))
      return
    }
    const auj = new Date()
    const duJour = (d[TABLE_PRESENCE] ?? [])
      .filter((e) => e.Salarie === d.moi.id && heurePrevue(e) && memeJourPresence(datePresence(heurePrevue(e)), auj))
      .sort((a, b) => (a.Arrivee_Depart === 'Départ') - (b.Arrivee_Depart === 'Départ'))
    racine.replaceChildren(h('div', { className: 'mes-taches presence' },
      h('section', { className: 'taches-entete' },
        h('span', { className: 'taches-pastille' }, 'Présence'),
        h('h1', null, 'Mon émargement'),
        h('p', { className: 'sous-texte' }, 'Signez votre présence de la demi-journée')),
      d.absentes.has(TABLE_PRESENCE) ? h('p', { className: 'message' }, 'Ce document n’a pas de table Emargement Salarié.')
        : duJour.length === 0 ? h('p', { className: 'taches-vide' }, icone('libres', 32), 'Pas d’émargement prévu aujourd’hui.')
          : duJour.map(fichePresence)))
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
