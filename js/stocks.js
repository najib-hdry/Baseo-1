// Écran « Gestion des stocks » (admin) : tableau des stocks (chantiers servis, bases vie où ils sont rangés)
// avec recherche, fiche de création / modification, suppression avec confirmation.
import { h, ouvrirPanneau, etiqueterLignes, fenetreSuppression } from './outils.js'
import { estAdmin, idsDeListe, enregistrerLigne, supprimerLignes } from './donnees.js'

const TITRES_STOCKS = ['N°', 'Chantiers', 'Bases vie', '']

// Écran affiché dans `racine` ; `recharger()` relit les données après une écriture
export function creerEcranStocks(racine, recharger) {
  let d = null
  let recherche = ''

  const noms = (table, ids) => ids.map((id) => d.parId[table].get(id)?.Nom).filter(Boolean)
  const nomsChantiers = (s) => noms('Chantiers', idsDeListe(s.Chantiers)).join(', ')
  // Base vie suivie de son chantier : deux chantiers peuvent avoir une « BV1 »
  const nomsBases = (s) => idsDeListe(s.Base_vie).map((id) => d.parId.Bases_vie.get(id)).filter(Boolean)
    .map((b) => `${b.Nom}${b.Chantier ? ` (${d.parId.Chantiers.get(b.Chantier)?.Nom ?? ''})` : ''}`).join(', ')

  function rendre() {
    if (!d) return
    if (!estAdmin(d)) {
      racine.replaceChildren(h('p', { className: 'message' }, 'Page réservée aux administrateurs.'))
      return
    }
    if (d.absentes.has('Stock')) {
      racine.replaceChildren(h('p', { className: 'message' }, 'Ce document n’a pas de table Stock.'))
      return
    }
    const corps = h('tbody')
    const compteur = h('p', { className: 'sous-texte' })

    // Ne redessine que les lignes : le champ de recherche garde le curseur
    const dessinerLignes = () => {
      const filtre = recherche.trim().toLowerCase()
      const liste = d.Stock
        .filter((s) => !filtre || [nomsChantiers(s), nomsBases(s)].some((v) => v.toLowerCase().includes(filtre)))
        .sort((a, b) => nomsChantiers(a).localeCompare(nomsChantiers(b)) || a.id - b.id)
      compteur.textContent = `${liste.length} stock${liste.length > 1 ? 's' : ''}`
      corps.replaceChildren(...(liste.length === 0
        ? [h('tr', null, h('td', { className: 'tableau-vide', colSpan: 4 }, d.Stock.length === 0
          ? 'Aucun stock pour l’instant. Crée le premier avec « ＋ Nouveau stock » : chaque ligne aura ensuite ses boutons Modifier et Supprimer.'
          : 'Aucun stock ne correspond à la recherche.'))]
        : liste.map((s) => h('tr', { className: 'tableau-ligne', onClick: () => ouvrirFiche(s) },
          h('td', { className: 'tableau-nom' }, String(s.id)),
          h('td', null, nomsChantiers(s) || '—'),
          h('td', null, nomsBases(s) || '—'),
          h('td', { className: 'tableau-actions' },
            h('button', { className: 'bouton bouton-compact', onClick: (ev) => { ev.stopPropagation(); ouvrirFiche(s) } }, 'Modifier'),
            h('button', { className: 'bouton bouton-compact bouton-danger', onClick: (ev) => { ev.stopPropagation(); ouvrirSuppression(s) } }, 'Supprimer'))))))
      etiqueterLignes(corps, TITRES_STOCKS)
    }
    dessinerLignes()

    racine.replaceChildren(
      h('section', { className: 'carte-tableau' },
        h('div', { className: 'barre-outils' },
          h('input', { className: 'champ champ-compact', type: 'search', placeholder: 'Rechercher (chantier, base vie…)', value: recherche,
            'aria-label': 'Rechercher un stock', onInput: (e) => { recherche = e.target.value; dessinerLignes() } }),
          h('button', { className: 'bouton bouton-principal bouton-compact', onClick: () => ouvrirFiche(null) }, '＋ Nouveau stock')),
        compteur,
        h('div', { className: 'tableau-defilant' },
          h('table', { className: 'tableau' },
            h('thead', null, h('tr', null, TITRES_STOCKS.map((t) => h('th', null, t)))),
            corps))))
  }

  // ---- Fiche : création (`s` null) ou modification ----

  function ouvrirFiche(s) {
    const champs = { Chantiers: idsDeListe(s?.Chantiers), Base_vie: idsDeListe(s?.Base_vie) }
    const erreur = h('p', { className: 'erreur', hidden: true })
    const valider = h('button', { className: 'bouton bouton-principal', type: 'submit' }, s ? 'Enregistrer' : 'Créer le stock')
    const parNom = (a, b) => String(a.Nom).localeCompare(String(b.Nom), 'fr', { numeric: true })
    const caseACocher = (liste, id, libelle, apres) => h('label', { className: 'case' },
      h('input', { type: 'checkbox', checked: champs[liste].includes(id), onChange: (e) => {
        champs[liste] = e.target.checked ? [...champs[liste], id] : champs[liste].filter((x) => x !== id)
        apres?.()
      } }),
      libelle)

    // Bases vie : seulement celles des chantiers cochés ; décocher un chantier retire ses bases vie
    const zoneBases = h('div', { className: 'cases-chantiers' })
    const dessinerBases = () => {
      champs.Base_vie = champs.Base_vie.filter((id) => champs.Chantiers.includes(d.parId.Bases_vie.get(id)?.Chantier))
      const bases = d.Bases_vie.filter((b) => champs.Chantiers.includes(b.Chantier))
        .sort((a, b) => parNom(d.parId.Chantiers.get(a.Chantier) ?? {}, d.parId.Chantiers.get(b.Chantier) ?? {}) || parNom(a, b))
      zoneBases.replaceChildren(...(bases.length === 0
        ? [h('p', { className: 'sous-texte' }, champs.Chantiers.length ? 'Ces chantiers n’ont pas de base vie.' : 'Coche d’abord un ou plusieurs chantiers.')]
        : bases.map((b) => caseACocher('Base_vie', b.id, champs.Chantiers.length > 1 ? `${b.Nom || 'Sans nom'} (${d.parId.Chantiers.get(b.Chantier)?.Nom ?? ''})` : b.Nom || 'Sans nom'))))
    }
    dessinerBases()

    const formulaire = h('form', { className: 'formulaire', onSubmit: async (ev) => {
      ev.preventDefault()
      erreur.hidden = true
      if (champs.Chantiers.length === 0) {
        erreur.textContent = 'Coche au moins un chantier.'
        erreur.hidden = false
        return
      }
      valider.disabled = true
      try {
        const liste = (ids) => (ids.length > 0 ? ['L', ...ids] : null)
        await enregistrerLigne('Stock', s?.id ?? null, { Chantiers: liste(champs.Chantiers), Base_vie: liste(champs.Base_vie) })
        fermer()
        await recharger()
      } catch (err) {
        erreur.textContent = err.message || 'L’enregistrement a échoué.'
        erreur.hidden = false
        valider.disabled = false
      }
    } },
    h('fieldset', { className: 'groupe' }, h('legend', null, 'Chantiers servis par ce stock'),
      h('div', { className: 'cases-chantiers' }, [...d.Chantiers].sort(parNom).map((c) => caseACocher('Chantiers', c.id, c.Nom || 'Sans nom', dessinerBases)))),
    h('fieldset', { className: 'groupe' }, h('legend', null, 'Bases vie où le stock est rangé'), zoneBases),
    erreur, valider,
    s && h('button', { className: 'bouton bouton-danger', type: 'button', onClick: () => { fermer(); ouvrirSuppression(s) } }, 'Supprimer ce stock'))

    const { fermer, section } = ouvrirPanneau(s ? `Stock n° ${s.id}` : 'Nouveau stock', formulaire)
    section.classList.add('panneau-large')
  }

  // ---- Suppression ----

  function ouvrirSuppression(s) {
    fenetreSuppression(`Supprimer le stock n° ${s.id} ?`,
      [h('p', null, `Chantiers : ${nomsChantiers(s) || '—'}. Bases vie : ${nomsBases(s) || '—'}.`)],
      [['Supprimer définitivement', 'bouton-danger', () => supprimerLignes('Stock', [s.id])]], recharger)
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
