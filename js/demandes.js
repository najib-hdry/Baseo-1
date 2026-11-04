// Écran « Congé et acompte » (salarié, sur téléphone) : en-tête, deux gros boutons (demander un congé, demander un acompte)
// et ses demandes, de la plus récente à la plus ancienne, avec leur statut en pictogramme. Une demande encore « Nouvelle »
// peut être retirée. Le statut (Nouvelle à la création) est rempli par Grist et changé par l'admin ou les RH.
import { h, icone, ouvrirPanneau, fenetreSuppression, versGrist, depuisGrist, enFrancais, aujourdhui } from './outils.js'
import { ROLE_SALARIE, enregistrerLigne, supprimerLignes } from './donnees.js'

const DEMI_JOURNEE_DEMANDE = 'Une demi-journée'
const PLUSIEURS_JOURS_DEMANDE = 'Plusieurs jours'
// [type, pictogramme]
const TYPES_DEMANDE_CONGE = [[DEMI_JOURNEE_DEMANDE, 'demi'], ['Une journée', 'soleil'], [PLUSIEURS_JOURS_DEMANDE, 'conges']]
const MOMENTS_DEMANDE = [['Matin', 'lever'], ['Après-midi', 'soleil']]
const MONTANTS_ACOMPTE = [50, 100, 150, 200, 300]
// [statut, libellé, pictogramme, couleur]
const STATUTS_DEMANDE = { Nouvelle: ['En attente', 'en_cours', '#E07B2E'], Acceptée: ['Acceptée', 'libres', '#1F8A4C'], Refusée: ['Refusée', 'croix', '#C8382E'] }
const eurosDemande = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 })

