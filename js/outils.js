// Outils communs aux deux widgets : création d'éléments, dates, fenêtre modale, icônes

// h('div', { className: 'x', onClick }, enfant1, enfant2…) → élément DOM
export function h(tag, props, ...enfants) {
  const el = document.createElement(tag)
  for (const [cle, valeur] of Object.entries(props ?? {})) {
    if (valeur == null || valeur === false) continue
    if (cle.startsWith('on')) el.addEventListener(cle.slice(2).toLowerCase(), valeur)
    else if (cle === 'style' && typeof valeur === 'object') {
      for (const [prop, v] of Object.entries(valeur)) {
        if (prop.startsWith('--')) el.style.setProperty(prop, v) // variable CSS
        else el.style[prop] = v
      }
    }
    else if (cle in el && cle !== 'list') el[cle] = valeur
    else el.setAttribute(cle, valeur === true ? '' : valeur)
  }
  for (const e of enfants.flat(Infinity)) {
    if (e == null || e === false) continue
    el.append(e instanceof Node ? e : document.createTextNode(String(e)))
  }
  return el
}

// Icônes SVG au trait (mêmes tracés que l'application)
const TRACES = {
  grue: '<path d="M4 21h9M7 21V7M10 21V7M7 11l3 3M10 15l-3 3"/><path d="M2 7h20M8.5 7V3M8.5 3 2 7M8.5 3 22 7"/><path d="M18 7v6M17 13h2v2"/>',
  total: '<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M12 3v18M9 9v2M15 9v2"/>',
  libres: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  occupes: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  hs: '<path d="M12 3 21 20H3Z"/><path d="M12 10v4M12 17h.01"/>',
  ouverts: '<path d="M12 3 21 20H3Z"/><path d="M12 10v4M12 17h.01"/>',
  en_cours: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  resolus: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  nettoyage: '<path d="M15 3 10 13"/><path d="M6 13h8l1.5 8h-11Z"/><path d="M8.5 17v4M11.5 17v4"/>',
  maintenance: '<path d="M14.5 6.5a4 4 0 0 0-5 5L3 18l3 3 6.5-6.5a4 4 0 0 0 5-5l-2.5 2.5-2.5-.5-.5-2.5Z"/>',
  entreprise: '<path d="M4 21V5l8-3v19"/><path d="M12 9h8v12"/><path d="M3 21h18"/><path d="M8 7v.01M8 11v.01M8 15v.01M16 13v.01M16 17v.01"/>',
  poste: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><path d="M3 13h18"/>',
}
export function icone(type, taille = 20) {
  const span = document.createElement('span')
  span.innerHTML = `<svg width="${taille}" height="${taille}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${TRACES[type]}</svg>`
  return span.firstChild
}

// Dates : les colonnes Date de Grist stockent des secondes depuis 1970 (minuit UTC)
export function aujourdhui() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export const versGrist = (iso) => (iso ? Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 1000 : null)
export function depuisGrist(v) {
  if (v == null || v === '') return null
  const ms = v instanceof Date ? v.getTime() : typeof v === 'number' ? v * 1000 : Date.parse(v)
  return Number.isNaN(ms) ? null : new Date(ms).toISOString().slice(0, 10)
}
export const enFrancais = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '')
export function dateHeure(v) {
  const ms = v instanceof Date ? v.getTime() : typeof v === 'number' ? v * 1000 : Date.parse(v)
  return Number.isNaN(ms) ? '' : new Date(ms).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// Réduit une photo (1600 px max, JPEG) ; si le navigateur ne sait pas la décoder, renvoie l'original
export async function reduirePhoto(fichier) {
  try {
    const image = await createImageBitmap(fichier)
    const echelle = Math.min(1, 1600 / Math.max(image.width, image.height))
    const toile = document.createElement('canvas')
    toile.width = Math.round(image.width * echelle)
    toile.height = Math.round(image.height * echelle)
    toile.getContext('2d').drawImage(image, 0, 0, toile.width, toile.height)
    return (await new Promise((ok) => toile.toBlob(ok, 'image/jpeg', 0.8))) ?? fichier
  } catch {
    return fichier
  }
}

// Fenêtre modale : voile, titre, bouton ✕, fermeture par Échap
export function ouvrirPanneau(titre, contenu) {
  const fermer = () => {
    voile.remove()
    window.removeEventListener('keydown', touche)
  }
  const touche = (e) => e.key === 'Escape' && fermer()
  const section = h('section', { className: 'panneau', role: 'dialog', 'aria-modal': 'true', onClick: (e) => e.stopPropagation() },
    h('div', { className: 'panneau-haut' },
      h('h2', null, titre),
      h('button', { className: 'bouton bouton-fermer', 'aria-label': 'Fermer', onClick: fermer }, '✕')),
    contenu)
  const voile = h('div', { className: 'voile', onClick: fermer }, section)
  document.body.append(voile)
  window.addEventListener('keydown', touche)
  return { fermer, section }
}

// Barre d'onglets ; un seul élément s'affiche comme simple texte
export function onglets(libelle, elements, actifId, onChoisir) {
  if (elements.length === 0) return null
  if (elements.length === 1) return h('p', { className: 'sous-texte' }, elements[0].Nom)
  return h('div', { className: 'onglets', role: 'tablist', 'aria-label': libelle },
    elements.map((e) => h('button', { className: 'onglet', role: 'tab', 'aria-selected': String(e.id === actifId), onClick: () => onChoisir(e) }, e.Nom)))
}

// Affiche une erreur JavaScript dans le widget (pas de console dans Grist)
export function afficherErreur(err) {
  document.body.append(h('div', { className: 'debug' }, `Erreur : ${err?.message ?? err}\n${err?.stack ?? ''}`))
}
