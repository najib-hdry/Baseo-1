// Écrans des stocks (admin), deux pages du menu :
// - « Gestion des stocks » (vue 'stocks') : tableau des stocks (chantiers servis, bases vie où ils sont rangés), fiche, suppression ;
// - sa sous-page « Catalogue » (vue 'catalogue') : tableau des articles (Stock_Reference) avec recherche et filtre par source, fiche, suppression.
import { h, ouvrirPanneau, etiqueterLignes, fenetreSuppression, zoneFichier, reduirePhoto, compte, menuPlus } from './outils.js'
import { estAdmin, idsDeListe, enregistrerLigne, supprimerLignes, lienPhotos, envoyerPhoto, ajouterElementsStock, entreesSortiesStock } from './donnees.js'

const TITRES_STOCKS = ['N°', 'Nom', 'Chantiers', 'Bases vie', 'Voir les articles', '']
const TITRES_ARTICLES = ['Photo', 'Source', 'Type', 'Article', 'Entrée totale', 'Sortie totale', 'Actuelle', 'Seuil', 'Alerte', 'Commentaire']
const TITRES_ES = ['Source', 'Type', 'Article', 'Actuelle', 'Seuil', 'Entrée', 'Sortie', 'Après']
// Colonnes de nombres des articles et des entrées/sorties : centrées (titre et valeurs)
const COLONNES_NOMBRES = new Set(['Entrée totale', 'Sortie totale', 'Actuelle', 'Seuil', 'Entrée', 'Sortie', 'Après'])
const TITRES_CHOIX = ['', 'Source', 'Type', 'Descriptif', 'Format ou taille', 'Déjà dans le stock', 'Quantité', 'Seuil']
const TITRES_CATALOGUE = ['Photo', 'Source', 'Type', 'Descriptif', 'Format ou taille', 'Commentaire', '']

