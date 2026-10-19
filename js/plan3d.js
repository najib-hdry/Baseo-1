// Plan 3D du bâtiment en CSS 3D (même rendu que l'application) :
// étages empilés, vestiaires remplis selon leur occupation, pièces sans casiers en blocs bas.
import { h } from './outils.js'

const LARGEUR = 260
const PROFONDEUR = 170
const ECART = 90   // hauteur entre deux étages
const DALLE = 8    // épaisseur d'une dalle
const BLOC = 26    // hauteur d'un vestiaire
const PIECE = 12   // hauteur d'une pièce
const MARGE = 18

// Pavé : une face dessus + quatre côtés, posé à l'altitude z
function boite({ x = 0, y = 0, z = 0, l, p, hauteur, classe, style, onClick, contenu }) {
  const face = (cls, st) => h('div', { className: `p3-face ${cls}`, style: st })
  const coteY = { width: `${l}px`, height: `${hauteur}px`, transformOrigin: 'top', transform: 'rotateX(90deg)' }
  const coteX = { width: `${hauteur}px`, height: `${p}px`, transformOrigin: 'left', transform: 'rotateY(-90deg)' }
  const el = h('div', {
    className: `p3-boite ${classe}`,
    style: { left: `${x}px`, top: `${y}px`, width: `${l}px`, height: `${p}px`, transform: `translateZ(${z}px)`, ...style },
    onClick,
  },
  face('p3-cote-y', coteY),
  face('p3-cote-y', { ...coteY, top: `${p}px` }),
  face('p3-cote-x', coteX),
  face('p3-cote-x', { ...coteX, left: `${l}px` }),
  h('div', { className: 'p3-face p3-dessus', style: { width: `${l}px`, height: `${p}px`, transform: `translateZ(${hauteur}px)` } }, contenu))
  return el
}

// Répartit n éléments (vestiaires puis pièces) en grille sur la dalle
function disposition(n) {
  const colonnes = n <= 3 ? n : Math.ceil(Math.sqrt(n))
  const lignes = Math.ceil(n / colonnes)
  const l = (LARGEUR - 2 * MARGE - (colonnes - 1) * 12) / colonnes
  const p = Math.min(70, (PROFONDEUR - 2 * MARGE - (lignes - 1) * 12) / lignes)
  return (i) => ({ x: MARGE + (i % colonnes) * (l + 12), y: MARGE + Math.floor(i / colonnes) * (p + 12), l, p })
}

/**
 * etages : [{ id, Nom }] du plus bas au plus haut
 * vestiaires : [{ id, Nom, Etage, total, occupes }] ; pieces : [{ id, Nom, Type, Etage }]
 * vue : { rotation, inclinaison } conservé entre deux rendus
 */
export function plan3d({ etages, vestiaires, pieces, etageId, vestiaireId, onEtage, onVestiaire, vue }) {
  const n = etages.length
  const transformScene = () =>
    `rotateX(${vue.inclinaison}deg) rotateZ(${vue.rotation}deg) translateZ(${(-(n - 1) * ECART) / 2}px)`

  const scene = h('div', {
    className: 'p3-scene',
    style: { width: `${LARGEUR}px`, height: `${PROFONDEUR}px`, marginLeft: `${-LARGEUR / 2}px`, marginTop: `${-PROFONDEUR / 2}px`, transform: transformScene() },
  },
  etages.map((etage, i) => {
    const siens = vestiaires.filter((v) => v.Etage === etage.id)
    const autres = pieces.filter((p) => p.Etage === etage.id)
    const place = disposition(siens.length + autres.length || 1)
    const classes = ['p3-etage', etage.id === etageId && 'actif'].filter(Boolean).join(' ')
    return h('div', { className: classes, style: { transform: `translateZ(${i * ECART}px)` } },
      boite({ l: LARGEUR, p: PROFONDEUR, hauteur: DALLE, classe: 'p3-dalle', onClick: () => onEtage(etage),
        contenu: h('span', { className: 'p3-nom-etage' }, etage.Nom) }),
      siens.map((v, j) => {
        const taux = v.total ? Math.round((100 * v.occupes) / v.total) : 0
        const classe = ['p3-vestiaire', v.id === vestiaireId && 'choisi', taux >= 100 && 'plein'].filter(Boolean).join(' ')
        return boite({ ...place(j), z: DALLE, hauteur: BLOC, classe, style: { '--taux': `${taux}%` },
          onClick: (e) => { e.stopPropagation(); onVestiaire(v) },
          contenu: h('span', { className: 'p3-nom-vestiaire' }, v.Nom) })
      }),
      autres.map((p, j) => boite({ ...place(siens.length + j), z: DALLE, hauteur: PIECE, classe: `p3-piece p3-piece-${p.Type}`,
        onClick: () => onEtage(etage), contenu: h('span', { className: 'p3-nom-piece' }, p.Nom) })))
  }))

  // Rotation par glissement (horizontal) et inclinaison à la souris (vertical)
  let glisse = null
  const conteneur = h('div', {
    className: 'plan3d',
    style: { height: `${200 + PROFONDEUR * 0.57 + (n - 1) * ECART * 0.82}px` },
    'aria-hidden': 'true',
    onPointerdown: (e) => { glisse = { x: e.clientX, y: e.clientY, bouge: false } },
    onPointermove: (e) => {
      if (!glisse) return
      const dx = e.clientX - glisse.x, dy = e.clientY - glisse.y
      if (!glisse.bouge && Math.hypot(dx, dy) < 5) return
      glisse.bouge = true
      glisse.x = e.clientX
      glisse.y = e.clientY
      vue.rotation += dx * 0.5
      if (e.pointerType === 'mouse') vue.inclinaison = Math.min(75, Math.max(30, vue.inclinaison - dy * 0.3))
      scene.style.transform = transformScene()
    },
    onPointerup: () => setTimeout(() => { glisse = null }, 0),
    onPointerleave: () => setTimeout(() => { glisse = null }, 0),
  }, scene)
  // un glissement ne doit pas sélectionner d'étage
  conteneur.addEventListener('click', (e) => { if (glisse?.bouge) e.stopPropagation() }, true)
  return conteneur
}
