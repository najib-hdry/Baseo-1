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
  sous_traitant: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/>',
  emargements: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 11l2 2 4-4M9 17h6"/>',
  utilisateurs: '<circle cx="10" cy="8" r="4"/><path d="M3 21a7 7 0 0 1 11-5.7"/><circle cx="18" cy="17" r="2.5"/><path d="M18 12.5v2M18 19.5v2M13.5 17h2M20.5 17h2"/>',
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
// Montant en euros à la française (1 234,56 €)
export const euros = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })

export const enFrancais = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '')
export function dateHeure(v) {
  const ms = v instanceof Date ? v.getTime() : typeof v === 'number' ? v * 1000 : Date.parse(v)
  return Number.isNaN(ms) ? '' : new Date(ms).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// Lien tél. / e-mail (`type` : 'tel' ou 'mailto') ; chaîne vide sans valeur. Le clic n'ouvre pas la ligne du tableau.
export const lienContact = (type, valeur) => (valeur ? h('a', { href: `${type}:${valeur}`, onClick: (ev) => ev.stopPropagation() }, valeur) : '')

/**
 * Fenêtre de confirmation d'une suppression. `texte` : nœuds affichés en tête ; `boutons` : [[libellé, classe, action async]].
 * Après succès : fermeture puis rechargement ; après échec : message et rechargement (un nouvel essai part de données à jour).
 * Renvoie les boutons créés (dans l'ordre) pour que l'appelant puisse les activer ou les masquer.
 */
export function fenetreSuppression(titre, texte, boutons, recharger) {
  const erreur = h('p', { className: 'erreur', hidden: true })
  const elements = boutons.map(([libelle, classe, fn]) => {
    const bouton = h('button', { className: `bouton ${classe}` }, libelle)
    bouton.addEventListener('click', async () => {
      erreur.hidden = true
      bouton.disabled = true
      try {
        await fn()
        fermer()
        await recharger()
      } catch (err) {
        erreur.textContent = err.message || 'L’opération a échoué.'
        erreur.hidden = false
        bouton.disabled = false
        recharger()
      }
    })
    return bouton
  })
  const { fermer } = ouvrirPanneau(titre, [
    ...texte,
    h('p', { className: 'sous-texte' }, 'En cas d’erreur, la suppression s’annule dans l’Historique du document Grist.'),
    erreur, ...elements,
    h('button', { className: 'bouton', onClick: () => fermer() }, 'Annuler'),
  ])
  return elements
}

/**
 * Choix multiple en étiquettes : une liste déroulante pour ajouter, les éléments choisis en étiquettes retirables (✕).
 * - `elements()` : [{ id, libelle }] proposés (relus à chaque dessin) ; `choisis` : identifiants de départ ;
 * - `textes` : { aucun (rien de choisi), choisir (invite), tous (tout est choisi), vide (rien à proposer) } ;
 * - `onChange(ids)` : appelé à chaque ajout ou retrait.
 * Renvoie { element, ids(), ajouter(id), dessiner() } (dessiner() après un changement de la liste proposée).
 */
export function choixEtiquettes({ elements, choisis = [], textes, onChange = () => {} }) {
  let ids = [...choisis]
  const etiquettes = h('div', { className: 'etiquettes-contacts' })
  const changer = (nouveaux) => { ids = nouveaux; onChange(ids); dessiner() }
  const liste = h('select', { className: 'champ', 'aria-label': textes.choisir, onChange: (e) => {
    const id = Number(e.target.value)
    if (id && !ids.includes(id)) changer([...ids, id])
  } })
  function dessiner() {
    const tous = elements()
    const parId = new Map(tous.map((e) => [e.id, e]))
    etiquettes.replaceChildren(...(ids.length === 0
      ? [h('span', { className: 'sous-texte' }, textes.aucun)]
      : ids.map((id) => parId.get(id)).filter(Boolean).map((e) => h('span', { className: 'etiquette-contact' }, e.libelle,
        h('button', { type: 'button', className: 'etiquette-retirer', 'aria-label': `Retirer ${e.libelle}`, onClick: () => changer(ids.filter((x) => x !== e.id)) }, '✕')))))
    const restants = tous.filter((e) => !ids.includes(e.id)).sort((a, b) => a.libelle.localeCompare(b.libelle))
    liste.replaceChildren(
      h('option', { value: '', selected: true }, tous.length === 0 ? textes.vide : restants.length === 0 ? textes.tous : textes.choisir),
      ...restants.map((e) => h('option', { value: String(e.id) }, e.libelle)))
    liste.disabled = restants.length === 0
  }
  dessiner()
  return { element: h('div', { className: 'formulaire' }, etiquettes, liste), ids: () => ids, ajouter: (id) => changer([...ids, id]), dessiner }
}

// Date Grist avec une pastille si elle est échue (« Expirée ») ou arrive à échéance dans les 30 jours (« Bientôt »)
export function dateAvecAlerte(v) {
  const iso = depuisGrist(v)
  if (!iso) return '—'
  const jours = (new Date(iso) - new Date(new Date().toDateString())) / 86400000
  const alerte = jours < 0 ? ['badge-ouvert', 'Expirée'] : jours <= 30 ? ['badge-en_cours', 'Bientôt'] : null
  return [enFrancais(iso), alerte && h('span', { className: `badge ${alerte[0]}` }, alerte[1])]
}

// Zone d'import d'un fichier (clic ou glisser-déposer) ; `onChoix(fichier)` reçoit le fichier choisi.
// `deja` : un fichier est déjà enregistré ; `lien` : adresse pour l'ouvrir
export function zoneFichier(onChoix, { deja = false, lien = null, accept = '.pdf,.doc,.docx,.odt,image/*' } = {}) {
  const nom = h('span', { className: 'sous-texte' }, deja ? 'Un fichier est déjà enregistré ; en choisir un autre le remplace.' : 'Ou glissez et déposez votre fichier ici')
  const choisir = (f) => { if (f) { onChoix(f); nom.textContent = f.name } }
  const entree = h('input', { type: 'file', hidden: true, accept, onChange: (e) => choisir(e.target.files?.[0]) })
  const zone = h('label', { className: 'zone-fichier',
    onDragover: (e) => { e.preventDefault(); zone.classList.add('survol') },
    onDragleave: () => zone.classList.remove('survol'),
    onDrop: (e) => { e.preventDefault(); zone.classList.remove('survol'); choisir(e.dataTransfer.files?.[0]) } },
  h('span', { className: 'bouton bouton-compact' }, 'Importer un fichier'), nom, entree)
  return lien ? h('div', { className: 'zone-avec-lien' }, zone, h('a', { href: lien, target: '_blank', rel: 'noreferrer' }, 'Voir le fichier enregistré')) : zone
}

// Secondes Grist → valeur d'un champ « datetime-local » (AAAA-MM-JJTHH:MM, heure locale)
export const versSaisie = (v) => {
  if (!v) return ''
  const dt = new Date(v * 1000)
  const z = (n) => String(n).padStart(2, '0')
  return `${dt.getFullYear()}-${z(dt.getMonth() + 1)}-${z(dt.getDate())}T${z(dt.getHours())}:${z(dt.getMinutes())}`
}

// Logo « baseo » (image du projet, fond transparent) ; l'assemblage remplace ce chemin par l'image intégrée
const LOGO_BASEO = 'img/logo-baseo.png'
export const logoBaseo = () => h('img', { className: 'logo-baseo', src: LOGO_BASEO, alt: 'baseo' })

// Galerie des photos d'une fiche (identifiants de pièces jointes Grist) ; chaque photo s'ouvre en grand dans un nouvel onglet.
// `lien(id)` : adresse temporaire d'une pièce jointe (null si indisponible)
export const galeriePhotos = (ids, lien) => (ids.length === 0 || !lien
  ? h('p', { className: 'sous-texte' }, ids.length ? 'Photos enregistrées (aperçu indisponible).' : 'Aucune photo.')
  : h('div', { className: 'galerie-photos' }, ids.map((id, n) =>
    h('a', { href: lien(id), target: '_blank', rel: 'noreferrer', title: 'Ouvrir la photo en grand' },
      h('img', { src: lien(id), alt: `Photo ${n + 1}`, loading: 'lazy' })))))

/**
 * Photos modifiables d'un formulaire : celles déjà enregistrées (✕ pour retirer) et de nouvelles, `max` au plus.
 * - `modifie()` : vrai si une photo a été retirée ou ajoutée (sinon inutile de réécrire les colonnes photo) ;
 * - `ids(envoyer)` envoie les nouvelles photos (réduites, en parallèle) avec `envoyer(blob)` et renvoie la liste finale.
 *   Une photo déjà envoyée ne l'est pas une seconde fois si l'enregistrement échoue puis est relancé.
 */
export function editeurPhotos({ ids = [], lien, max = Infinity }) {
  // Chaque élément a sa propre entrée : une même pièce jointe présente deux fois se retire une seule fois
  let gardees = ids.map((id) => ({ id }))
  let nouvelles = [] // { fichier, url (aperçu), id (après envoi) }
  let modifie = false
  const zone = h('div', { className: 'galerie-photos galerie-modifiable' })
  const texte = h('span')
  const ajout = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true, onChange: (e) => {
    const place = max - gardees.length - nouvelles.length
    nouvelles = [...nouvelles, ...[...e.target.files].slice(0, place).map((fichier) => ({ fichier, url: URL.createObjectURL(fichier) }))]
    e.target.value = ''
    modifie = true
    dessiner()
  } })
  const bouton = h('label', { className: 'bouton bouton-compact bouton-photo-ajout' }, texte, ajout)
  const vignette = (img, retirer) => h('span', { className: 'photo-modifiable' }, img,
    h('button', { type: 'button', className: 'etiquette-retirer', 'aria-label': 'Retirer cette photo', onClick: () => { retirer(); modifie = true; dessiner() } }, '✕'))
  function dessiner() {
    zone.replaceChildren(
      ...gardees.map((g) => vignette(lien ? h('img', { src: lien(g.id), alt: 'Photo enregistrée' }) : h('span', { className: 'sous-texte' }, 'Photo'),
        () => { gardees = gardees.filter((x) => x !== g) })),
      ...nouvelles.map((n) => vignette(h('img', { src: n.url, alt: 'Nouvelle photo' }),
        () => { URL.revokeObjectURL(n.url); nouvelles = nouvelles.filter((x) => x !== n) })))
    const total = gardees.length + nouvelles.length
    texte.textContent = `📷 Ajouter des photos${Number.isFinite(max) ? ` (${total}/${max})` : ''}`
    bouton.hidden = total >= max
  }
  dessiner()
  return {
    element: h('div', { className: 'champ-groupe' }, 'Photos', zone, bouton),
    modifie: () => modifie,
    async ids(envoyer) {
      await Promise.all(nouvelles.filter((n) => n.id == null).map(async (n) => { n.id = await envoyer(await reduirePhoto(n.fichier)) }))
      return [...gardees.map((g) => g.id), ...nouvelles.map((n) => n.id)]
    },
  }
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

// Recopie le titre de chaque colonne sur les cellules (data-label) : sur un écran étroit,
// le CSS affiche alors chaque ligne comme une fiche étiquetée
export function etiqueterLignes(tbody, titres) {
  for (const tr of tbody.rows)
    [...tr.cells].forEach((td, i) => { if (td.colSpan === 1) td.dataset.label = titres[i] ?? '' })
  return tbody
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
