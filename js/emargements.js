// Écran « Suivi des émargements » (admin) : onglets par état (Présent, En retard, Absent, Tous), tableau avec recherche,
// fiche de modification (les champs suivent l'état : absence autorisée si absent, durée si en retard ou parti plus tôt…),
// validation et suppression des émargements cochés.
import { h, ouvrirPanneau, etiqueterLignes, fenetreSuppression, versSaisie } from './outils.js'
import { estAdmin, ROLE_SALARIE, modifierLigne, supprimerLignes, validerEmargements, nomContact } from './donnees.js'

const TABLE_EMARGEMENTS = 'Emargement_Salarie'
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

// `options.salarie` : seulement les émargements de ce salarié (onglet de la fiche salarié : colonne Salarié masquée, onglet Tous au départ)
export function creerEcranEmargements(racine, recharger, options = {}) {
  const seul = options.salarie ?? null
  const ongletDepart = seul ? '' : 'Présent'
  const titres = seul ? TITRES_EMARGEMENTS.filter((t) => t !== 'Salarié') : TITRES_EMARGEMENTS
  let d = null
  let recherche = ''
  let onglet = ongletDepart
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
    if (d.absentes.has(TABLE_EMARGEMENTS)) {
      racine.replaceChildren(h('p', { className: 'message' }, 'Ce document n’a pas de table Emargement Salarié.'))
      return
    }
    const tous = d[TABLE_EMARGEMENTS].filter((e) => !seul || e.Salarie === seul)
    const corps = h('tbody')
    const compteur = h('p', { className: 'sous-texte' })
    const supprimerSelection = h('button', { className: 'bouton bouton-compact bouton-danger', type: 'button',
      onClick: () => ouvrirSuppression(tous.filter((e) => choisis.has(e.id))) })
    // Validation en masse : seulement les cochés pas encore validés
    const validerSelection = h('button', { className: 'bouton bouton-compact bouton-principal', type: 'button', onClick: async () => {
      const ids = tous.filter((e) => choisis.has(e.id) && !e.Emargement_valide).map((e) => e.id)
      if (ids.length === 0) return
      validerSelection.disabled = true
      validerSelection.textContent = 'Validation…'
      try {
        await validerEmargements(ids)
        choisis.clear()
      } catch (err) {
        alert(err.message || 'La validation a échoué.')
      }
      await recharger()
    } })
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
      const aValider = liste.filter((e) => choisis.has(e.id) && !e.Emargement_valide).length
      validerSelection.textContent = `Valider la sélection (${aValider})`
      validerSelection.disabled = aValider === 0
      toutCocher.checked = liste.length > 0 && liste.every((e) => choisis.has(e.id))
      toutCocher.disabled = liste.length === 0
      corps.replaceChildren(...(liste.length === 0
        ? [h('tr', null, h('td', { className: 'tableau-vide', colSpan: titres.length }, filtre ? 'Aucun résultat.' : 'Aucun émargement dans cet onglet.'))]
        : liste.map((e) => h('tr', { className: 'tableau-ligne', onClick: () => ouvrirFiche(e) },
          h('td', { onClick: (ev) => ev.stopPropagation() },
            h('input', { type: 'checkbox', 'aria-label': `Sélectionner l’émargement de ${nomSalarie(e)}`, checked: choisis.has(e.id),
              onChange: (ev) => { ev.target.checked ? choisis.add(e.id) : choisis.delete(e.id); dessinerLignes() } })),
          !seul && h('td', { className: 'tableau-nom' }, nomSalarie(e)),
          h('td', { className: seul ? 'tableau-nom' : '' }, e.Arrivee_Depart || '—'),
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
      etiqueterLignes(corps, titres)
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
          validerSelection, supprimerSelection),
        compteur,
        h('div', { className: 'tableau-defilant' },
          h('table', { className: 'tableau' },
            h('thead', null, h('tr', null, titres.map((t, i) => h('th', null, i === 0 ? toutCocher : t)))),
            corps))))
  }

  // ---- Fiche de modification ----

  function ouvrirFiche(e) {
    const champs = {
      Salarie: e.Salarie || 0, Arrivee_Depart: e.Arrivee_Depart ?? '', Heure_debut: versSaisie(e.Heure_debut), Heure_fin: versSaisie(e.Heure_fin),
      Etat: e.Etat ?? '', Absence_autorisee: e.Absence_autorisee ?? '',
      // Durée vide plutôt que 0 (valeur par défaut des colonnes nombre de Grist)
      Duree_retard: e.Duree_retard || '', Parti_plus_tot: Boolean(e.Parti_plus_tot), Duree_parti_tot: e.Duree_parti_tot || '',
      Heures_sup_faites: Boolean(e.Heures_sup_faites), Duree_heures_sup: e.Duree_heures_sup || '', Emargement_valide: Boolean(e.Emargement_valide),
    }
    const erreur = h('p', { className: 'erreur', hidden: true })
    const valider = h('button', { className: 'bouton bouton-principal', type: 'submit' }, 'Enregistrer')
    // Chaque changement d'état ou de case met à jour les champs affichés
    const liste = (libelle, col, valeurs, vide = '—') => h('label', { className: 'champ-groupe' }, libelle,
      h('select', { className: 'champ', onChange: (ev) => { champs[col] = ev.target.value; majChamps() } },
        h('option', { value: '', selected: !champs[col] }, vide),
        valeurs.map((v) => h('option', { value: v, selected: v === champs[col] }, v))))
    const saisie = (libelle, col, attributs) => h('label', { className: 'champ-groupe' }, libelle,
      h('input', { className: 'champ', value: champs[col], ...attributs, onInput: (ev) => { champs[col] = ev.target.value } }))
    const coche = (libelle, col) => h('label', { className: 'case' },
      h('input', { type: 'checkbox', checked: champs[col], onChange: (ev) => { champs[col] = ev.target.checked; majChamps() } }), libelle)
    const minutes = (libelle, col) => saisie(libelle, col, { type: 'number', min: 0, step: 1, inputMode: 'numeric' })
    const salaries = d.Utilisateurs.filter((u) => u.Profil === ROLE_SALARIE || u.id === e.Salarie)
      .map((u) => {
        const c = d.Candidats?.find((x) => x.Utilisateur === u.id) // compte sans nom : nom du candidat lié
        return [u.id, nomContact(u) || (c && nomContact(c)) || u.Email || 'Sans nom']
      })
      .sort((a, b) => String(a[1]).localeCompare(String(b[1])))

    // Champs qui dépendent de l'état : absence autorisée (absent), durée de retard (en retard) ;
    // départ anticipé et heures sup n'ont de sens que si le salarié était là, leur durée seulement si la case est cochée
    const blocAbsence = liste('Absence autorisée *', 'Absence_autorisee', ['Oui', 'Non'], '-- Choisissez --')
    const blocRetard = minutes('Durée en retard (min) *', 'Duree_retard')
    const blocParti = coche('Parti plus tôt', 'Parti_plus_tot')
    const blocDureeParti = minutes('Durée parti tôt (min) *', 'Duree_parti_tot')
    const blocSup = coche('Heure supplémentaire faite', 'Heures_sup_faites')
    const blocDureeSup = minutes('Durée heures sup (min) *', 'Duree_heures_sup')
    const absent = () => champs.Etat === 'Absent'
    const majChamps = () => {
      blocAbsence.hidden = !absent()
      blocRetard.hidden = champs.Etat !== 'En retard'
      blocParti.hidden = blocSup.hidden = absent()
      blocDureeParti.hidden = absent() || !champs.Parti_plus_tot
      blocDureeSup.hidden = absent() || !champs.Heures_sup_faites
    }
    majChamps()

    const formulaire = h('form', { className: 'formulaire', onSubmit: async (ev) => {
      ev.preventDefault()
      erreur.hidden = true
      const entier = (v) => (v === '' || v == null ? null : Math.max(0, Math.round(Number(v))))
      const enGrist = (v) => (v ? new Date(v).getTime() / 1000 : null)
      // Les champs masqués sont vidés : un émargement « Présent » ne garde pas une ancienne durée de retard
      const parti = !absent() && champs.Parti_plus_tot
      const sup = !absent() && champs.Heures_sup_faites
      const valeurs = {
        Salarie: Number(champs.Salarie) || 0, Arrivee_Depart: champs.Arrivee_Depart || null,
        Heure_debut: enGrist(champs.Heure_debut), Heure_fin: enGrist(champs.Heure_fin),
        Etat: champs.Etat || null, Absence_autorisee: absent() ? champs.Absence_autorisee || null : null,
        Duree_retard: champs.Etat === 'En retard' ? entier(champs.Duree_retard) : null,
        Parti_plus_tot: parti, Duree_parti_tot: parti ? entier(champs.Duree_parti_tot) : null,
        Heures_sup_faites: sup, Duree_heures_sup: sup ? entier(champs.Duree_heures_sup) : null,
        Emargement_valide: champs.Emargement_valide,
      }
      const probleme = valeurs.Heure_debut && valeurs.Heure_fin && valeurs.Heure_fin < valeurs.Heure_debut ? 'L’heure de fin est avant l’heure de début.'
        : absent() && !valeurs.Absence_autorisee ? 'Indique si l’absence est autorisée.'
          : champs.Etat === 'En retard' && !valeurs.Duree_retard ? 'Indique la durée du retard (en minutes).'
            : parti && !valeurs.Duree_parti_tot ? 'Indique de combien de minutes il est parti plus tôt.'
              : sup && !valeurs.Duree_heures_sup ? 'Indique la durée des heures supplémentaires (en minutes).' : null
      if (probleme) {
        erreur.textContent = probleme
        erreur.hidden = false
        return
      }
      valider.disabled = true
      try {
        await modifierLigne(TABLE_EMARGEMENTS, e.id, valeurs)
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
      saisie('Heure fin', 'Heure_fin', { type: 'datetime-local' })),
    h('fieldset', { className: 'bloc-lieu' }, h('legend', null, 'Présence'),
      h('div', { className: 'grille-2' }, liste('État', 'Etat', ETATS), blocAbsence, blocRetard),
      h('div', { className: 'grille-2' }, blocParti, blocDureeParti),
      h('div', { className: 'grille-2' }, blocSup, blocDureeSup)),
    coche('Valider l’émargement', 'Emargement_valide'),
    erreur, valider,
    h('button', { className: 'bouton bouton-danger', type: 'button', onClick: () => { masquer(); ouvrirSuppression([e]) } }, 'Supprimer cet émargement'))

    const { fermer, masquer, section } = ouvrirPanneau(`${e.Arrivee_Depart || 'Émargement'} · ${nomSalarie(e)}`, formulaire)
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
      await supprimerLignes(TABLE_EMARGEMENTS, liste.map((e) => e.id))
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
      onglet = ongletDepart
      choisis.clear()
      rendre()
    },
  }
}
