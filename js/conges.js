// Écran « Suivi des demandes de congé » (admin) : onglets par statut (Nouvelle, Acceptée, Refusée, Tous), tableau avec recherche,
// fiche de demande (nouvelle ou modification) dont les dates suivent le type de congé, suppression.
import { h, ouvrirPanneau, etiqueterLignes, fenetreSuppression, versGrist, depuisGrist, enFrancais } from './outils.js'
import { estAdmin, ROLE_SALARIE, enregistrerLigne, supprimerLignes, nomContact } from './donnees.js'

const TABLE_CONGES = 'Demande_de_conge'
const TITRES_CONGES = ['Salarié', 'Type', 'Période', 'Créée le', 'Statut', '']
const STATUTS_CONGE = ['Nouvelle', 'Acceptée', 'Refusée']
const CLASSES_STATUT_CONGE = { 'Nouvelle': 'badge-nouveau', 'Acceptée': 'badge-resolu', 'Refusée': 'badge-ouvert' }
const DEMI_JOURNEE = 'Une demi-journée'
const UNE_JOURNEE = 'Une journée'
const PLUSIEURS_JOURS = 'Plusieurs jours'
const TYPES_CONGE = [DEMI_JOURNEE, UNE_JOURNEE, PLUSIEURS_JOURS]
const MOMENTS = ['Matin', 'Après-midi']
const congeCreeLe = (v) => (v ? new Date(v * 1000).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—')

// Période lisible : « 12/11/2026 · matin », « 12/11/2026 », « 12/11/2026 → 15/11/2026 (4 jours) »
function periode(c) {
  const debut = depuisGrist(c.Date_debut)
  const fin = depuisGrist(c.Date_fin)
  if (!debut) return '—'
  if (c.Type === DEMI_JOURNEE) return `${enFrancais(debut)}${c.Demi_journee ? ` · ${c.Demi_journee.toLowerCase()}` : ''}`
  if (c.Type !== PLUSIEURS_JOURS || !fin || fin === debut) return enFrancais(debut)
  const jours = Math.round((c.Date_fin - c.Date_debut) / 86400) + 1 // jours calendaires, bornes comprises
  return `${enFrancais(debut)} → ${enFrancais(fin)} (${jours} jours)`
}

// `options.salarie` : seulement les demandes de ce salarié (onglet de la fiche salarié : colonne Salarié masquée, onglet Tous au départ)
export function creerEcranConges(racine, recharger, options = {}) {
  const seul = options.salarie ?? null
  const ongletDepart = seul ? '' : 'Nouvelle'
  const titres = seul ? TITRES_CONGES.filter((t) => t !== 'Salarié') : TITRES_CONGES
  let d = null
  let recherche = ''
  let onglet = ongletDepart // statut affiché ; '' = tous

  // Nom d'un salarié : son compte, sinon le candidat lié à l'embauche, sinon l'email
  const nomU = (u) => {
    if (!u) return 'Sans salarié'
    const c = d.Candidats?.find((x) => x.Utilisateur === u.id)
    return nomContact(u) || (c && nomContact(c)) || u.Email || 'Sans nom'
  }
  const salarie = (c) => nomU(d.parId.Utilisateurs?.get(c.Salarie))

  function rendre() {
    if (!d) return
    if (!estAdmin(d)) {
      racine.replaceChildren(h('p', { className: 'message' }, 'Page réservée aux administrateurs.'))
      return
    }
    if (d.absentes.has(TABLE_CONGES)) {
      racine.replaceChildren(h('p', { className: 'message' }, 'Ce document n’a pas de table Demande de congé.'))
      return
    }
    const tous = d[TABLE_CONGES].filter((c) => !seul || c.Salarie === seul)
    const corps = h('tbody')
    const compteur = h('p', { className: 'sous-texte' })
    // Ne redessine que les lignes : le champ de recherche garde le curseur
    const dessinerLignes = () => {
      const filtre = recherche.trim().toLowerCase()
      const liste = tous.filter((c) => !onglet || c.Statut === onglet)
        .filter((c) => !filtre || [salarie(c), c.Type, periode(c), c.Statut, congeCreeLe(c.Cree_le)].some((v) => String(v ?? '').toLowerCase().includes(filtre)))
        .sort((a, b) => (b.Cree_le ?? 0) - (a.Cree_le ?? 0))
      compteur.textContent = `${liste.length} demande${liste.length > 1 ? 's' : ''}`
      corps.replaceChildren(...(liste.length === 0
        ? [h('tr', null, h('td', { className: 'tableau-vide', colSpan: titres.length }, filtre ? 'Aucun résultat.' : 'Aucune demande dans cet onglet.'))]
        : liste.map((c) => h('tr', { className: 'tableau-ligne', onClick: () => ouvrirFiche(c) },
          !seul && h('td', { className: 'tableau-nom' }, salarie(c)),
          h('td', { className: seul ? 'tableau-nom' : '' }, c.Type || '—'),
          h('td', null, periode(c)),
          h('td', null, congeCreeLe(c.Cree_le)),
          h('td', null, c.Statut ? h('span', { className: `badge ${CLASSES_STATUT_CONGE[c.Statut] ?? ''}` }, c.Statut) : '—'),
          h('td', { className: 'tableau-actions' },
            h('button', { className: 'bouton bouton-compact', onClick: (ev) => { ev.stopPropagation(); ouvrirFiche(c) } }, 'Modifier'),
            h('button', { className: 'bouton bouton-compact bouton-danger', onClick: (ev) => { ev.stopPropagation(); ouvrirSuppression(c) } }, 'Supprimer'))))))
      etiqueterLignes(corps, titres)
    }
    dessinerLignes()

    racine.replaceChildren(
      // Onglets, recherche et tableau dans une même carte blanche à bordure noire
      h('section', { className: 'carte-tableau' },
        h('div', { className: 'onglets onglets-statut onglets-candidats', role: 'tablist', 'aria-label': 'Statut des demandes' },
          [...STATUTS_CONGE.map((s) => [s, s]), ['', 'Tous']].map(([statut, libelle]) => h('button', { className: 'onglet', role: 'tab',
            'aria-selected': String(statut === onglet), onClick: () => { onglet = statut; rendre() } },
          `${libelle} (${statut ? tous.filter((c) => c.Statut === statut).length : tous.length})`))),
        h('div', { className: 'barre-outils' },
          h('input', { className: 'champ champ-compact', type: 'search', placeholder: 'Rechercher (salarié, type, date…)', value: recherche,
            'aria-label': 'Rechercher une demande', onInput: (ev) => { recherche = ev.target.value; dessinerLignes() } }),
          h('button', { className: 'bouton bouton-principal bouton-compact', onClick: () => ouvrirFiche(null) }, '＋ Nouvelle demande')),
        compteur,
        h('div', { className: 'tableau-defilant' },
          h('table', { className: 'tableau' },
            h('thead', null, h('tr', null, titres.map((t) => h('th', null, t)))),
            corps))))
  }

  // ---- Fiche : nouvelle demande (`c` null) ou modification ; les champs de dates suivent le type ----

  function ouvrirFiche(c) {
    const champs = {
      Salarie: c?.Salarie || seul || 0, Type: c?.Type || UNE_JOURNEE, Date_debut: depuisGrist(c?.Date_debut) ?? '', Date_fin: depuisGrist(c?.Date_fin) ?? '',
      Demi_journee: c?.Demi_journee || '', Statut: c?.Statut || 'Nouvelle',
    }
    const salaries = d.Utilisateurs.filter((u) => (u.Profil === ROLE_SALARIE && u.Actif) || u.id === champs.Salarie)
      .map((u) => [u.id, nomU(u)]).sort((x, y) => String(x[1]).localeCompare(String(y[1])))
    const erreur = h('p', { className: 'erreur', hidden: true })
    const valider = h('button', { className: 'bouton bouton-principal', type: 'submit' }, c ? 'Enregistrer' : 'Envoyer la demande')
    const choix = (libelle, col, valeurs, vide) => h('label', { className: 'champ-groupe' }, libelle,
      h('select', { className: 'champ', onChange: (ev) => { champs[col] = ev.target.value; majChamps() } },
        vide && h('option', { value: '', selected: !champs[col] }, vide),
        valeurs.map((v) => h('option', { value: v, selected: v === champs[col] }, v))))
    const date = (libelle, col) => h('label', { className: 'champ-groupe' }, libelle,
      h('input', { className: 'champ', type: 'date', value: champs[col], onInput: (ev) => { champs[col] = ev.target.value } }))

    // Demi-journée : date + matin / après-midi ; une journée : une date ; plusieurs jours : date de début et de fin
    const libelleDebut = h('span')
    const blocDebut = h('label', { className: 'champ-groupe' }, libelleDebut,
      h('input', { className: 'champ', type: 'date', value: champs.Date_debut, onInput: (ev) => { champs.Date_debut = ev.target.value } }))
    const blocFin = date('Date fin *', 'Date_fin')
    const blocMoment = choix('Demi-journée *', 'Demi_journee', MOMENTS, '-- Choisissez --')
    const majChamps = () => {
      libelleDebut.textContent = champs.Type === PLUSIEURS_JOURS ? 'Date début *' : 'Date *'
      blocFin.hidden = champs.Type !== PLUSIEURS_JOURS
      blocMoment.hidden = champs.Type !== DEMI_JOURNEE
    }
    majChamps()

    const formulaire = h('form', { className: 'formulaire', onSubmit: async (ev) => {
      ev.preventDefault()
      erreur.hidden = true
      const plusieurs = champs.Type === PLUSIEURS_JOURS
      const probleme = !champs.Salarie ? 'Choisis le salarié.'
        : !champs.Type ? 'Choisis le type de congé.'
          : !champs.Date_debut ? 'Indique la date.'
            : plusieurs && !champs.Date_fin ? 'Indique la date de fin.'
              : plusieurs && champs.Date_fin < champs.Date_debut ? 'La date de fin est avant la date de début.'
                : champs.Type === DEMI_JOURNEE && !champs.Demi_journee ? 'Choisis le matin ou l’après-midi.' : null
      if (probleme) {
        erreur.textContent = probleme
        erreur.hidden = false
        return
      }
      valider.disabled = true
      try {
        // Un seul jour : la date de fin est celle du début ; la demi-journée n'est gardée que pour une demi-journée.
        // « Créée le » est rempli par Grist à la création
        await enregistrerLigne(TABLE_CONGES, c?.id ?? null, {
          Salarie: Number(champs.Salarie), Type: champs.Type, Statut: champs.Statut,
          Date_debut: versGrist(champs.Date_debut), Date_fin: versGrist(plusieurs ? champs.Date_fin : champs.Date_debut),
          Demi_journee: champs.Type === DEMI_JOURNEE ? champs.Demi_journee : null,
        })
        fermer()
        await recharger()
      } catch (err) {
        erreur.textContent = err.message || 'L’enregistrement a échoué.'
        erreur.hidden = false
        valider.disabled = false
      }
    } },
    h('div', { className: 'grille-2' },
      h('label', { className: 'champ-groupe' }, 'Salarié *',
        h('select', { className: 'champ', onChange: (ev) => { champs.Salarie = Number(ev.target.value) || 0 } },
          h('option', { value: '0', selected: !champs.Salarie }, '-- Choisissez --'),
          salaries.map(([id, nom]) => h('option', { value: String(id), selected: id === champs.Salarie }, nom)))),
      choix('Type *', 'Type', TYPES_CONGE),
      choix('Statut', 'Statut', STATUTS_CONGE)),
    h('div', { className: 'grille-2' }, blocDebut, blocFin, blocMoment),
    c && h('p', { className: 'sous-texte' }, `Demande créée le ${congeCreeLe(c.Cree_le)}.`),
    erreur, valider,
    c && h('button', { className: 'bouton bouton-danger', type: 'button', onClick: () => ouvrirDepuis(() => ouvrirSuppression(c)) }, 'Supprimer cette demande'))

    const { fermer, ouvrirDepuis } = ouvrirPanneau(c ? `Demande de congé · ${salarie(c)}` : 'Nouvelle demande de congé', formulaire)
  }

  // ---- Suppression ----

  function ouvrirSuppression(c) {
    fenetreSuppression(`Supprimer la demande de ${salarie(c)} ?`, [
      h('p', null, `${c.Type || 'Congé'} · ${periode(c)} · ${c.Statut || 'sans statut'}.`),
    ], [['Supprimer définitivement', 'bouton-danger', () => supprimerLignes(TABLE_CONGES, [c.id])]], recharger)
  }

  return {
    afficher(donnees) {
      d = donnees
      rendre()
    },
    accueil() {
      recherche = ''
      onglet = ongletDepart
      rendre()
    },
  }
}
