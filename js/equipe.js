// Écran « Équipe » (chef d'équipe, sur téléphone) : les salariés actifs de ses chantiers, avec leur présence du jour,
// leur congé et leur tâche en cours ; une ligne touchée ouvre la fiche du salarié : photo et coordonnées, émargements
// des 7 derniers jours, emploi du temps à venir (une tâche peut être confiée à un autre salarié de ses chantiers)
// et congés en cours ou à venir, en lecture.
import { h, icone, ouvrirPanneau, lienContact, depuisGrist, enFrancais, aujourdhui } from './outils.js'
import { ROLE_CHEF, idsDeListe, lienPhotos, nomContact, modifierTache, equipeDuChef } from './donnees.js'
import { ETATS_PRESENCE, dureePresence, heurePrevueEmargement } from './presence.js'

const dateEquipe = (v) => (v ? new Date(v * 1000) : null) // colonnes Date et heure : secondes depuis 1970
const heureEquipe = (v) => (v ? dateEquipe(v).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—')
const jourEquipe = (v) => dateEquipe(v).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
const memeJourEquipe = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
const JOURS_EMARGEMENTS_EQUIPE = 7 // émargements affichés dans la fiche : les 7 derniers jours
const STATUTS_CONGE_EQUIPE = { Nouvelle: ['En attente', 'en_cours', '#E07B2E'], Acceptée: ['Accepté', 'libres', '#1F8A4C'], Refusée: ['Refusé', 'croix', '#C8382E'] }

export function creerEcranEquipe(racine, recharger) {
  let d = null

  const pastille = (picto, couleur, texte) => h('span', { className: 'presence-pastille', style: { '--couleur': couleur } }, icone(picto, 16), texte)
  // Une ligne de fiche : pictogramme, libellé discret, valeur en gras
  const ligneFiche = (picto, libelle, valeur) => h('div', { className: 'tache-info' },
    h('span', { className: 'tache-info-picto' }, icone(picto, 24)),
    h('div', null, h('span', { className: 'tache-info-libelle' }, libelle), h('strong', null, valeur)))

  const equipe = () => equipeDuChef(d)
  const heurePrevue = heurePrevueEmargement
  const emargementsDe = (u) => (d.Emargement_Salarie ?? []).filter((e) => e.Salarie === u.id && heurePrevue(e))
  const tachesDe = (u) => (d.Emploi_du_temps ?? []).filter((t) => t.Salarie === u.id && t.Date_debut).sort((a, b) => a.Date_debut - b.Date_debut)
  const congesDe = (u) => (d.Demande_de_conge ?? []).filter((c) => c.Salarie === u.id)
  const finConge = (c) => depuisGrist(c.Date_fin) || depuisGrist(c.Date_debut)
  const enCongeAujourdhui = (u) => congesDe(u).some((c) => c.Statut === 'Acceptée' && depuisGrist(c.Date_debut) <= aujourdhui() && finConge(c) >= aujourdhui())

  // Présence du jour (arrivée) : état déclaré, « pas encore émargé », ou rien si aucun émargement n'est prévu
  function presenceDuJour(u) {
    const arrivee = emargementsDe(u).find((e) => e.Arrivee_Depart !== 'Départ' && memeJourEquipe(dateEquipe(heurePrevue(e)), new Date()))
    if (!arrivee) return null
    if (!arrivee.Emarge_le) return pastille('en_cours', '#5B6B78', 'Pas encore émargé')
    return etatEmargement(arrivee)
  }
  const etatEmargement = (e) => {
    const [, libelle, picto, couleur] = ETATS_PRESENCE.find(([etat]) => etat === e.Etat) ?? ETATS_PRESENCE[0]
    return pastille(picto, couleur, e.Etat === 'En retard' && e.Duree_retard ? `${libelle} · ${dureePresence(e.Duree_retard)}` : libelle)
  }
  // Tâche en cours, sinon la prochaine de la journée
  const tacheDuJour = (u) => tachesDe(u).find((t) => memeJourEquipe(dateEquipe(t.Date_debut), new Date()) && (t.Date_fin || t.Date_debut) * 1000 >= Date.now())

  function rendre() {
    if (!d) return
    if (d.moi.profil !== ROLE_CHEF) {
      racine.replaceChildren(h('p', { className: 'message' }, 'Page réservée aux chefs d’équipe.'))
      return
    }
    const salaries = d.absentes.has('Utilisateurs') ? [] : equipe()
    racine.replaceChildren(h('div', { className: 'mes-taches' },
      h('section', { className: 'taches-entete' },
        h('span', { className: 'taches-pastille' }, 'Équipe'),
        h('h1', null, 'Mon équipe'),
        h('p', { className: 'sous-texte' }, `${salaries.length} salarié${salaries.length > 1 ? 's' : ''} sur tes chantiers`)),
      salaries.length === 0 ? h('p', { className: 'taches-vide' }, icone('utilisateurs', 32), 'Aucun salarié sur tes chantiers.')
        : h('ul', { className: 'taches-liste' }, salaries.map((u) => {
          const tache = tacheDuJour(u)
          return h('li', null, h('button', { className: 'tache-ligne', type: 'button', onClick: () => ouvrirFiche(u) },
            h('span', { className: 'tache-ligne-picto' }, icone('occupes', 28)),
            h('span', { className: 'tache-ligne-texte' }, h('strong', null, nomContact(u) || 'Sans nom'),
              h('span', { className: 'equipe-etats' }, ...[enCongeAujourdhui(u) ? pastille('soleil', '#007EBD', 'En congé') : presenceDuJour(u)].filter(Boolean)),
              tache && h('span', { className: 'tache-ligne-heure' }, icone('en_cours', 16), `${heureEquipe(tache.Date_debut)} · ${tache.Titre || 'Tâche'}`)),
            h('span', { className: 'tache-ligne-fleche' }, icone('fleche', 18))))
        }))))
  }

  // ---- Fiche du salarié ----

  async function ouvrirFiche(u) {
    const lien = await lienPhotos().catch(() => null)
    // Photo : celle de la fiche d'embauche (candidat lié au compte), si le chef peut la lire
    const photo = idsDeListe((d.Candidats ?? []).find((c) => c.Utilisateur === u.id)?.Photo)[0]
    const depuis = Date.now() / 1000 - JOURS_EMARGEMENTS_EQUIPE * 86400
    const emargements = emargementsDe(u).filter((e) => heurePrevue(e) >= depuis && heurePrevue(e) * 1000 <= Date.now() + 86400000)
      .sort((a, b) => heurePrevue(b) - heurePrevue(a))
    const debutJour = new Date().setHours(0, 0, 0, 0) / 1000
    const aVenir = tachesDe(u).filter((t) => (t.Date_fin || t.Date_debut) >= debutJour)
    // Ni les congés passés ni les refusés : acceptés et demandes en attente, en cours ou à venir
    const conges = congesDe(u).filter((c) => c.Statut !== 'Refusée' && finConge(c) >= aujourdhui()).sort((a, b) => (a.Date_debut ?? 0) - (b.Date_debut ?? 0))
    const titre = (picto, texte) => h('h2', { className: 'equipe-titre' }, icone(picto, 22), texte)
    const vide = (texte) => h('p', { className: 'sous-texte' }, texte)

    const { ouvrirDepuis } = ouvrirPanneau(nomContact(u) || 'Salarié', h('div', { className: 'tache-fiche' },
      h('div', { className: 'equipe-photo' }, photo && lien
        ? h('img', { className: 'photo-candidat', src: lien(photo), alt: `Photo de ${nomContact(u)}` })
        : h('span', { className: 'photo-vide', 'aria-label': 'Pas de photo' }, icone('occupes', 48))),
      ligneFiche('occupes', 'Nom', u.Nom || '—'),
      ligneFiche('occupes', 'Prénom', u.Prenom || '—'),
      ligneFiche('telephone', 'Téléphone', lienContact('tel', u.Telephone) || '—'),
      ligneFiche('email', 'Email', lienContact('mailto', u.Email) || '—'),

      titre('emargements', 'Émargements (7 derniers jours)'),
      emargements.length === 0 ? vide('Aucun émargement.') : h('ul', { className: 'equipe-liste' }, emargements.map((e) => h('li', null,
        h('span', null, h('strong', null, `${jourEquipe(heurePrevue(e))} · ${e.Arrivee_Depart || 'Arrivée'}`), ` ${e.Arrivee_Depart === 'Départ' ? 'prévu' : 'prévue'} à ${heureEquipe(heurePrevue(e))}`),
        h('span', { className: 'equipe-etats' }, ...[e.Emarge_le ? etatEmargement(e) : pastille('en_cours', '#5B6B78', 'Pas émargé'),
          e.Parti_plus_tot && pastille('sortie', '#7C3AED', `Parti plus tôt${e.Duree_parti_tot ? ` · ${dureePresence(e.Duree_parti_tot)}` : ''}`),
          e.Heures_sup_faites && pastille('heures_sup', '#007EBD', `Heures sup${e.Duree_heures_sup ? ` · ${dureePresence(e.Duree_heures_sup)}` : ''}`),
          e.Emargement_valide && pastille('cadenas', '#1F8A4C', 'Validé')].filter(Boolean))))),

      titre('conges', 'Emploi du temps'),
      aVenir.length === 0 ? vide('Aucune tâche prévue.') : h('ul', { className: 'equipe-liste' }, aVenir.map((t) => h('li', null,
        h('span', null, h('strong', null, t.Titre || 'Tâche'), h('br'), `${jourEquipe(t.Date_debut)} · ${heureEquipe(t.Date_debut)} → ${heureEquipe(t.Date_fin)}`,
          t.Chantier && d.parId.Chantiers.get(t.Chantier) ? ` · ${d.parId.Chantiers.get(t.Chantier).Nom}` : ''),
        h('button', { className: 'bouton bouton-compact', type: 'button', onClick: () => ouvrirDepuis(() => confier(t, u)) }, 'Confier à…')))),

      titre('soleil', 'Congés en cours et à venir'),
      conges.length === 0 ? vide('Aucun congé prévu.') : h('ul', { className: 'equipe-liste' }, conges.map((c) => {
        const [libelle, picto, couleur] = STATUTS_CONGE_EQUIPE[c.Statut] ?? STATUTS_CONGE_EQUIPE.Nouvelle
        const debut = enFrancais(depuisGrist(c.Date_debut))
        const fin = enFrancais(finConge(c))
        return h('li', null, h('span', null, h('strong', null, c.Type || 'Congé'), h('br'), debut === fin ? `Le ${debut}` : `Du ${debut} au ${fin}`),
          pastille(picto, couleur, libelle))
      }))))
  }

  // Confier la tâche `t` de `u` à un autre salarié des chantiers du chef ; ses émargements suivent la tâche
  // (ceux de l'ancien salarié restés sans tâche sont supprimés, sauf ceux qu'il a déjà signés)
  function confier(t, u) {
    const autres = equipe().filter((x) => x.id !== u.id)
    let choisi = 0
    const erreur = h('p', { className: 'erreur', hidden: true })
    const valider = h('button', { className: 'bouton bouton-principal', type: 'submit', disabled: true }, 'Confier la tâche')
    const formulaire = h('form', { className: 'formulaire', onSubmit: async (ev) => {
      ev.preventDefault()
      erreur.hidden = true
      valider.disabled = true
      try {
        await modifierTache(d, t.id, { Salarie: choisi, Date_debut: t.Date_debut, Date_fin: t.Date_fin }, [], 'nonEmarges')
        fermer()
        await recharger()
        const aJour = d.parId.Utilisateurs.get(u.id)
        if (aJour) ouvrirFiche(aJour)
      } catch (err) {
        erreur.textContent = /access|blocked|permission/i.test(err?.message ?? '')
          ? 'Ton compte ne peut pas modifier cette tâche (droits). Préviens le bureau.' : err.message || 'La tâche n’a pas pu être confiée.'
        erreur.hidden = false
        valider.disabled = false
      }
    } },
    ligneFiche('conges', t.Titre || 'Tâche', `${jourEquipe(t.Date_debut)} · ${heureEquipe(t.Date_debut)} → ${heureEquipe(t.Date_fin)}`),
    autres.length === 0 ? h('p', { className: 'message' }, 'Aucun autre salarié sur tes chantiers.')
      : h('div', { className: 'equipe-choix', role: 'radiogroup', 'aria-label': 'Salarié' }, autres.map((x) => h('label', { className: 'case' },
        h('input', { type: 'radio', name: 'confier', value: String(x.id), onChange: () => { choisi = x.id; valider.disabled = false } }),
        nomContact(x) || 'Sans nom'))),
    erreur, valider)
    const { fermer } = ouvrirPanneau(`Confier la tâche de ${nomContact(u) || 'ce salarié'}`, formulaire)
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
