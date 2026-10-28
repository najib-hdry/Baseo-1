// Écrans « annuaire » (admin) : tableau avec recherche, fiche de création / modification, suppression.
// Une même logique pour deux tables, décrites par ENTREPRISES et SOUS_TRAITANTS.
import { h, ouvrirPanneau, etiqueterLignes, lienContact, fenetreSuppression, compte } from './outils.js'
import { enregistrerFiche, supprimerFiche, estAdmin } from './donnees.js'

const responsable = (r) => [r.Responsable_prenom, r.Responsable_nom].filter(Boolean).join(' ')
const nomEntreprise = (d, r) => d.parId.Entreprises.get(r.Entreprise)?.Nom ?? ''

/**
 * Description d'un annuaire :
 * - textes : titre, unite (« entreprise »), nouveau (« Nouvelle entreprise »), creer, ce (« cette entreprise »)
 * - champs : [colonne Grist, libellé, attributs] ; attributs.multiligne → zone de texte, attributs.entreprise → liste des entreprises
 * - colonnes : [titre, (d, r) => contenu de la cellule]
 * - liens(d, r) : lignes d'autres tables rattachées, annoncées avant suppression ([nombre, libellé])
 */
export const ENTREPRISES = {
  table: 'Entreprises', titre: 'Gestion des entreprises', unite: 'entreprise', nouveau: 'Nouvelle entreprise', creer: 'Créer l’entreprise', ce: 'cette entreprise',
  champs: [
    ['Nom', 'Nom de l’entreprise', { required: true }],
    ['Adresse', 'Adresse', { multiligne: true }],
    ['Responsable_prenom', 'Prénom du responsable', {}],
    ['Responsable_nom', 'Nom du responsable', {}],
    ['Telephone', 'Téléphone', { type: 'tel' }],
    ['Email', 'Email', { type: 'email' }],
  ],
  colonnes: [
    ['Entreprise', (d, r) => r.Nom || 'Sans nom'],
    ['Responsable', (d, r) => responsable(r)],
    ['Téléphone', (d, r) => lienContact('tel', r.Telephone)],
    ['Email', (d, r) => lienContact('mailto', r.Email)],
    ['Intervenants', (d, r) => d.Intervenants.filter((i) => i.Entreprise === r.id).length],
  ],
  liens: (d, r) => [
    [d.Intervenants.filter((i) => i.Entreprise === r.id).length, 'intervenant(s)'],
    [d.Sous_traitants.filter((s) => s.Entreprise === r.id).length, 'sous-traitant(s)'],
  ],
}

export const SOUS_TRAITANTS = {
  table: 'Sous_traitants', titre: 'Gestion des sous-traitants', unite: 'sous-traitant', nouveau: 'Nouveau sous-traitant', creer: 'Créer le sous-traitant', ce: 'ce sous-traitant',
  champs: [
    ['Nom', 'Nom du sous-traitant', { required: true }],
    ['Entreprise', 'Entreprise', { entreprise: true }],
    ['Adresse', 'Adresse', { multiligne: true }],
    ['Responsable_prenom', 'Prénom du responsable', {}],
    ['Responsable_nom', 'Nom du responsable', {}],
    ['Telephone', 'Téléphone', { type: 'tel' }],
    ['Email', 'Email', { type: 'email' }],
  ],
  colonnes: [
    ['Sous-traitant', (d, r) => r.Nom || 'Sans nom'],
    ['Entreprise', (d, r) => nomEntreprise(d, r)],
    ['Responsable', (d, r) => responsable(r)],
    ['Téléphone', (d, r) => lienContact('tel', r.Telephone)],
    ['Email', (d, r) => lienContact('mailto', r.Email)],
  ],
  liens: () => [],
}