// Écran affiché dans `racine` ; `recharger()` relit les données après une écriture ; `vue` : 'stocks' ou 'catalogue'
export function creerEcranStocks(racine, recharger, vue = 'stocks') {
  let d = null
  let recherche = ''
  let filtreSource = 0 // 0 : toutes les sources
  let lien = null // adresse temporaire d'une photo (pièce jointe Grist)

  const parNom = (a, b) => String(a.Nom).localeCompare(String(b.Nom), 'fr', { numeric: true })
  const nomsChantiers = (s) => idsDeListe(s.Chantiers).map((id) => d.parId.Chantiers.get(id)?.Nom).filter(Boolean).join(', ')
  // Base vie suivie de son chantier : deux chantiers peuvent avoir une « BV1 »
  const nomsBases = (s) => idsDeListe(s.Base_vie).map((id) => d.parId.Bases_vie.get(id)).filter(Boolean)
    .map((b) => `${b.Nom}${b.Chantier ? ` (${d.parId.Chantiers.get(b.Chantier)?.Nom ?? ''})` : ''}`).join(', ')
  const nomStock = (s) => s.Nom || `Stock n° ${s.id}`
  const elementsDe = (s) => (d.Stock_Elements ?? []).filter((e) => e.Stock === s.id)
  const source = (r) => d.parId.Stock_Source.get(r.Source)?.Source ?? ''
  const type = (r) => d.parId.Stock_Type.get(r.Type)?.Type ?? ''

  function rendre() {
    if (!d) return
    if (!estAdmin(d)) {
      racine.replaceChildren(h('p', { className: 'message' }, 'Page réservée aux administrateurs.'))
      return
    }
    const table = vue === 'stocks' ? 'Stock' : 'Stock_Reference'
    if (d.absentes.has(table)) {
      racine.replaceChildren(h('p', { className: 'message' }, `Ce document n’a pas de table ${table}.`))
      return
    }
    racine.replaceChildren(h('section', { className: 'carte-tableau' }, ...(vue === 'stocks' ? contenuStocks() : contenuCatalogue())))
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
    return tableau(TITRES_STOCKS, 'Rechercher (nom, chantier, base vie…)', () => [],
      h('button', { className: 'bouton bouton-principal bouton-compact', onClick: () => ouvrirFicheStock(null) }, '＋ Nouveau stock'),
      (corps, compteur) => {
        const filtre = recherche.trim().toLowerCase()
        const liste = d.Stock
          .filter((s) => !filtre || [s.Nom ?? '', nomsChantiers(s), nomsBases(s)].some((v) => v.toLowerCase().includes(filtre)))
          .sort((a, b) => String(a.Nom ?? '').localeCompare(String(b.Nom ?? ''), 'fr', { numeric: true }) || nomsChantiers(a).localeCompare(nomsChantiers(b)) || a.id - b.id)
        compteur.textContent = compte(liste.length, d.Stock.length, 'stock')
        corps.replaceChildren(...(liste.length === 0
          ? ligneVide(6, d.Stock.length === 0
            ? 'Aucun stock pour l’instant. Crée le premier avec « ＋ Nouveau stock » : chaque ligne aura ensuite ses boutons Modifier et Supprimer.'
            : 'Aucun stock ne correspond à la recherche.')
          : liste.map((s) => h('tr', { className: 'tableau-ligne', onClick: () => ouvrirFicheStock(s) },
            h('td', null, String(s.id)),
            h('td', { className: 'tableau-nom' }, s.Nom || '—'),
            h('td', null, nomsChantiers(s) || '—'),
            h('td', null, nomsBases(s) || '—'),
            h('td', null, h('button', { className: 'bouton bouton-compact', onClick: (ev) => { ev.stopPropagation(); ouvrirArticles(s) } },
              `Voir les articles (${elementsDe(s).length})`)),
            h('td', { className: 'tableau-actions' },
              h('button', { className: 'bouton bouton-compact bouton-principal', onClick: (ev) => { ev.stopPropagation(); ouvrirEntreesSorties(s) } }, 'Entrées / sorties'),
              menuPlus([
                h('button', { className: 'bouton bouton-compact', role: 'menuitem', onClick: (ev) => { ev.stopPropagation(); ouvrirFicheStock(s) } }, 'Modifier'),
                h('button', { className: 'bouton bouton-compact bouton-danger', role: 'menuitem', onClick: (ev) => { ev.stopPropagation(); supprimerStock(s) } }, 'Supprimer')]))))))
      })
  }

  // Fiche d'un stock : création (`s` null) ou modification
  function ouvrirFicheStock(s) {
    const champs = { Nom: s?.Nom ?? '', Chantiers: idsDeListe(s?.Chantiers), Base_vie: idsDeListe(s?.Base_vie) }
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
      const probleme = !champs.Nom.trim() ? 'Le nom du stock est obligatoire.' : champs.Chantiers.length === 0 ? 'Coche au moins un chantier.' : null
      if (probleme) {
        erreur.textContent = probleme
        erreur.hidden = false
        return
      }
      valider.disabled = true
      try {
        const liste = (ids) => (ids.length > 0 ? ['L', ...ids] : null)
        const reponse = await enregistrerLigne('Stock', s?.id ?? null, { Nom: champs.Nom.trim(), Chantiers: liste(champs.Chantiers), Base_vie: liste(champs.Base_vie) })
        fermer()
        await recharger()
        // Nouveau stock : on choisit tout de suite ses articles dans le catalogue
        const nouveau = s ? null : d.parId.Stock.get(reponse?.retValues?.[0])
        if (nouveau) ouvrirChoixArticles(nouveau)
      } catch (err) {
        erreur.textContent = err.message || 'L’enregistrement a échoué.'
        erreur.hidden = false
        valider.disabled = false
      }
    } },
    h('label', { className: 'champ-groupe' }, 'Nom du stock *',
      h('input', { className: 'champ', autocomplete: 'off', required: true, placeholder: 'Réserve Nord, Stock Tour A…', value: champs.Nom, onInput: (e) => { champs.Nom = e.target.value } })),
    h('fieldset', { className: 'groupe' }, h('legend', null, 'Chantiers servis par ce stock'),
      h('div', { className: 'cases-chantiers' }, [...d.Chantiers].sort(parNom).map((c) => caseACocher('Chantiers', c.id, c.Nom || 'Sans nom', dessinerBases)))),
    h('fieldset', { className: 'groupe' }, h('legend', null, 'Bases vie où le stock est rangé'), zoneBases),
    erreur, valider,
    s && h('button', { className: 'bouton', type: 'button', onClick: () => ouvrirDepuis(() => ouvrirChoixArticles(s)) }, 'Ajouter des articles du catalogue'),
    s && h('button', { className: 'bouton bouton-danger', type: 'button', onClick: () => ouvrirDepuis(() => supprimerStock(s)) }, 'Supprimer ce stock'))

    const { fermer, ouvrirDepuis, section } = ouvrirPanneau(s ? nomStock(s) : 'Nouveau stock', formulaire)
    section.classList.add('panneau-large')
  }

  /**
   * Grande fenêtre : le catalogue avec une case et une quantité par article, pour remplir le stock `s`.
   * Quantité et seuil partent des colonnes temporaires « Quantité initiale » et « Quantité seuil » du catalogue ;
   * saisir une quantité ou un seuil coche l'article. À la validation, les éléments du stock sont créés (ou mis à jour
   * s'ils y sont déjà) et les colonnes temporaires du catalogue remises à 0.
   * `apres()` : après l'enregistrement (ex. rouvrir la fenêtre « Articles » à jour).
   */
  function ouvrirChoixArticles(s, apres = null) {
    const quantites = new Map(d.Stock_Reference.map((r) => [r.id, r.Quantite_initiale || 0]))
    const seuils = new Map(d.Stock_Reference.map((r) => [r.id, r.Quantite_seuil || 0]))
    const choisis = new Set(d.Stock_Reference.filter((r) => r.Quantite_initiale > 0 || r.Quantite_seuil > 0).map((r) => r.id))
    const dansLeStock = new Map(elementsDe(s).map((e) => [e.Descriptif, (e.Quantite_entree || 0) - (e.Quantite_sortie || 0)]))
    let filtreTexte = ''
    let filtreSrc = 0
    const corps = h('tbody')
    const resume = h('p', { className: 'sous-texte' })
    const erreur = h('p', { className: 'erreur', hidden: true })
    const valider = h('button', { className: 'bouton bouton-principal', type: 'button', onClick: async () => {
      erreur.hidden = true
      valider.disabled = true
      try {
        const choix = d.Stock_Reference.filter((r) => choisis.has(r.id)).map((r) => ({ reference: r, quantite: quantites.get(r.id) || 0, seuil: seuils.get(r.id) || 0 }))
        await ajouterElementsStock(d, s.id, choix)
        fermer()
        await recharger()
        apres?.()
      } catch (err) {
        erreur.textContent = err.message || 'L’enregistrement a échoué.'
        erreur.hidden = false
        valider.disabled = false
      }
    } })
    // Case de saisie d'un nombre (quantité ou seuil) ; un nombre saisi coche l'article
    const saisie = (valeurs, r, libelle) => h('td', null, h('input', { className: 'champ champ-compact', type: 'number', min: 0, step: 'any', style: 'width:100px',
      value: valeurs.get(r.id) || '', 'aria-label': libelle, onInput: (e) => {
        const v = Number(e.target.value) || 0
        valeurs.set(r.id, v)
        if (v > 0 && !choisis.has(r.id)) { choisis.add(r.id); e.target.closest('tr').querySelector('input[type=checkbox]').checked = true }
        majResume()
      } }))
    const majResume = () => {
      const n = choisis.size
      const total = [...choisis].reduce((t, id) => t + (quantites.get(id) || 0), 0)
      resume.textContent = n ? `${n} article${n > 1 ? 's' : ''} choisi${n > 1 ? 's' : ''}, ${total} au total.` : 'Aucun article choisi.'
      valider.textContent = n ? `Ajouter ${n} article${n > 1 ? 's' : ''} au stock` : 'Ajouter au stock'
      valider.disabled = n === 0
    }
    const dessiner = () => {
      const filtre = filtreTexte.trim().toLowerCase()
      const liste = d.Stock_Reference
        .filter((r) => !filtreSrc || r.Source === filtreSrc)
        .filter((r) => !filtre || [r.Descriptif, r.Format_ou_taille, type(r), source(r)].some((v) => String(v ?? '').toLowerCase().includes(filtre)))
        .sort((a, b) => source(a).localeCompare(source(b)) || type(a).localeCompare(type(b)) || String(a.Descriptif).localeCompare(String(b.Descriptif), 'fr', { numeric: true }))
      corps.replaceChildren(...(liste.length === 0 ? ligneVide(8, 'Aucun article ne correspond à la recherche ou à la source choisie.')
        : liste.map((r) => {
          const coche = h('input', { type: 'checkbox', checked: choisis.has(r.id), 'aria-label': `Choisir ${r.Descriptif}`, onChange: (e) => {
            if (e.target.checked) choisis.add(r.id); else choisis.delete(r.id)
            majResume()
          } })
          const deja = dansLeStock.get(r.id)
          return h('tr', null,
            h('td', null, coche),
            h('td', null, source(r)),
            h('td', null, type(r)),
            h('td', { className: 'tableau-nom' }, r.Descriptif || '—'),
            h('td', null, r.Format_ou_taille ?? ''),
            h('td', { className: 'tableau-nombre' }, deja == null ? '—' : String(deja)),
            saisie(quantites, r, `Quantité de ${r.Descriptif}`),
            saisie(seuils, r, `Seuil de ${r.Descriptif}`))
        })))
      etiqueterLignes(corps, TITRES_CHOIX)
    }
    dessiner()
    majResume()

    const sources = [...(d.Stock_Source ?? [])].sort((a, b) => String(a.Source).localeCompare(String(b.Source)))
    const { fermer, annuler, section } = ouvrirPanneau(`Articles du stock « ${nomStock(s)} »`, [
      h('p', null, 'Coche les articles de ce stock et saisis leur quantité de départ et leur seuil. Les quantités temporaires du catalogue (initiale et seuil) sont reprises ici ; elles sont remises à 0 après l’ajout.'),
      h('div', { className: 'barre-outils' },
        h('input', { className: 'champ champ-compact', type: 'search', placeholder: 'Rechercher (descriptif, type, format…)', 'aria-label': 'Rechercher un article',
          onInput: (e) => { filtreTexte = e.target.value; dessiner() } }),
        h('select', { className: 'champ champ-compact champ-statut', 'aria-label': 'Filtrer par source', onChange: (e) => { filtreSrc = Number(e.target.value); dessiner() } },
          h('option', { value: '0' }, 'Toutes les sources'),
          sources.map((src) => h('option', { value: String(src.id) }, src.Source)))),
      h('div', { className: 'tableau-defilant' },
        h('table', { className: 'tableau' }, h('thead', null, h('tr', null, TITRES_CHOIX.map((t) => h('th', null, t)))), corps)),
      resume, erreur,
      h('div', { className: 'fiche-boutons' }, valider,
        h('button', { className: 'bouton', type: 'button', onClick: () => annuler() }, 'Plus tard')),
    ])
    section.classList.add('panneau-large', 'panneau-fiche')
  }

  // Libellé d'un élément de stock : celui de son article du catalogue (descriptif — format)
  const libelleElement = (e) => d.parId.Stock_Reference.get(e.Descriptif)?.Libelle || d.parId.Stock_Reference.get(e.Descriptif)?.Descriptif || 'Article sans nom'

  // Grande fenêtre : le tableau des articles du stock `s` (Stock_Elements), avec recherche, filtre par source et « à commander »
  function ouvrirArticles(s) {
    // Après une entrée / sortie ou un ajout d'articles : la fenêtre se rouvre avec les quantités à jour
    const rouvrirArticles = () => { const aJour = d.parId.Stock.get(s.id); if (aJour) ouvrirArticles(aJour) }
    if (!lien) lienPhotos().then((l) => { lien = l; dessiner() }).catch(() => {})
    const actuelle = (e) => (e.Quantite_entree || 0) - (e.Quantite_sortie || 0)
    const enAlerte = (e) => Boolean(e.Quantite_seuil) && actuelle(e) <= e.Quantite_seuil
    const elements = elementsDe(s).map((e) => ({ ...e, libelle: libelleElement(e) }))
      .sort((a, b) => source(a).localeCompare(source(b)) || type(a).localeCompare(type(b)) || a.libelle.localeCompare(b.libelle, 'fr', { numeric: true }))
    let filtreTexte = ''
    let filtreSrc = 0
    let seulementAlertes = false
    const corps = h('tbody')
    const compteur = h('p', { className: 'sous-texte' })
    function dessiner() {
      const filtre = filtreTexte.trim().toLowerCase()
      const liste = elements
        .filter((e) => !filtreSrc || e.Source === filtreSrc)
        .filter((e) => !seulementAlertes || enAlerte(e))
        .filter((e) => !filtre || [e.libelle, type(e), source(e), e.Commentaire].some((v) => String(v ?? '').toLowerCase().includes(filtre)))
      const alertes = elements.filter(enAlerte).length
      compteur.textContent = `${compte(liste.length, elements.length, 'article')}${alertes ? ` · ${alertes} à commander` : ''}`
      corps.replaceChildren(...(liste.length === 0
        ? ligneVide(10, elements.length === 0 ? 'Ce stock n’a pas encore d’articles : ajoute-les depuis sa fiche (« Ajouter des articles du catalogue »).' : 'Aucun article ne correspond à la recherche ou aux filtres.')
        : liste.map((e) => {
          const photo = idsDeListe(e.Photo)[0]
          return h('tr', null,
            h('td', null, photo && lien ? h('img', { className: 'tableau-photo', src: lien(photo), alt: '', loading: 'lazy' }) : ''),
            h('td', null, source(e)),
            h('td', null, type(e)),
            h('td', { className: 'tableau-nom' }, e.libelle),
            h('td', { className: 'tableau-nombre tableau-centre' }, String(e.Quantite_entree || 0)),
            h('td', { className: 'tableau-nombre tableau-centre' }, String(e.Quantite_sortie || 0)),
            h('td', { className: 'tableau-nombre tableau-centre' }, h('strong', null, String(actuelle(e)))),
            h('td', { className: 'tableau-nombre tableau-centre' }, e.Quantite_seuil ? String(e.Quantite_seuil) : ''),
            h('td', null, enAlerte(e) ? h('span', { className: 'badge badge-ouvert' }, 'À commander') : ''),
            h('td', null, h('span', { className: 'cellule-description' }, e.Commentaire ?? '')))
        })))
      etiqueterLignes(corps, TITRES_ARTICLES)
    }
    dessiner()

    const sources = [...(d.Stock_Source ?? [])].sort((a, b) => String(a.Source).localeCompare(String(b.Source)))
    const { annuler, ouvrirDepuis, section } = ouvrirPanneau(`Articles — ${nomStock(s)}`, [
      h('div', { className: 'barre-outils' },
        h('input', { className: 'champ champ-compact', type: 'search', placeholder: 'Rechercher (article, type, commentaire…)', 'aria-label': 'Rechercher un article',
          onInput: (ev) => { filtreTexte = ev.target.value; dessiner() } }),
        h('select', { className: 'champ champ-compact champ-statut', 'aria-label': 'Filtrer par source', onChange: (ev) => { filtreSrc = Number(ev.target.value); dessiner() } },
          h('option', { value: '0' }, 'Toutes les sources'),
          sources.map((src) => h('option', { value: String(src.id) }, src.Source))),
        h('label', { className: 'case' }, h('input', { type: 'checkbox', onChange: (ev) => { seulementAlertes = ev.target.checked; dessiner() } }), 'Seulement à commander')),
      compteur,
      h('div', { className: 'tableau-defilant' },
        h('table', { className: 'tableau' }, h('thead', null, h('tr', null, TITRES_ARTICLES.map((t) => h('th', { className: COLONNES_NOMBRES.has(t) ? 'tableau-centre' : null }, t)))), corps)),
      h('div', { className: 'fiche-boutons' },
        h('button', { className: 'bouton bouton-principal', type: 'button', onClick: () => ouvrirDepuis(() => ouvrirEntreesSorties(s, rouvrirArticles)) }, 'Entrées / sorties'),
        h('button', { className: 'bouton', type: 'button', onClick: () => ouvrirDepuis(() => ouvrirChoixArticles(s, rouvrirArticles)) }, 'Ajouter des articles du catalogue'),
        h('button', { className: 'bouton', type: 'button', onClick: () => annuler() }, 'Fermer')),
    ])
    section.classList.add('panneau-large', 'panneau-fiche')
  }

  /**
   * Grande fenêtre : tous les articles du stock `s`, avec deux cases Entrée et Sortie par ligne.
   * On remplit plusieurs lignes, puis un seul « Valider » ajoute les quantités aux totaux du stock.
   * `apres()` : après l'enregistrement (ex. rouvrir la fenêtre « Articles » à jour).
   */
  function ouvrirEntreesSorties(s, apres = null) {
    const elements = elementsDe(s).map((e) => ({ ...e, libelle: libelleElement(e) }))
      .sort((a, b) => source(a).localeCompare(source(b)) || type(a).localeCompare(type(b)) || a.libelle.localeCompare(b.libelle, 'fr', { numeric: true }))
    const saisies = new Map(elements.map((e) => [e.id, { element: e, entree: 0, sortie: 0 }]))
    const actuelle = (e) => (e.Quantite_entree || 0) - (e.Quantite_sortie || 0)
    let filtreTexte = ''
    let filtreSrc = 0
    const corps = h('tbody')
    const resume = h('p', { className: 'sous-texte' })
    const erreur = h('p', { className: 'erreur', hidden: true })
    const valider = h('button', { className: 'bouton bouton-principal', type: 'button', onClick: async () => {
      erreur.hidden = true
      valider.disabled = true
      try {
        await entreesSortiesStock([...saisies.values()])
        fermer()
        await recharger()
        apres?.()
      } catch (err) {
        erreur.textContent = err.message || 'L’enregistrement a échoué.'
        erreur.hidden = false
        valider.disabled = false
      }
    } })
    const majResume = () => {
      const remplies = [...saisies.values()].filter((x) => x.entree || x.sortie)
      const entrees = remplies.reduce((t, x) => t + x.entree, 0)
      const sorties = remplies.reduce((t, x) => t + x.sortie, 0)
      resume.textContent = remplies.length ? `${remplies.length} article${remplies.length > 1 ? 's' : ''} : ${entrees} en entrée, ${sorties} en sortie.` : 'Aucune entrée ni sortie saisie.'
      valider.textContent = remplies.length ? `Valider ${remplies.length} ligne${remplies.length > 1 ? 's' : ''}` : 'Valider'
      valider.disabled = remplies.length === 0
    }
    const dessiner = () => {
      const filtre = filtreTexte.trim().toLowerCase()
      const liste = elements
        .filter((e) => !filtreSrc || e.Source === filtreSrc)
        .filter((e) => !filtre || [e.libelle, type(e), source(e)].some((v) => String(v ?? '').toLowerCase().includes(filtre)))
      corps.replaceChildren(...(liste.length === 0
        ? ligneVide(8, elements.length === 0 ? 'Ce stock n’a pas encore d’articles : ajoute-les depuis sa fiche (« Ajouter des articles du catalogue »).' : 'Aucun article ne correspond à la recherche ou à la source choisie.')
        : liste.map((e) => {
          const saisie = saisies.get(e.id)
          const apres = h('td', { className: 'tableau-nombre tableau-centre' })
          const majApres = () => {
            const v = actuelle(e) + saisie.entree - saisie.sortie
            apres.textContent = saisie.entree || saisie.sortie ? String(v) : ''
            apres.style.color = v < 0 ? 'var(--hs)' : ''
          }
          majApres()
          const caseNombre = (cle, libelleCase) => h('td', { className: 'tableau-centre' }, h('input', { className: 'champ champ-compact', type: 'number', min: 0, step: 'any', style: 'width:90px',
            value: saisie[cle] || '', 'aria-label': libelleCase, onInput: (ev) => { saisie[cle] = Math.max(0, Number(ev.target.value) || 0); majApres(); majResume() } }))
          const enAlerte = e.Quantite_seuil && actuelle(e) <= e.Quantite_seuil
          return h('tr', null,
            h('td', null, source(e)),
            h('td', null, type(e)),
            h('td', { className: 'tableau-nom' }, e.libelle),
            h('td', { className: 'tableau-nombre tableau-centre' }, String(actuelle(e)), enAlerte && h('span', { title: 'À commander' }, ' ⚠️')),
            h('td', { className: 'tableau-nombre tableau-centre' }, e.Quantite_seuil ? String(e.Quantite_seuil) : ''),
            caseNombre('entree', `Entrée de ${e.libelle}`),
            caseNombre('sortie', `Sortie de ${e.libelle}`),
            apres)
        })))
      etiqueterLignes(corps, TITRES_ES)
    }
    dessiner()
    majResume()

    const sources = [...(d.Stock_Source ?? [])].sort((a, b) => String(a.Source).localeCompare(String(b.Source)))
    const { fermer, annuler, section } = ouvrirPanneau(`Entrées / sorties — ${nomStock(s)}`, [
      h('p', null, 'Saisis les quantités qui entrent ou qui sortent, sur autant de lignes que tu veux, puis valide une seule fois. Elles s’ajoutent aux totaux du stock.'),
      h('div', { className: 'barre-outils' },
        h('input', { className: 'champ champ-compact', type: 'search', placeholder: 'Rechercher (article, type…)', 'aria-label': 'Rechercher un article',
          onInput: (ev) => { filtreTexte = ev.target.value; dessiner() } }),
        h('select', { className: 'champ champ-compact champ-statut', 'aria-label': 'Filtrer par source', onChange: (ev) => { filtreSrc = Number(ev.target.value); dessiner() } },
          h('option', { value: '0' }, 'Toutes les sources'),
          sources.map((src) => h('option', { value: String(src.id) }, src.Source)))),
      h('div', { className: 'tableau-defilant' },
        h('table', { className: 'tableau' }, h('thead', null, h('tr', null, TITRES_ES.map((t) => h('th', { className: COLONNES_NOMBRES.has(t) ? 'tableau-centre' : null }, t)))), corps)),
      resume, erreur,
      h('div', { className: 'fiche-boutons' }, valider, h('button', { className: 'bouton', type: 'button', onClick: () => annuler() }, 'Annuler')),
    ])
    section.classList.add('panneau-large', 'panneau-fiche')
  }

  function supprimerStock(s) {
    fenetreSuppression(`Supprimer « ${nomStock(s)} » ?`,
      [h('p', null, `Chantiers : ${nomsChantiers(s) || '—'}. Bases vie : ${nomsBases(s) || '—'}.`)],
      [['Supprimer définitivement', 'bouton-danger', () => supprimerLignes('Stock', [s.id])]], recharger)
  }

  // ---- Onglet Catalogue ----

  function contenuCatalogue() {
    if (!lien) lienPhotos().then((l) => { lien = l; rendre() }).catch(() => {})
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
        compteur.textContent = compte(liste.length, d.Stock_Reference.filter((r) => !filtreSource || r.Source === filtreSource).length, 'article')
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
    r && h('button', { className: 'bouton bouton-danger', type: 'button', onClick: () => ouvrirDepuis(() => supprimerArticle(r)) }, 'Supprimer cet article'))

    const { fermer, ouvrirDepuis, section } = ouvrirPanneau(r ? r.Descriptif || 'Article' : 'Nouvel article', formulaire)
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
    // `chantierId` (tuile du Tableau de bord) : recherche préremplie avec le nom du chantier
    accueil({ chantierId } = {}) {
      recherche = (vue === 'stocks' && chantierId && d?.parId.Chantiers.get(chantierId)?.Nom) || ''
      filtreSource = 0
      rendre()
    },
  }
}