export function creerEcranDemandes(racine, recharger) {
  let d = null

  // Période lisible d'un congé : « 12/11/2026 · matin », « 12/11/2026 », « 12/11/2026 → 15/11/2026 »
  const periodeDemande = (c) => {
    const debut = enFrancais(depuisGrist(c.Date_debut))
    const fin = enFrancais(depuisGrist(c.Date_fin))
    if (c.Type === DEMI_JOURNEE_DEMANDE) return `${debut}${c.Demi_journee ? ` · ${c.Demi_journee.toLowerCase()}` : ''}`
    return c.Type === PLUSIEURS_JOURS_DEMANDE && fin && fin !== debut ? `${debut} → ${fin}` : debut
  }
  const pastilleStatut = (statut) => {
    const [libelle, picto, couleur] = STATUTS_DEMANDE[statut] ?? STATUTS_DEMANDE.Nouvelle
    return h('span', { className: 'presence-pastille', style: { '--couleur': couleur } }, icone(picto, 18), libelle)
  }
  // Gros bouton à pictogramme (même dessin que la fiche d'émargement)
  const tuile = (libelle, picto, couleur, actif, choisir) => h('button', { className: 'presence-tuile', type: 'button',
    style: { '--couleur': couleur }, 'aria-pressed': String(actif), onClick: choisir },
  h('span', { className: 'presence-tuile-picto' }, icone(picto, 30)), h('span', null, libelle))

  // Envoi commun aux deux formulaires : `valeurs` sans le statut (Nouvelle, rempli par Grist)
  const envoyer = async (table, valeurs, valider, erreur, fermer) => {
    erreur.hidden = true
    valider.disabled = true
    try {
      await enregistrerLigne(table, null, { Salarie: d.moi.id, ...valeurs })
      fermer()
      await recharger()
    } catch (err) {
      erreur.textContent = /access|blocked|permission/i.test(err?.message ?? '')
        ? 'Ton compte ne peut pas faire cette demande (droits). Préviens ton responsable.' : err.message || 'La demande n’a pas pu être envoyée.'
      erreur.hidden = false
      valider.disabled = false
    }
  }
  const refuser = (erreur, texte) => { erreur.textContent = texte; erreur.hidden = false }

  function ouvrirConge() {
    const champs = { Type: 'Une journée', Date_debut: aujourdhui(), Date_fin: '', Demi_journee: 'Matin' }
    const erreur = h('p', { className: 'erreur', hidden: true })
    const valider = h('button', { className: 'bouton bouton-principal presence-emarger', type: 'submit' }, icone('libres', 22), 'Envoyer la demande')
    const zone = h('div', { className: 'presence-choix' })
    const date = (libelle, cle) => h('label', { className: 'champ-groupe demande-date' }, h('span', null, icone('conges', 18), libelle),
      h('input', { className: 'champ', type: 'date', value: champs[cle], onInput: (e) => { champs[cle] = e.target.value } }))
    function dessiner() {
      const plusieurs = champs.Type === PLUSIEURS_JOURS_DEMANDE
      zone.replaceChildren(...[
        h('div', { className: 'presence-tuiles' }, TYPES_DEMANDE_CONGE.map(([type, picto]) =>
          tuile(type, picto, '#007EBD', champs.Type === type, () => { champs.Type = type; dessiner() }))),
        date(plusieurs ? 'Du' : 'Le', 'Date_debut'),
        plusieurs && date('Au', 'Date_fin'),
        champs.Type === DEMI_JOURNEE_DEMANDE && h('div', { className: 'presence-tuiles presence-tuiles-2' }, MOMENTS_DEMANDE.map(([moment, picto]) =>
          tuile(moment, picto, '#E07B2E', champs.Demi_journee === moment, () => { champs.Demi_journee = moment; dessiner() }))),
      ].filter(Boolean))
    }
    dessiner()
    const formulaire = h('form', { className: 'formulaire', onSubmit: (e) => {
      e.preventDefault()
      const plusieurs = champs.Type === PLUSIEURS_JOURS_DEMANDE
      if (!champs.Date_debut) return refuser(erreur, 'Choisis la date.')
      if (plusieurs && !champs.Date_fin) return refuser(erreur, 'Choisis la date de fin.')
      if (plusieurs && champs.Date_fin < champs.Date_debut) return refuser(erreur, 'La date de fin est avant la date de début.')
      // Un seul jour : la date de fin est celle du début ; la demi-journée n'est gardée que pour une demi-journée
      envoyer('Demande_de_conge', {
        Type: champs.Type, Date_debut: versGrist(champs.Date_debut), Date_fin: versGrist(plusieurs ? champs.Date_fin : champs.Date_debut),
        Demi_journee: champs.Type === DEMI_JOURNEE_DEMANDE ? champs.Demi_journee : null,
      }, valider, erreur, fermer)
    } }, zone, erreur, valider)
    const { fermer } = ouvrirPanneau('Demander un congé', formulaire)
  }

  function ouvrirAcompte() {
    let montant = ''
    const erreur = h('p', { className: 'erreur', hidden: true })
    const valider = h('button', { className: 'bouton bouton-principal presence-emarger', type: 'submit' }, icone('libres', 22), 'Envoyer la demande')
    const saisie = h('input', { className: 'champ demande-montant', type: 'number', min: 1, step: 1, inputMode: 'decimal', placeholder: '0',
      onInput: (e) => { montant = e.target.value; dessinerMontants() } })
    const montants = h('div', { className: 'presence-durees' })
    const dessinerMontants = () => montants.replaceChildren(...MONTANTS_ACOMPTE.map((m) => h('button', { className: 'presence-duree', type: 'button',
      'aria-pressed': String(Number(montant) === m), onClick: () => { montant = String(m); saisie.value = montant; dessinerMontants() } }, eurosDemande.format(m))))
    dessinerMontants()
    const formulaire = h('form', { className: 'formulaire', onSubmit: (e) => {
      e.preventDefault()
      const valeur = Math.round(Number(montant) * 100) / 100
      if (!(valeur > 0)) return refuser(erreur, 'Choisis le montant.')
      envoyer('Acompte', { Montant: valeur }, valider, erreur, fermer)
    } },
    h('p', { className: 'presence-question' }, icone('acomptes', 20), 'Quel montant ?'),
    montants,
    h('label', { className: 'champ-groupe demande-date' }, h('span', null, icone('crayon', 18), 'Autre montant (€)'), saisie),
    erreur, valider)
    const { fermer } = ouvrirPanneau('Demander un acompte', formulaire)
  }

  const retirer = (table, r, libelle) => fenetreSuppression(`Retirer cette demande ${libelle} ?`,
    [h('p', null, 'La demande sera supprimée. Tu pourras en faire une nouvelle.')],
    [['Oui, retirer la demande', 'bouton-danger', () => supprimerLignes(table, [r.id])]], recharger)

  function rendre() {
    if (!d) return
    if (d.moi.profil !== ROLE_SALARIE) {
      racine.replaceChildren(h('p', { className: 'message' }, 'Page réservée aux salariés.'))
      return
    }
    const date = (v) => (v ? new Date(v * 1000).toLocaleDateString('fr-FR') : '—')
    // Congés et acomptes ensemble, la plus récente en tête
    const demandes = [
      ...(d.Demande_de_conge ?? []).filter((c) => c.Salarie === d.moi.id).map((c) => ({ table: 'Demande_de_conge', r: c, picto: 'conges', couleur: '#007EBD',
        titre: c.Type ? `Congé · ${c.Type.toLowerCase()}` : 'Congé', detail: periodeDemande(c), libelle: 'de congé' })),
      ...(d.Acompte ?? []).filter((a) => a.Salarie === d.moi.id).map((a) => ({ table: 'Acompte', r: a, picto: 'acomptes', couleur: '#E07B2E',
        titre: 'Acompte', detail: a.Montant != null ? eurosDemande.format(a.Montant) : '—', libelle: 'd’acompte' })),
    ].sort((a, b) => (b.r.Cree_le ?? 0) - (a.r.Cree_le ?? 0))
    racine.replaceChildren(h('div', { className: 'mes-taches demandes' },
      h('section', { className: 'taches-entete' },
        h('span', { className: 'taches-pastille' }, 'Demandes'),
        h('h1', null, 'Congé et acompte'),
        h('p', { className: 'sous-texte' }, 'Que souhaitez-vous demander ?')),
      h('div', { className: 'taches-raccourcis' },
        [['Demander un congé', 'conges', '#007EBD', ouvrirConge], ['Demander un acompte', 'acomptes', '#E07B2E', ouvrirAcompte]].map(([libelle, picto, couleur, ouvrir]) =>
          h('button', { className: 'tache-raccourci', type: 'button', style: { '--couleur': couleur }, onClick: ouvrir },
            h('span', { className: 'tache-raccourci-picto' }, icone(picto, 30)),
            h('span', { className: 'tache-raccourci-libelle' }, libelle),
            h('span', { className: 'tache-raccourci-fleche' }, icone('fleche', 20))))),
      h('section', { className: 'taches-jour' },
        h('h2', null, h('span', { className: 'taches-jour-picto' }, icone('catalogue', 24)), 'Mes demandes'),
        demandes.length === 0 ? h('p', { className: 'taches-vide' }, icone('libres', 32), 'Aucune demande pour le moment.')
          : h('ul', { className: 'taches-liste' }, demandes.map(({ table, r, picto, couleur, titre, detail, libelle }) => h('li', { className: 'demande-ligne' },
            h('span', { className: 'tache-ligne-picto', style: { color: couleur, background: `color-mix(in srgb, ${couleur} 12%, white)` } }, icone(picto, 26)),
            h('span', { className: 'tache-ligne-texte' }, h('strong', null, titre), h('span', null, detail),
              h('span', { className: 'tache-ligne-heure' }, `Demandé le ${date(r.Cree_le)}`)),
            h('span', { className: 'demande-droite' }, pastilleStatut(r.Statut),
              (r.Statut || 'Nouvelle') === 'Nouvelle' && h('button', { className: 'bouton bouton-compact', type: 'button', 'aria-label': 'Retirer la demande',
                onClick: () => retirer(table, r, libelle) }, icone('croix', 16), 'Retirer'))))))))
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
