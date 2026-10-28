// Écran « Suivi des demandes d'acompte » (admin) : onglets par statut (Nouvelle, Acceptée, Refusée, Tous), tableau avec recherche,
// fiche de demande (nouvelle ou modification), suppression.
import { h, ouvrirPanneau, etiqueterLignes, fenetreSuppression, euros } from './outils.js'
import { estAdmin, ROLE_SALARIE, enregistrerLigne, supprimerLignes, nomContact } from './donnees.js'

const TABLE_ACOMPTES = 'Acompte'
const TITRES_ACOMPTES = ['Salarié', 'Montant', 'Créée le', 'Statut', '']
const STATUTS_ACOMPTE = ['Nouvelle', 'Acceptée', 'Refusée']
const CLASSES_STATUT_ACOMPTE = { 'Nouvelle': 'badge-nouveau', 'Acceptée': 'badge-resolu', 'Refusée': 'badge-ouvert' }
const creeeLe = (v) => (v ? new Date(v * 1000).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—')

// `options.salarie` : seulement les demandes de ce salarié (onglet de la fiche salarié : colonne Salarié masquée, onglet Tous au départ)
export function creerEcranAcomptes(racine, recharger, options = {}) {
  const seul = options.salarie ?? null
  const ongletDepart = seul ? '' : 'Nouvelle'
  const titres = seul ? TITRES_ACOMPTES.filter((t) => t !== 'Salarié') : TITRES_ACOMPTES
  let d = null
  let recherche = ''
  let onglet = ongletDepart // statut affiché ; '' = tous

  // Nom d'un salarié : son compte, sinon le candidat lié à l'embauche, sinon l'email
  const nomU = (u) => {
    if (!u) return 'Sans salarié'
    const c = d.Candidats?.find((x) => x.Utilisateur === u.id)
    return nomContact(u) || (c && nomContact(c)) || u.Email || 'Sans nom'
  }
  const salarie = (a) => nomU(d.parId.Utilisateurs?.get(a.Salarie))

  function rendre() {
    if (!d) return
    if (!estAdmin(d)) {
      racine.replaceChildren(h('p', { className: 'message' }, 'Page réservée aux administrateurs.'))
      return
    }
    if (d.absentes.has(TABLE_ACOMPTES)) {
      racine.replaceChildren(h('p', { className: 'message' }, 'Ce document n’a pas de table Acompte.'))
      return
    }
    const tous = d[TABLE_ACOMPTES].filter((a) => !seul || a.Salarie === seul)
    const corps = h('tbody')
    const compteur = h('p', { className: 'sous-texte' })
    // Ne redessine que les lignes : le champ de recherche garde le curseur
    const dessinerLignes = () => {
      const filtre = recherche.trim().toLowerCase()
      const liste = tous.filter((a) => !onglet || a.Statut === onglet)
        .filter((a) => !filtre || [salarie(a), a.Statut, creeeLe(a.Cree_le), a.Montant].some((v) => String(v ?? '').toLowerCase().includes(filtre)))
        .sort((a, b) => (b.Cree_le ?? 0) - (a.Cree_le ?? 0))
      const total = liste.reduce((s, a) => s + (Number(a.Montant) || 0), 0)
      compteur.textContent = `${liste.length} demande${liste.length > 1 ? 's' : ''} · ${euros.format(total)}`
      corps.replaceChildren(...(liste.length === 0
        ? [h('tr', null, h('td', { className: 'tableau-vide', colSpan: titres.length }, filtre ? 'Aucun résultat.' : 'Aucune demande dans cet onglet.'))]
        : liste.map((a) => h('tr', { className: 'tableau-ligne', onClick: () => ouvrirFiche(a) },
          !seul && h('td', { className: 'tableau-nom' }, salarie(a)),
          h('td', { className: seul ? 'tableau-nom' : '' }, a.Montant != null ? euros.format(a.Montant) : '—'),
          h('td', null, creeeLe(a.Cree_le)),
          h('td', null, a.Statut ? h('span', { className: `badge ${CLASSES_STATUT_ACOMPTE[a.Statut] ?? ''}` }, a.Statut) : '—'),
          h('td', { className: 'tableau-actions' },
            h('button', { className: 'bouton bouton-compact', onClick: (ev) => { ev.stopPropagation(); ouvrirFiche(a) } }, 'Modifier'),
            h('button', { className: 'bouton bouton-compact bouton-danger', onClick: (ev) => { ev.stopPropagation(); ouvrirSuppression(a) } }, 'Supprimer'))))))
      etiqueterLignes(corps, titres)
    }
    dessinerLignes()

    racine.replaceChildren(
      // Onglets, recherche et tableau dans une même carte blanche à bordure noire
      h('section', { className: 'carte-tableau' },
        h('div', { className: 'onglets onglets-statut onglets-candidats', role: 'tablist', 'aria-label': 'Statut des demandes' },
          [...STATUTS_ACOMPTE.map((s) => [s, s]), ['', 'Tous']].map(([statut, libelle]) => h('button', { className: 'onglet', role: 'tab',
            'aria-selected': String(statut === onglet), onClick: () => { onglet = statut; rendre() } },
          `${libelle} (${statut ? tous.filter((a) => a.Statut === statut).length : tous.length})`))),
        h('div', { className: 'barre-outils' },
          h('input', { className: 'champ champ-compact', type: 'search', placeholder: 'Rechercher (salarié, montant, date…)', value: recherche,
            'aria-label': 'Rechercher une demande', onInput: (ev) => { recherche = ev.target.value; dessinerLignes() } }),
          h('button', { className: 'bouton bouton-principal bouton-compact', onClick: () => ouvrirFiche(null) }, '＋ Nouvelle demande')),
        compteur,
        h('div', { className: 'tableau-defilant' },
          h('table', { className: 'tableau' },
            h('thead', null, h('tr', null, titres.map((t) => h('th', null, t)))),
            corps))))
  }

  // ---- Fiche : nouvelle demande (`a` null) ou modification ----

  function ouvrirFiche(a) {
    const champs = { Salarie: a?.Salarie || seul || 0, Montant: a?.Montant ?? '', Statut: a?.Statut || 'Nouvelle' }
    const salaries = d.Utilisateurs.filter((u) => (u.Profil === ROLE_SALARIE && u.Actif) || u.id === champs.Salarie)
      .map((u) => [u.id, nomU(u)]).sort((x, y) => String(x[1]).localeCompare(String(y[1])))
    const erreur = h('p', { className: 'erreur', hidden: true })
    const valider = h('button', { className: 'bouton bouton-principal', type: 'submit' }, a ? 'Enregistrer' : 'Envoyer la demande')

    const formulaire = h('form', { className: 'formulaire', onSubmit: async (ev) => {
      ev.preventDefault()
      erreur.hidden = true
      const montant = Number(String(champs.Montant).replace(',', '.'))
      const probleme = !champs.Salarie ? 'Choisis le salarié.' : !(montant > 0) ? 'Le montant doit être supérieur à 0.' : null
      if (probleme) {
        erreur.textContent = probleme
        erreur.hidden = false
        return
      }
      valider.disabled = true
      try {
        // « Créée le » est rempli par Grist à la création
        await enregistrerLigne(TABLE_ACOMPTES, a?.id ?? null, { Salarie: Number(champs.Salarie), Montant: Math.round(montant * 100) / 100, Statut: champs.Statut })
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
      h('label', { className: 'champ-groupe' }, 'Montant (€) *',
        h('input', { className: 'champ', type: 'number', min: 0.01, step: 0.01, inputMode: 'decimal', value: champs.Montant,
          onInput: (ev) => { champs.Montant = ev.target.value } })),
      h('label', { className: 'champ-groupe' }, 'Statut',
        h('select', { className: 'champ', onChange: (ev) => { champs.Statut = ev.target.value } },
          STATUTS_ACOMPTE.map((s) => h('option', { value: s, selected: s === champs.Statut }, s))))),
    a && h('p', { className: 'sous-texte' }, `Demande créée le ${creeeLe(a.Cree_le)}.`),
    erreur, valider,
    a && h('button', { className: 'bouton bouton-danger', type: 'button', onClick: () => { masquer(); ouvrirSuppression(a) } }, 'Supprimer cette demande'))

    const { fermer, masquer } = ouvrirPanneau(a ? `Demande d’acompte · ${salarie(a)}` : 'Nouvelle demande d’acompte', formulaire)
  }

  // ---- Suppression ----

  function ouvrirSuppression(a) {
    fenetreSuppression(`Supprimer la demande de ${salarie(a)} ?`, [
      h('p', null, `${a.Montant != null ? euros.format(a.Montant) : 'Montant non renseigné'} · ${a.Statut || 'sans statut'} · créée le ${creeeLe(a.Cree_le)}.`),
    ], [['Supprimer définitivement', 'bouton-danger', () => supprimerLignes(TABLE_ACOMPTES, [a.id])]], recharger)
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
