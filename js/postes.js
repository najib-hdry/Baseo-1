// Écran « Gestion des postes » (admin) : tableau de tous les postes avec recherche et filtre par statut,
// fiche de création / modification, suppression avec confirmation.
import { h, depuisGrist, enFrancais, ouvrirPanneau, etiqueterLignes } from './outils.js'
import { STATUTS_POSTE, HORAIRES_POSTE, idsDeListe, creerPoste, modifierPoste, archiverPoste, supprimerPoste } from './donnees.js'

const TITRES_POSTES = ['Poste', 'Chantiers', 'Démarrage', 'Personnes', 'Horaires', 'Statut', '']
const CLASSES_STATUT_POSTE = { 'À venir': 'badge-en_cours', 'En cours': 'badge-resolu', 'Archives': 'badge-termine' }

// Écran affiché dans `racine` ; `recharger()` relit les données après une écriture
export function creerEcranPostes(racine, recharger) {
  let d = null
  let recherche = ''
  let filtreStatut = 'tous' // 'tous' ou un statut

  const nomsChantiers = (p) => idsDeListe(p.Chantiers).map((id) => d.parId.Chantiers.get(id)?.Nom).filter(Boolean).join(', ')
  const horaires = (p) => (p.Horaires === 'Autre' ? p.Horaires_precision || 'Autre' : p.Horaires ?? '')

  function rendre() {
    if (!d) return
    if (d.moi?.profil !== 'Admin') {
      racine.replaceChildren(h('h1', null, 'Gestion des postes'), h('p', { className: 'message' }, 'Page réservée aux administrateurs.'))
      return
    }
    if (d.absentes.has('Postes')) {
      racine.replaceChildren(h('h1', null, 'Gestion des postes'), h('p', { className: 'message' }, 'Ce document n’a pas de table Postes.'))
      return
    }
    const corps = h('tbody')
    const compteur = h('p', { className: 'sous-texte' })
    const garde = (p) => filtreStatut === 'tous' || p.Statut === filtreStatut

    // Ne redessine que les lignes : le champ de recherche garde le curseur
    const dessinerLignes = () => {
      const filtre = recherche.trim().toLowerCase()
      const liste = d.Postes
        .filter(garde)
        .filter((p) => !filtre || [p.Titre, p.Mission, nomsChantiers(p)].some((v) => String(v ?? '').toLowerCase().includes(filtre)))
        .sort((a, b) => (depuisGrist(a.Date_demarrage) ?? '9999').localeCompare(depuisGrist(b.Date_demarrage) ?? '9999') || String(a.Titre).localeCompare(String(b.Titre)))
      compteur.textContent = `${liste.length} poste${liste.length > 1 ? 's' : ''}`
      corps.replaceChildren(...(liste.length === 0
        ? [h('tr', null, h('td', { className: 'tableau-vide', colSpan: 7 }, d.Postes.length === 0
          ? 'Aucun poste pour l’instant. Crée le premier avec « ＋ Nouveau poste » : chaque ligne aura ensuite ses boutons Modifier et Supprimer.'
          : 'Aucun poste ne correspond à la recherche ou au statut choisi.'))]
        : liste.map((p) => h('tr', { className: 'tableau-ligne', onClick: () => ouvrirFiche(p) },
          h('td', { className: 'tableau-nom' }, p.Titre || 'Sans titre'),
          h('td', null, nomsChantiers(p)),
          h('td', null, enFrancais(depuisGrist(p.Date_demarrage))),
          h('td', { className: 'tableau-nombre' }, p.Nb_personnes ?? ''),
          h('td', null, horaires(p)),
          h('td', null, p.Statut && h('span', { className: `badge ${CLASSES_STATUT_POSTE[p.Statut] ?? ''}` }, p.Statut)),
          h('td', { className: 'tableau-actions' },
            h('button', { className: 'bouton bouton-compact', onClick: (ev) => { ev.stopPropagation(); ouvrirFiche(p) } }, 'Modifier'),
            h('button', { className: 'bouton bouton-compact bouton-danger', onClick: (ev) => { ev.stopPropagation(); ouvrirSuppression(p) } }, 'Supprimer'))))))
      etiqueterLignes(corps, TITRES_POSTES)
    }
    dessinerLignes()

    const filtres = [['tous', 'Tous les statuts'], ...STATUTS_POSTE.map((s) => [s, s])]
    racine.replaceChildren(
      h('h1', null, 'Gestion des postes'),
      h('div', { className: 'barre-outils' },
        h('input', { className: 'champ champ-compact', type: 'search', placeholder: 'Rechercher (titre, mission, chantier…)', value: recherche,
          'aria-label': 'Rechercher un poste', onInput: (e) => { recherche = e.target.value; dessinerLignes() } }),
        h('select', { className: 'champ champ-compact champ-statut', 'aria-label': 'Filtrer par statut', onChange: (e) => { filtreStatut = e.target.value; dessinerLignes() } },
          filtres.map(([v, libelle]) => h('option', { value: v, selected: filtreStatut === v }, libelle))),
        h('button', { className: 'bouton bouton-principal bouton-compact', onClick: () => ouvrirFiche(null) }, '＋ Nouveau poste')),
      compteur,
      h('div', { className: 'tableau-defilant' },
        h('table', { className: 'tableau' },
          h('thead', null, h('tr', null, TITRES_POSTES.map((t) => h('th', null, t)))),
          corps)))
  }

  // ---- Fiche : création (`p` null) ou modification ----

  function ouvrirFiche(p) {
    const champs = {
      Titre: p?.Titre ?? '', Date_demarrage: depuisGrist(p?.Date_demarrage) ?? '', Nb_personnes: p?.Nb_personnes ?? null,
      Statut: p?.Statut || 'À venir', Chantiers: idsDeListe(p?.Chantiers), Mission: p?.Mission ?? '',
      Horaires: p?.Horaires || '', Horaires_precision: p?.Horaires_precision ?? '',
    }
    const erreur = h('p', { className: 'erreur', hidden: true })
    const valider = h('button', { className: 'bouton bouton-principal', type: 'submit' }, p ? 'Enregistrer' : 'Créer le poste')
    const groupe = (libelle, champ) => h('label', { className: 'champ-groupe' }, libelle, champ)

    const precision = groupe('Préciser les horaires',
      h('input', { className: 'champ', autocomplete: 'off', value: champs.Horaires_precision, onInput: (e) => { champs.Horaires_precision = e.target.value } }))
    precision.hidden = champs.Horaires !== 'Autre'

    // Chantiers : cases à cocher (référence multiple)
    const chantiers = [...d.Chantiers].sort((a, b) => String(a.Nom).localeCompare(String(b.Nom)))
    const cases = h('fieldset', { className: 'groupe' }, h('legend', null, 'Chantiers'),
      h('div', { className: 'cases-chantiers' }, chantiers.map((c) => h('label', { className: 'case' },
        h('input', { type: 'checkbox', checked: champs.Chantiers.includes(c.id), onChange: (e) => {
          champs.Chantiers = e.target.checked ? [...champs.Chantiers, c.id] : champs.Chantiers.filter((id) => id !== c.id)
        } }),
        c.Nom || 'Sans nom'))))

    const formulaire = h('form', { className: 'formulaire', onSubmit: async (ev) => {
      ev.preventDefault()
      erreur.hidden = true
      valider.disabled = true
      try {
        const propres = { ...champs, Titre: champs.Titre.trim(), Mission: champs.Mission.trim(), Horaires_precision: champs.Horaires_precision.trim() }
        if (p) await modifierPoste(p.id, propres)
        else await creerPoste(propres)
        fermer()
        await recharger()
      } catch (err) {
        erreur.textContent = err.message || 'L’enregistrement a échoué.'
        erreur.hidden = false
        valider.disabled = false
      }
    } },
    groupe('Titre du poste', h('input', { className: 'champ', autocomplete: 'off', required: true, value: champs.Titre, onInput: (e) => { champs.Titre = e.target.value } })),
    h('div', { className: 'grille-2' },
      groupe('Date de démarrage', h('input', { className: 'champ', type: 'date', value: champs.Date_demarrage, onInput: (e) => { champs.Date_demarrage = e.target.value } })),
      groupe('Personnes recherchées', h('input', { className: 'champ', type: 'number', min: 0, step: 1, value: champs.Nb_personnes ?? '',
        onInput: (e) => { champs.Nb_personnes = e.target.value === '' ? null : Number(e.target.value) } })),
      groupe('Statut', h('select', { className: 'champ', onChange: (e) => { champs.Statut = e.target.value } },
        STATUTS_POSTE.map((s) => h('option', { value: s, selected: champs.Statut === s }, s)))),
      groupe('Horaires', h('select', { className: 'champ', onChange: (e) => { champs.Horaires = e.target.value; precision.hidden = e.target.value !== 'Autre' } },
        h('option', { value: '', selected: !champs.Horaires }, '—'),
        HORAIRES_POSTE.map((v) => h('option', { value: v, selected: champs.Horaires === v }, v))))),
    precision,
    cases,
    groupe('Mission', h('textarea', { className: 'champ champ-texte', value: champs.Mission, onInput: (e) => { champs.Mission = e.target.value } })),
    erreur, valider,
    p && h('button', { className: 'bouton bouton-danger', type: 'button', onClick: () => { fermer(); ouvrirSuppression(p) } }, 'Supprimer ce poste'))

    const { fermer, section } = ouvrirPanneau(p ? p.Titre || 'Poste' : 'Nouveau poste', formulaire)
    section.classList.add('panneau-large')
  }

  // ---- Suppression ----

  function ouvrirSuppression(p) {
    const erreur = h('p', { className: 'erreur', hidden: true })
    const confirmer = h('button', { className: 'bouton bouton-danger' }, 'Supprimer définitivement')
    const archiver = h('button', { className: 'bouton', hidden: p.Statut === 'Archives' }, 'Plutôt passer en « Archives »')
    const executer = async (bouton, fn) => {
      bouton.disabled = true
      try { await fn(); fermer(); await recharger() } catch (err) {
        erreur.textContent = err.message || 'L’opération a échoué.'
        erreur.hidden = false
        bouton.disabled = false
      }
    }
    confirmer.addEventListener('click', () => executer(confirmer, () => supprimerPoste(p.id)))
    archiver.addEventListener('click', () => executer(archiver, () => archiverPoste(p.id)))
    const { fermer } = ouvrirPanneau(`Supprimer ${p.Titre || 'ce poste'} ?`, [
      h('p', { className: 'sous-texte' }, 'En cas d’erreur, la suppression s’annule dans l’Historique du document Grist.'),
      erreur, confirmer, archiver,
      h('button', { className: 'bouton', onClick: () => fermer() }, 'Annuler'),
    ])
  }

  return {
    afficher(donnees) {
      d = donnees
      rendre()
    },
    accueil() {
      recherche = ''
      rendre()
    },
  }
}