// Écran d'un annuaire (`config` : ENTREPRISES ou SOUS_TRAITANTS), affiché dans `racine`
export function creerEcranAnnuaire(racine, recharger, config) {
  let d = null
  let recherche = ''
  const titres = [...config.colonnes.map(([titre]) => titre), '']

  function rendre() {
    if (!d) return
    if (!estAdmin(d)) {
      racine.replaceChildren(h('p', { className: 'message' }, 'Page réservée aux administrateurs.'))
      return
    }
    if (d.absentes.has(config.table)) {
      racine.replaceChildren(h('p', { className: 'message' }, `Ce document n’a pas de table ${config.table}.`))
      return
    }
    const corps = h('tbody')
    const compteur = h('p', { className: 'sous-texte' })
    // Ne redessine que les lignes : le champ de recherche garde le curseur
    const dessinerLignes = () => {
      const filtre = recherche.trim().toLowerCase()
      const texte = (r) => [...config.colonnes.map(([, cellule]) => cellule(d, r)), r.Adresse]
        .map((v) => (v instanceof Node ? v.textContent : String(v ?? ''))).join(' ').toLowerCase()
      const liste = d[config.table].filter((r) => !filtre || texte(r).includes(filtre))
        .sort((a, b) => String(a.Nom).localeCompare(String(b.Nom)))
      const total = d[config.table].length
      compteur.textContent = compte(liste.length, total, config.unite)
      corps.replaceChildren(...(liste.length === 0
        ? [h('tr', null, h('td', { className: 'tableau-vide', colSpan: titres.length }, filtre ? 'Aucun résultat.' : `Aucun ${config.unite} pour l’instant.`))]
        : liste.map((r) => h('tr', { className: 'tableau-ligne', onClick: () => ouvrirFiche(r) },
          config.colonnes.map(([, cellule], i) => h('td', { className: i === 0 ? 'tableau-nom' : '' }, cellule(d, r))),
          h('td', { className: 'tableau-actions' },
            h('button', { className: 'bouton bouton-compact', onClick: (ev) => { ev.stopPropagation(); ouvrirFiche(r) } }, 'Modifier'),
            h('button', { className: 'bouton bouton-compact bouton-danger', onClick: (ev) => { ev.stopPropagation(); ouvrirSuppression(r) } }, 'Supprimer'))))))
      etiqueterLignes(corps, titres)
    }
    dessinerLignes()
    racine.replaceChildren(
      // Recherche et tableau dans une carte blanche à bordure noire
      h('section', { className: 'carte-tableau' },
        h('div', { className: 'barre-outils' },
          h('input', { className: 'champ champ-compact', type: 'search', placeholder: 'Rechercher (nom, responsable, téléphone, email…)', value: recherche,
            'aria-label': `Rechercher un ${config.unite}`, onInput: (e) => { recherche = e.target.value; dessinerLignes() } }),
          h('button', { className: 'bouton bouton-principal bouton-compact', onClick: () => ouvrirFiche(null) }, `＋ ${config.nouveau}`)),
        compteur,
        h('div', { className: 'tableau-defilant' },
          h('table', { className: 'tableau' },
            h('thead', null, h('tr', null, titres.map((t) => h('th', null, t)))),
            corps))))
  }

  // ---- Fiche : création (`r` null) ou modification ----

  function ouvrirFiche(r) {
    // Référence à une entreprise : 0 = aucune ; texte : chaîne vide
    const champs = Object.fromEntries(config.champs.map(([col, , { entreprise }]) => [col, entreprise ? Number(r?.[col]) || 0 : r?.[col] ?? '']))
    const erreur = h('p', { className: 'erreur', hidden: true })
    const valider = h('button', { className: 'bouton bouton-principal', type: 'submit' }, r ? 'Enregistrer' : config.creer)

    const saisie = (col, { multiligne, entreprise, ...attributs }) => {
      const maj = (ev) => { champs[col] = ev.target.value }
      if (multiligne) return h('textarea', { className: 'champ champ-texte', value: champs[col], onInput: maj })
      if (entreprise) return h('select', { className: 'champ', onChange: (ev) => { champs[col] = Number(ev.target.value) || 0 } },
        h('option', { value: '0', selected: !champs[col] }, '—'),
        [...d.Entreprises].sort((a, b) => String(a.Nom).localeCompare(String(b.Nom)))
          .map((e) => h('option', { value: String(e.id), selected: e.id === champs[col] }, e.Nom || 'Sans nom')))
      return h('input', { className: 'champ', autocomplete: 'off', value: champs[col], ...attributs, onInput: maj })
    }

    const formulaire = h('form', { className: 'formulaire', onSubmit: async (ev) => {
      ev.preventDefault()
      erreur.hidden = true
      valider.disabled = true
      try {
        const propres = Object.fromEntries(Object.entries(champs).map(([col, v]) => [col, typeof v === 'string' ? v.trim() : v]))
        await enregistrerFiche(d, config.table, r?.id ?? null, propres)
        fermer()
        await recharger()
      } catch (err) {
        erreur.textContent = err.message || 'L’enregistrement a échoué.'
        erreur.hidden = false
        valider.disabled = false
      }
    } },
    config.champs.map(([col, libelle, attributs]) => h('label', { className: 'champ-groupe' }, libelle, saisie(col, attributs))),
    erreur, valider,
    r && h('button', { className: 'bouton bouton-danger', type: 'button', onClick: () => ouvrirDepuis(() => ouvrirSuppression(r)) }, `Supprimer ${config.ce}`))

    const { fermer, ouvrirDepuis } = ouvrirPanneau(r ? r.Nom || config.unite : config.nouveau, formulaire)
  }

  // ---- Suppression ----

  function ouvrirSuppression(r) {
    const liens = config.liens(d, r).filter(([n]) => n > 0).map(([n, libelle]) => `${n} ${libelle}`)
    fenetreSuppression(`Supprimer ${r.Nom || config.ce} ?`, [
      h('p', null, liens.length > 0
        ? `Rattachés : ${liens.join(', ')}. Ils resteront dans l’application, mais sans lien vers ${config.ce}.`
        : `Rien n’est rattaché à ${config.ce}.`),
    ], [['Supprimer définitivement', 'bouton-danger', () => supprimerFiche(config.table, r.id)]], recharger)
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
