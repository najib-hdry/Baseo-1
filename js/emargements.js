// Écran « Suivi des émargements » (admin) : onglets par état (Présent, En retard, Absent, Tous), tableau avec recherche,
// fiche de modification, suppression d'un émargement ou des émargements cochés.
import { h, ouvrirPanneau, etiqueterLignes, fenetreSuppression, versSaisie } from './outils.js'
import { estAdmin, ROLE_SALARIE, modifierLigne, supprimerLignes, nomContact } from './donnees.js'

const TABLE = 'Emargement_Salarie'
const TITRES_EMARGEMENTS = ['', 'Salarié', 'Arrivée/Départ', 'Heure début', 'Heure fin', 'État', 'Absence autorisée', 'Retard', 'Parti tôt', 'Heures sup', 'Validé', '']
const ETATS = ['Présent', 'En retard', 'Absent']
const ONGLETS_EMARGEMENTS = [['Présent', 'Présent'], ['En retard', 'En retard'], ['Absent', 'Absent'], ['', 'Tous']]
const CLASSES_ETAT = { 'Présent': 'badge-resolu', 'En retard': 'badge-en_cours', 'Absent': 'badge-ouvert' }

const heureEmargement = (v) => (v ? new Date(v * 1000).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—')
// Minutes → « 1 h 30 », « 45 min »
const duree = (min) => {
  if (!min) return '—'
  const h_ = Math.floor(min / 60)
  return h_ ? `${h_} h${min % 60 ? ` ${String(min % 60).padStart(2, '0')}` : ''}` : `${min} min`
}
// Heure qui situe l'émargement dans le temps (arrivée : début, départ : fin) : sert au tri
const heureDe = (e) => e.Heure_debut || e.Heure_fin || 0

export function creerEcranEmargements(racine, recharger) {
  let d = null
  let recherche = ''
  let onglet = 'Présent'
  const choisis = new Set() // émargements cochés (suppression en masse)

  // Nom du salarié : colonne Nom complet (formule), sinon compte, sinon email
  const nomSalarie = (e) => {
    const u = d.parId.Utilisateurs?.get(e.Salarie)
    return e.Nom_complet || (u && (nomContact(u) || u.Email)) || 'Sans salarié'
  }

  function rendre() {
    if (!d) return
    if (!estAdmin(d)) {
      racine.replaceChildren(h('p', { className: 'message' }, 'Page réservée aux administrateurs.'))
      return
    }
    if (d.absentes.has(TABLE)) {
      racine.replaceChildren(h('p', { className: 'message' }, 'Ce document n’a pas de table Emargement Salarié.'))
      return
    }
    const tous = d[TABLE]
    const corps = h('tbody')
    const compteur = h('p', { className: 'sous-texte' })
    const supprimerSelection = h('button', { className: 'bouton bouton-compact bouton-danger', type: 'button',
      onClick: () => ouvrirSuppression(tous.filter((e) => choisis.has(e.id))) })
    const toutCocher = h('input', { type: 'checkbox', 'aria-label': 'Tout sélectionner' })
    let liste = []

    // Ne redessine que les lignes : le champ de recherche garde le curseur
    const dessinerLignes = () => {
      const filtre = recherche.trim().toLowerCase()
      liste = tous.filter((e) => !onglet || e.Etat === onglet)
        .filter((e) => !filtre || [nomSalarie(e), e.Arrivee_Depart, e.Etat, heureEmargement(e.Heure_debut), heureEmargement(e.Heure_fin)]
          .some((v) => String(v ?? '').toLowerCase().includes(filtre)))
        .sort((a, b) => heureDe(b) - heureDe(a))
      // La sélection ne garde que les lignes affichées
      for (const id of [...choisis]) if (!liste.some((e) => e.id === id)) choisis.delete(id)
      compteur.textContent = `${liste.length} émargement${liste.length > 1 ? 's' : ''}`
      supprimerSelection.textContent = `Supprimer la sélection (${choisis.size})`
      supprimerSelection.disabled = choisis.size === 0
      toutCocher.checked = liste.length > 0 && liste.every((e) => choisis.has(e.id))
      toutCocher.disabled = liste.length === 0
      corps.replaceChildren(...(liste.length === 0
        ? [h('tr', null, h('td', { className: 'tableau-vide', colSpan: TITRES_EMARGEMENTS.length }, filtre ? 'Aucun résultat.' : 'Aucun émargement dans cet onglet.'))]
        : liste.map((e) => h('tr', { className: 'tableau-ligne', onClick: () => ouvrirFiche(e) },
          h('td', { onClick: (ev) => ev.stopPropagation() },
            h('input', { type: 'checkbox', 'aria-label': `Sélectionner l’émargement de ${nomSalarie(e)}`, checked: choisis.has(e.id),
              onChange: (ev) => { ev.target.checked ? choisis.add(e.id) : choisis.delete(e.id); dessinerLignes() } })),
          h('td', { className: 'tableau-nom' }, nomSalarie(e)),
          h('td', null, e.Arrivee_Depart || '—'),
          h('td', null, heureEmargement(e.Heure_debut)),
          h('td', null, heureEmargement(e.Heure_fin)),
          h('td', null, e.Etat ? h('span', { className: `badge ${CLASSES_ETAT[e.Etat] ?? ''}` }, e.Etat) : '—'),
          h('td', null, e.Absence_autorisee || '—'),
          h('td', null, duree(e.Duree_retard)),
          h('td', null, e.Parti_plus_tot ? duree(e.Duree_parti_tot) || 'Oui' : '—'),
          h('td', null, e.Heures_sup_faites ? duree(e.Duree_heures_sup) || 'Oui' : '—'),
          h('td', null, e.Emargement_valide ? 'Oui' : 'Non'),
          h('td', { className: 'tableau-actions' },
            h('button', { className: 'bouton bouton-compact', onClick: (ev) => { ev.stopPropagation(); ouvrirFiche(e) } }, 'Modifier'),
            h('button', { className: 'bouton bouton-compact bouton-danger', onClick: (ev) => { ev.stopPropagation(); ouvrirSuppression([e]) } }, 'Supprimer'))))))
      etiqueterLignes(corps, TITRES_EMARGEMENTS)
    }
    toutCocher.addEventListener('change', () => {
      for (const e of liste) toutCocher.checked ? choisis.add(e.id) : choisis.delete(e.id)
      dessinerLignes()
    })
    dessinerLignes()

    racine.replaceChildren(
      // Onglets, recherche et tableau dans une même carte blanche à bordure noire
      h('section', { className: 'carte-tableau' },
        h('div', { className: 'onglets onglets-statut onglets-candidats', role: 'tablist', 'aria-label': 'État des émargements' },
          ONGLETS_EMARGEMENTS.map(([etat, libelle]) => h('button', { className: 'onglet', role: 'tab', 'aria-selected': String(etat === onglet),
            onClick: () => { onglet = etat; choisis.clear(); rendre() } }, `${libelle} (${etat ? tous.filter((e) => e.Etat === etat).length : tous.length})`))),
        h('div', { className: 'barre-outils' },
          h('input', { className: 'champ champ-compact', type: 'search', placeholder: 'Rechercher (salarié, date, arrivée / départ…)', value: recherche,
            'aria-label': 'Rechercher un émargement', onInput: (ev) => { recherche = ev.target.value; dessinerLignes() } }),
          supprimerSelection),
        compteur,
        h('div', { className: 'tableau-defilant' },
          h('table', { className: 'tableau' },
            h('thead', null, h('tr', null, TITRES_EMARGEMENTS.map((t, i) => h('th', null, i === 0 ? toutCocher : t)))),
            corps))))
  }

  // ---- Fiche de modification ----

  function ouvrirFiche(e) {
    const champs = {
      Salarie: e.Salarie || 0, Arrivee_Depart: e.Arrivee_Depart ?? '', Heure_debut: versSaisie(e.Heure_debut), Heure_fin: versSaisie(e.Heure_fin),
      Etat: e.Etat ?? '', Absence_autorisee: e.Absence_autorisee ?? '',
      Duree_retard: e.Duree_retard ?? '', Parti_plus_tot: Boolean(e.Parti_plus_tot), Duree_parti_tot: e.Duree_parti_tot ?? '',
      Heures_sup_faites: Boolean(e.Heures_sup_faites), Duree_heures_sup: e.Duree_heures_sup ?? '', Emargement_valide: Boolean(e.Emargement_valide),
    }
    const erreur = h('p', { className: 'erreur', hidden: true })
    const valider = h('button', { className: 'bouton bouton-principal', type: 'submit' }, 'Enregistrer')
    const liste = (libelle, col, valeurs, vide = '—') => h('label', { className: 'champ-groupe' }, libelle,
      h('select', { className: 'champ', onChange: (ev) => { champs[col] = ev.target.value } },
        h('option', { value: '', selected: !champs[col] }, vide),
        valeurs.map((v) => h('option', { value: v, selected: v === champs[col] }, v))))
    const saisie = (libelle, col, attributs) => h('label', { className: 'champ-groupe' }, libelle,
      h('input', { className: 'champ', value: champs[col], ...attributs, onInput: (ev) => { champs[col] = ev.target.value } }))
    const coche = (libelle, col) => h('label', { className: 'case' },
      h('input', { type: 'checkbox', checked: champs[col], onChange: (ev) => { champs[col] = ev.target.checked } }), libelle)
    const minutes = (libelle, col) => saisie(libelle, col, { type: 'number', min: 0, step: 1, inputMode: 'numeric' })
    const salaries = d.Utilisateurs.filter((u) => u.Profil === ROLE_SALARIE || u.id === e.Salarie)
      .map((u) => {
        const c = d.Candidats?.find((x) => x.Utilisateur === u.id) // compte sans nom : nom du candidat lié
        return [u.id, nomContact(u) || (c && nomContact(c)) || u.Email || 'Sans nom']
      })
      .sort((a, b) => String(a[1]).localeCompare(String(b[1])))

    const formulaire = h('form', { className: 'formulaire', onSubmit: async (ev) => {
      ev.preventDefault()
      erreur.hidden = true
      const entier = (v) => (v === '' || v == null ? null : Math.max(0, Math.round(Number(v))))
      const enGrist = (v) => (v ? new Date(v).getTime() / 1000 : null)
      const valeurs = {
        Salarie: Number(champs.Salarie) || 0, Arrivee_Depart: champs.Arrivee_Depart || null,
        Heure_debut: enGrist(champs.Heure_debut), Heure_fin: enGrist(champs.Heure_fin),
        Etat: champs.Etat || null, Absence_autorisee: champs.Absence_autorisee || null,
        Duree_retard: entier(champs.Duree_retard), Parti_plus_tot: champs.Parti_plus_tot, Duree_parti_tot: entier(champs.Duree_parti_tot),
        Heures_sup_faites: champs.Heures_sup_faites, Duree_heures_sup: entier(champs.Duree_heures_sup), Emargement_valide: champs.Emargement_valide,
      }
      if (valeurs.Heure_debut && valeurs.Heure_fin && valeurs.Heure_fin < valeurs.Heure_debut) {
        erreur.textContent = 'L’heure de fin est avant l’heure de début.'
        erreur.hidden = false
        return
      }
      valider.disabled = true
      try {
        await modifierLigne(TABLE, e.id, valeurs)
        fermer()
        await recharger()
      } catch (err) {
        erreur.textContent = err.message || 'L’enregistrement a échoué.'
        erreur.hidden = false
        valider.disabled = false
      }
    } },
    h('div', { className: 'grille-2' },
      h('label', { className: 'champ-groupe' }, 'Salarié',
        h('select', { className: 'champ', onChange: (ev) => { champs.Salarie = ev.target.value } },
          h('option', { value: '0', selected: !champs.Salarie }, '—'),
          salaries.map(([id, nom]) => h('option', { value: String(id), selected: id === champs.Salarie }, nom)))),
      liste('Arrivée/Départ', 'Arrivee_Depart', ['Arrivée', 'Départ']),
      saisie('Heure début', 'Heure_debut', { type: 'datetime-local' }),
      saisie('Heure fin', 'Heure_fin', { type: 'datetime-local' }),
      liste('État', 'Etat', ETATS),
      liste('Absence autorisée', 'Absence_autorisee', ['Oui', 'Non']),
      minutes('Durée en retard (min)', 'Duree_retard'),
      coche('Parti plus tôt', 'Parti_plus_tot'),
      minutes('Durée parti tôt (min)', 'Duree_parti_tot'),
      coche('Heure supplémentaire faite', 'Heures_sup_faites'),
      minutes('Durée heures sup (min)', 'Duree_heures_sup')),
    coche('Valider l’émargement', 'Emargement_valide'),
    erreur, valider,
    h('button', { className: 'bouton bouton-danger', type: 'button', onClick: () => { fermer(); ouvrirSuppression([e]) } }, 'Supprimer cet émargement'))

    const { fermer, section } = ouvrirPanneau(`${e.Arrivee_Depart || 'Émargement'} · ${nomSalarie(e)}`, formulaire)
    section.classList.add('panneau-large')
  }

  // ---- Suppression (un ou plusieurs) ----

  function ouvrirSuppression(liste) {
    if (liste.length === 0) return
    const un = liste.length === 1
    fenetreSuppression(un ? `Supprimer l’émargement de ${nomSalarie(liste[0])} ?` : `Supprimer ${liste.length} émargements ?`, [
      h('p', null, un ? `${liste[0].Arrivee_Depart || 'Émargement'} du ${heureEmargement(heureDe(liste[0]))}.` : 'Les émargements cochés seront supprimés.'),
      liste.some((e) => e.Emargement_valide) && h('p', null, h('strong', null, 'Attention : '), 'au moins un émargement est déjà validé.'),
    ].filter(Boolean), [['Supprimer définitivement', 'bouton-danger', async () => {
      await supprimerLignes(TABLE, liste.map((e) => e.id))
      for (const e of liste) choisis.delete(e.id)
    }]], recharger)
  }

  return {
    afficher(donnees) {
      d = donnees
      rendre()
    },
    accueil() {
      recherche = ''
      onglet = 'Présent'
      choisis.clear()
      rendre()
    },
  }
}
