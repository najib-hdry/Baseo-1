// Écran « Gestion des stocks » (admin), en deux onglets :
// - Stocks : tableau des stocks (chantiers servis, bases vie où ils sont rangés), fiche de création / modification, suppression ;
// - Catalogue : tableau des articles (Stock_Reference) avec recherche et filtre par source, fiche, suppression.
import { h, ouvrirPanneau, etiqueterLignes, fenetreSuppression, zoneFichier, reduirePhoto } from './outils.js'
import { estAdmin, idsDeListe, enregistrerLigne, supprimerLignes, lienPhotos, envoyerPhoto } from './donnees.js'

const TITRES_STOCKS = ['N°', 'Chantiers', 'Bases vie', '']
const TITRES_CATALOGUE = ['Photo', 'Source', 'Type', 'Descriptif', 'Format ou taille', 'Commentaire', '']
const ONGLETS_STOCKS = [['stocks', 'Stocks'], ['catalogue', 'Catalogue']]

// Écran affiché dans `racine` ; `recharger()` relit les données après une écriture
export function creerEcranStocks(racine, recharger) {
  let d = null
  let onglet = 'stocks'
  let recherche = ''
  let filtreSource = 0 // 0 : toutes les sources
  let lien = null // adresse temporaire d'une photo (pièce jointe Grist)

  const parNom = (a, b) => String(a.Nom).localeCompare(String(b.Nom), 'fr', { numeric: true })
  const nomsChantiers = (s) => idsDeListe(s.Chantiers).map((id) => d.parId.Chantiers.get(id)?.Nom).filter(Boolean).join(', ')
  // Base vie suivie de son chantier : deux chantiers peuvent avoir une « BV1 »
  const nomsBases = (s) => idsDeListe(s.Base_vie).map((id) => d.parId.Bases_vie.get(id)).filter(Boolean)
    .map((b) => `${b.Nom}${b.Chantier ? ` (${d.parId.Chantiers.get(b.Chantier)?.Nom ?? ''})` : ''}`).join(', ')
  const source = (r) => d.parId.Stock_Source.get(r.Source)?.Source ?? ''
  const type = (r) => d.parId.Stock_Type.get(r.Type)?.Type ?? ''

  function rendre() {
    if (!d) return
    if (!estAdmin(d)) {
      racine.replaceChildren(h('p', { className: 'message' }, 'Page réservée aux administrateurs.'))
      return
    }
    const table = onglet === 'stocks' ? 'Stock' : 'Stock_Reference'
    const barre = h('div', { className: 'onglets onglets-statut onglets-candidats', role: 'tablist', 'aria-label': 'Gestion des stocks' },
      ONGLETS_STOCKS.map(([cle, libelle]) => h('button', { className: 'onglet', role: 'tab', 'aria-selected': String(cle === onglet),
        onClick: () => { onglet = cle; recherche = ''; rendre() } }, `${libelle} (${d[cle === 'stocks' ? 'Stock' : 'Stock_Reference']?.length ?? 0})`)))
    if (d.absentes.has(table)) {
      racine.replaceChildren(h('section', { className: 'carte-tableau' }, barre,
        h('p', { className: 'message' }, `Ce document n’a pas de table ${table}.`)))
      return
    }
    racine.replaceChildren(h('section', { className: 'carte-tableau' }, barre, ...(onglet === 'stocks' ? contenuStocks() : contenuCatalogue())))
  }

  // Recherche, bouton d'ajout, compteur et tableau ; `dessiner(corps, compteur)` remplit les lignes
  function tableau(titres, placeholder, filtres, ajout, dessiner) {
    const corps = h('tbody')
    const compteur = h('p', { className: 'sous-texte' })
    const redessiner = () => { dessiner(corps, compteur); etiqueterLignes(corps, titres) }
    redessiner()
    return [
      h('div', { className: 'barre-outils' },
        h('input', { className: 'champ champ-compact', type: 'search', placeholder, value: recherche, 'aria-label': placeholder,
          onInput: (e) => { recherche = e.target.value; redessiner() } }),
        ...filtres(redessiner),
        ajout),
      compteur,
      h('div', { className: 'tableau-defilant' },
        h('table', { className: 'tableau' }, h('thead', null, h('tr', null, titres.map((t) => h('th', null, t)))), corps)),
    ]
  }

  // Boutons Modifier et Supprimer d'une ligne
  const actions = (modifier, supprimer) => h('td', { className: 'tableau-actions' },
    h('button', { className: 'bouton bouton-compact', onClick: (ev) => { ev.stopPropagation(); modifier() } }, 'Modifier'),
    h('button', { className: 'bouton bouton-compact bouton-danger', onClick: (ev) => { ev.stopPropagation(); supprimer() } }, 'Supprimer'))
  const ligneVide = (colonnes, texte) => [h('tr', null, h('td', { className: 'tableau-vide', colSpan: colonnes }, texte))]

  // ---- Onglet Stocks ----

  function contenuStocks() {
    return tableau(TITRES_STOCKS, 'Rechercher (chantier, base vie…)', () => [],
      h('button', { className: 'bouton bouton-principal bouton-compact', onClick: () => ouvrirFicheStock(null) }, '＋ Nouveau stock'),
      (corps, compteur) => {
        const filtre = recherche.trim().toLowerCase()
        const liste = d.Stock
          .filter((s) => !filtre || [nomsChantiers(s), nomsBases(s)].some((v) => v.toLowerCase().includes(filtre)))
          .sort((a, b) => nomsChantiers(a).localeCompare(nomsChantiers(b)) || a.id - b.id)
        compteur.textContent = `${liste.length} stock${liste.length > 1 ? 's' : ''}`
        corps.replaceChildren(...(liste.length === 0
          ? ligneVide(4, d.Stock.length === 0
            ? 'Aucun stock pour l’instant. Crée le premier avec « ＋ Nouveau stock » : chaque ligne aura ensuite ses boutons Modifier et Supprimer.'
            : 'Aucun stock ne correspond à la recherche.')
          : liste.map((s) => h('tr', { className: 'tableau-ligne', onClick: () => ouvrirFicheStock(s) },
            h('td', { className: 'tableau-nom' }, String(s.id)),
            h('td', null, nomsChantiers(s) || '—'),
            h('td', null, nomsBases(s) || '—'),
            actions(() => ouvrirFicheStock(s), () => supprimerStock(s))))))
      })
  }

  // Fiche d'un stock : création (`s` null) ou modification
  function ouvrirFicheStock(s) {
    const champs = { Chantiers: idsDeListe(s?.Chantiers), Base_vie: idsDeListe(s?.Base_vie) }
    const erreur = h('p', { className: 'erreur', hidden: true })
    const valider = h('button', { className: 'bouton bouton-principal', type: 'submit' }, s ? 'Enregistrer' : 'Créer le stock')
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
    s && h('button', { className: 'bouton bouton-danger', type: 'button', onClick: () => { fermer(); supprimerStock(s) } }, 'Supprimer ce stock'))

    const { fermer, section } = ouvrirPanneau(s ? `Stock n° ${s.id}` : 'Nouveau stock', formulaire)
    section.classList.add('panneau-large')
  }

  function supprimerStock(s) {
    fenetreSuppression(`Supprimer le stock n° ${s.id} ?`,
      [h('p', null, `Chantiers : ${nomsChantiers(s) || '—'}. Bases vie : ${nomsBases(s) || '—'}.`)],
      [['Supprimer définitivement', 'bouton-danger', () => supprimerLignes('Stock', [s.id])]], recharger)
  }

  // ---- Onglet Catalogue ----

  function contenuCatalogue() {
    if (!lien) lienPhotos().then((l) => { lien = l; if (onglet === 'catalogue') rendre() }).catch(() => {})
    const sources = [...(d.Stock_Source ?? [])].sort((a, b) => String(a.Source).localeCompare(String(b.Source)))
    return tableau(TITRES_CATALOGUE, 'Rechercher (descriptif, type, format…)',
      (redessiner) => [h('select', { className: 'champ champ-compact champ-statut', 'aria-label': 'Filtrer par source',
        onChange: (e) => { filtreSource = Number(e.target.value); redessiner() } },
      h('option', { value: '0', selected: !filtreSource }, 'Toutes les sources'),
      sources.map((s) => h('option', { value: String(s.id), selected: filtreSource === s.id }, s.Source)))],
      h('button', { className: 'bouton bouton-principal bouton-compact', onClick: () => ouvrirFicheArticle(null) }, '＋ Nouvel article'),
      (corps, compteur) => {
        const filtre = recherche.trim().toLowerCase()
        const liste = d.Stock_Reference
          .filter((r) => !filtreSource || r.Source === filtreSource)
          .filter((r) => !filtre || [r.Descriptif, r.Format_ou_taille, r.Commentaire, type(r), source(r)].some((v) => String(v ?? '').toLowerCase().includes(filtre)))
          .sort((a, b) => source(a).localeCompare(source(b)) || type(a).localeCompare(type(b)) || String(a.Descriptif).localeCompare(String(b.Descriptif), 'fr', { numeric: true }))
        compteur.textContent = `${liste.length} article${liste.length > 1 ? 's' : ''}`
        corps.replaceChildren(...(liste.length === 0
          ? ligneVide(7, d.Stock_Reference.length === 0 ? 'Aucun article pour l’instant. Ajoute le premier avec « ＋ Nouvel article ».' : 'Aucun article ne correspond à la recherche ou à la source choisie.')
          : liste.map((r) => {
            const photo = idsDeListe(r.Photo)[0]
            return h('tr', { className: 'tableau-ligne', onClick: () => ouvrirFicheArticle(r) },
              h('td', null, photo && lien ? h('img', { className: 'tableau-photo', src: lien(photo), alt: '', loading: 'lazy' }) : ''),
              h('td', null, source(r)),
              h('td', null, type(r)),
              h('td', { className: 'tableau-nom' }, r.Descriptif || '—'),
              h('td', null, r.Format_ou_taille ?? ''),
              h('td', null, h('span', { className: 'cellule-description' }, r.Commentaire ?? '')),
              actions(() => ouvrirFicheArticle(r), () => supprimerArticle(r)))
          })))
      })
  }

  // Fiche d'un article : création (`r` null) ou modification. Le type est choisi parmi ceux de la source.
  function ouvrirFicheArticle(r) {
    const champs = { Source: r?.Source || 0, Type: r?.Type || 0, Descriptif: r?.Descriptif ?? '', Format_ou_taille: r?.Format_ou_taille ?? '', Commentaire: r?.Commentaire ?? '' }
    let nouvellePhoto = null
    const photo = idsDeListe(r?.Photo)[0]
    const erreur = h('p', { className: 'erreur', hidden: true })
    const valider = h('button', { className: 'bouton bouton-principal', type: 'submit' }, r ? 'Enregistrer' : 'Ajouter l’article')
    const groupe = (libelle, champ) => h('label', { className: 'champ-groupe' }, libelle, champ)
    const texte = (col, attributs = {}) => h('input', { className: 'champ', autocomplete: 'off', value: champs[col], onInput: (e) => { champs[col] = e.target.value }, ...attributs })

    const listeTypes = h('select', { className: 'champ', onChange: (e) => { champs.Type = Number(e.target.value) } })
    const dessinerTypes = () => {
      const types = (d.Stock_Type ?? []).filter((t) => t.Source === champs.Source).sort((a, b) => String(a.Type).localeCompare(String(b.Type)))
      if (!types.some((t) => t.id === champs.Type)) champs.Type = 0 // type d'une autre source : vidé
      listeTypes.replaceChildren(h('option', { value: '0', selected: !champs.Type }, champs.Source ? '— Choisir —' : '— Choisir d’abord la source —'),
        ...types.map((t) => h('option', { value: String(t.id), selected: t.id === champs.Type }, t.Type)))
      listeTypes.disabled = !champs.Source
    }
    dessinerTypes()

    const formulaire = h('form', { className: 'formulaire', onSubmit: async (ev) => {
      ev.preventDefault()
      erreur.hidden = true
      const probleme = !champs.Source ? 'Choisis la source.' : !champs.Type ? 'Choisis le type.' : !champs.Descriptif.trim() ? 'Le descriptif est obligatoire.' : null
      if (probleme) {
        erreur.textContent = probleme
        erreur.hidden = false
        return
      }
      valider.disabled = true
      try {
        const valeurs = { ...champs, Descriptif: champs.Descriptif.trim(), Format_ou_taille: champs.Format_ou_taille.trim(), Commentaire: champs.Commentaire.trim() }
        if (nouvellePhoto) valeurs.Photo = ['L', await envoyerPhoto(await reduirePhoto(nouvellePhoto), nouvellePhoto.name)]
        await enregistrerLigne('Stock_Reference', r?.id ?? null, valeurs)
        fermer()
        await recharger()
      } catch (err) {
        erreur.textContent = err.message || 'L’enregistrement a échoué.'
        erreur.hidden = false
        valider.disabled = false
      }
    } },
    h('div', { className: 'grille-2' },
      groupe('Source *', h('select', { className: 'champ', onChange: (e) => { champs.Source = Number(e.target.value); dessinerTypes() } },
        h('option', { value: '0', selected: !champs.Source }, '— Choisir —'),
        [...(d.Stock_Source ?? [])].sort((a, b) => String(a.Source).localeCompare(String(b.Source)))
          .map((s) => h('option', { value: String(s.id), selected: s.id === champs.Source }, s.Source)))),
      groupe('Type *', listeTypes),
      groupe('Descriptif *', texte('Descriptif', { required: true })),
      groupe('Format ou taille', texte('Format_ou_taille', { placeholder: 'unité, paire, bidon 5L, 42, XL…' }))),
    groupe('Commentaire', h('textarea', { className: 'champ champ-texte', value: champs.Commentaire, onInput: (e) => { champs.Commentaire = e.target.value } })),
    h('div', { className: 'champ-groupe' }, 'Photo',
      zoneFichier((f) => { nouvellePhoto = f }, { deja: Boolean(photo), lien: photo && lien ? lien(photo) : null, accept: 'image/*' })),
    erreur, valider,
    r && h('button', { className: 'bouton bouton-danger', type: 'button', onClick: () => { fermer(); supprimerArticle(r) } }, 'Supprimer cet article'))

    const { fermer, section } = ouvrirPanneau(r ? r.Descriptif || 'Article' : 'Nouvel article', formulaire)
    section.classList.add('panneau-large')
  }

  function supprimerArticle(r) {
    fenetreSuppression(`Supprimer « ${r.Descriptif || 'cet article'} » ?`,
      [h('p', null, [source(r), type(r), r.Format_ou_taille].filter(Boolean).join(' › '))],
      [['Supprimer définitivement', 'bouton-danger', () => supprimerLignes('Stock_Reference', [r.id])]], recharger)
  }

  return {
    afficher(donnees) {
      d = donnees
      rendre()
    },
    accueil() {
      onglet = 'stocks'
      recherche = ''
      filtreSource = 0
      rendre()
    },
  }
}
