// Navigation commune aux deux widgets : cartes de chantier, puis
// zone → base vie → plan 3D → étage → pièces → vestiaire → grille de casiers
import { h, icone, onglets } from './outils.js'
import { plan3d } from './plan3d.js'
import { detailCasier } from './donnees.js'

// Sélection initiale d'une base vie : son étage le plus bas qui a un vestiaire
export function selectionPourBase(d, baseId) {
  const etagesBase = d.Etages.filter((e) => e.Base_vie === baseId)
  const premier = d.Vestiaires.find((v) => etagesBase.some((e) => e.id === v.Etage))
  return { baseId, etageId: premier?.Etage ?? etagesBase[0]?.id ?? null, vestiaireId: premier?.id ?? null }
}

// Zones d'un chantier (aucune si le document n'a pas de table Zones)
export const zonesDuChantier = (d, chantierId) => d.Zones.filter((z) => z.Chantier === chantierId)

// Bases vie de la zone choisie, ou du chantier quand il n'a pas de zones
export function basesVisibles(d, { chantierId, zoneId }) {
  const bases = zonesDuChantier(d, chantierId).length > 0
    ? d.Bases_vie.filter((b) => b.Zone === zoneId)
    : d.Bases_vie.filter((b) => b.Chantier === chantierId)
  return bases.sort((a, b) => String(a.Nom).localeCompare(String(b.Nom)))
}

// Sélection initiale d'une zone : sa première base vie
function selectionPourZone(d, chantierId, zoneId) {
  const base = basesVisibles(d, { chantierId, zoneId })[0]
  return { chantierId, zoneId, ...selectionPourBase(d, base?.id ?? null) }
}

// Sélection initiale d'un chantier : sa première zone, puis sa première base vie
export const selectionPourChantier = (d, chantierId) =>
  selectionPourZone(d, chantierId, zonesDuChantier(d, chantierId)[0]?.id ?? null)

// Accueil : une carte par chantier actif ; `stats(chantier)` donne les compteurs à afficher
export function cartesChantiers(d, { titre, stats, jauge, onOuvrir }) {
  const chantiers = d.Chantiers.filter((c) => c.Actif).sort((a, b) => String(a.Nom).localeCompare(String(b.Nom)))
  if (chantiers.length === 0) return [h('h1', null, titre), h('p', { className: 'message' }, 'Aucun chantier actif.')]
  return [
    h('h1', null, titre),
    h('ul', { className: 'cartes' }, chantiers.map((c) => {
      const compteurs = stats(c)
      const taux = jauge?.(c)
      return h('li', null, h('button', { className: 'carte-chantier', onClick: () => onOuvrir(c) },
        h('div', { className: 'carte-haut' },
          h('span', { className: 'carte-icone' }, icone('grue', 30)),
          h('div', { className: 'carte-titre' },
            h('h2', null, c.Nom),
            h('div', { className: 'sous-texte' }, c.Adresse || 'Adresse non renseignée')),
          h('span', { className: 'carte-fleche', 'aria-hidden': 'true' }, '›')),
        h('div', { className: compteurs.length === 3 ? 'stats stats-3' : 'stats' },
          compteurs.map((s) => h('div', { className: `stat stat-${s.type}${s.valeur === 0 ? ' stat-nul' : ''}` },
            icone(s.type), h('span', { className: 'stat-valeur' }, s.valeur), h('span', { className: 'stat-libelle' }, s.libelle)))),
        taux != null && h('div', { className: taux >= 1 ? 'jauge pleine' : 'jauge', title: `${Math.round(taux * 100)} % occupés` },
          h('span', { style: { width: `${taux * 100}%` } }))))
    })),
  ]
}

const FILTRES = [
  { cle: 'tous', libelle: 'Tous' },
  { cle: 'disponible', libelle: 'Libres' },
  { cle: 'occupe', libelle: 'Occupés' },
]
const detail = (c) =>
  c.statut === 'occupe' ? `${c.prenom?.[0] ?? ''}. ${c.nom}` : c.statut === 'disponible' ? 'Libre' : 'Hors service'

/**
 * Vue d'un chantier. `etat` : { chantierId, zoneId, baseId, etageId, vestiaireId, filtre, vue3d }
 * options : { mode, marques: { casiers: Set, pieces: Set }, onCasier, onVestiaire, onPiece, rafraichir }
 * mode 'lieux' : pas de casiers, on touche un vestiaire ou une pièce de l'étage (onVestiaire / onPiece)
 */
export function vueChantier(d, etat, { mode, marques, onCasier, onVestiaire, onPiece, rafraichir }) {
  const zones = zonesDuChantier(d, etat.chantierId)
  const bases = basesVisibles(d, etat)
  const etagesBase = d.Etages.filter((e) => e.Base_vie === etat.baseId)
  const vestiairesEtage = d.Vestiaires.filter((v) => v.Etage === etat.etageId)
  const piecesEtage = d.Pieces.filter((p) => p.Etage === etat.etageId)

  const choisirZone = (z) => { Object.assign(etat, selectionPourZone(d, etat.chantierId, z.id)); rafraichir() }
  const choisirBase = (b) => { Object.assign(etat, selectionPourBase(d, b.id)); rafraichir() }
  const choisirEtage = (e) => {
    etat.etageId = e.id
    etat.vestiaireId = d.Vestiaires.find((v) => v.Etage === e.id)?.id ?? null
    rafraichir()
  }
  const choisirVestiaire = (v) => { etat.etageId = v.Etage; etat.vestiaireId = v.id; rafraichir() }

  // Occupation de chaque vestiaire, pour le plan 3D
  const occupation = new Map()
  for (const c of d.Casiers) {
    const o = occupation.get(c.Vestiaire) ?? { total: 0, occupes: 0 }
    o.total++
    if (!c.Hors_service && d.activeParCasier.has(c.id)) o.occupes++
    occupation.set(c.Vestiaire, o)
  }
  const vestiairesPlan = d.Vestiaires.map((v) => ({ ...v, ...(occupation.get(v.id) ?? { total: 0, occupes: 0 }) }))

  const noeuds = [onglets('Zones', zones, etat.zoneId, choisirZone), onglets('Bases vie', bases, etat.baseId, choisirBase)]

  if (etagesBase.length > 0) {
    noeuds.push(
      plan3d({ etages: etagesBase, vestiaires: vestiairesPlan, pieces: d.Pieces, etageId: etat.etageId,
        vestiaireId: etat.vestiaireId, onEtage: choisirEtage, onVestiaire: choisirVestiaire, vue: etat.vue3d }),
      h('p', { className: 'plan3d-aide' }, 'Glisse pour tourner · touche un étage ou un vestiaire'),
      onglets('Étages', [...etagesBase].reverse(), etat.etageId, choisirEtage),
      mode !== 'lieux' && piecesEtage.length > 0 && h('ul', { className: 'pieces', 'aria-label': 'Autres pièces de l’étage' },
        piecesEtage.map((p) => h('li', { className: `piece piece-${p.Type}` },
          onPiece
            ? h('button', { className: 'piece-bouton', onClick: () => onPiece(p) }, p.Nom,
              marques?.pieces.has(p.id) && h('span', { className: 'pastille', 'aria-label': 'incident en cours' }, '!'))
            : p.Nom))))
  }

  if (bases.length === 0) noeuds.push(h('p', { className: 'message' }, zones.length > 0 ? 'Cette zone n’a pas encore de base vie.' : 'Ce chantier n’a pas encore de base vie.'))
  else if (etagesBase.length === 0) noeuds.push(h('p', { className: 'message' }, 'Aucun étage dans cette base vie.'))
  else if (mode === 'lieux') {
    const bouton = (type, nom, onClick) => h('button', { className: 'lieu-bouton', onClick },
      h('span', { className: 'lieu-type' }, type), h('span', { className: 'lieu-nom' }, nom))
    noeuds.push(vestiairesEtage.length + piecesEtage.length === 0
      ? h('p', { className: 'message' }, 'Aucun vestiaire ni pièce à cet étage.')
      : h('div', { className: 'lieux' },
        vestiairesEtage.map((v) => bouton('Vestiaire', v.Nom, () => onVestiaire(v))),
        piecesEtage.map((p) => bouton('Pièce', p.Nom, () => onPiece(p)))))
  }
  else if (vestiairesEtage.length === 0) noeuds.push(h('p', { className: 'message' }, 'Aucun vestiaire à cet étage.'))
  else {
    const casiers = d.Casiers.filter((c) => c.Vestiaire === etat.vestiaireId).map((c) => detailCasier(d, c))
    const compte = (cle) => (cle === 'tous' ? casiers.length : casiers.filter((c) => c.statut === cle).length)
    const visibles = casiers.filter((c) => etat.filtre === 'tous' || c.statut === etat.filtre)
    noeuds.push(
      onglets('Vestiaires', vestiairesEtage, etat.vestiaireId, choisirVestiaire),
      h('div', { className: 'filtres' }, FILTRES.map((f) =>
        h('button', { className: 'filtre', 'aria-pressed': String(etat.filtre === f.cle), onClick: () => { etat.filtre = f.cle; rafraichir() } },
          `${f.libelle} ${compte(f.cle)}`))),
      visibles.length === 0
        ? h('p', { className: 'message' }, 'Aucun casier dans cette catégorie.')
        : h('div', { className: 'grille' }, visibles.map((c) =>
          h('button', { className: `casier casier-${c.statut}`, onClick: () => onCasier(c) },
            h('span', { className: 'casier-numero' }, c.Numero),
            h('span', { className: 'casier-detail' }, detail(c)),
            mode === 'incidents' && marques?.casiers.has(c.id) && h('span', { className: 'pastille', 'aria-label': 'incident en cours' }, '!')))))
  }
  return noeuds.filter(Boolean) // sans les onglets absents (null) ni les blocs conditionnels (false)
}

// Nom de la zone d'une base vie, seulement si son chantier a plusieurs zones
function nomZone(d, base) {
  const z = base && d.parId.Zones.get(base.Zone)
  return z && zonesDuChantier(d, z.Chantier).length > 1 ? z.Nom : null
}

// Libellé « Zone A · Base vie 1 · RDC · V-1 · Casier 012 » d'un casier ou d'une pièce
export function libelleLieu(d, { casier, piece, element }) {
  if (casier) {
    const v = d.parId.Vestiaires.get(casier.Vestiaire)
    const e = v && d.parId.Etages.get(v.Etage)
    const b = e && d.parId.Bases_vie.get(e.Base_vie)
    return [nomZone(d, b), b?.Nom, e?.Nom, v?.Nom, `Casier ${casier.Numero}`].filter(Boolean).join(' · ')
  }
  if (piece) {
    const e = d.parId.Etages.get(piece.Etage)
    const b = e && d.parId.Bases_vie.get(e.Base_vie)
    return [nomZone(d, b), b?.Nom, e?.Nom, element ? `${piece.Nom} — ${element}` : piece.Nom].filter(Boolean).join(' · ')
  }
  return 'Lieu supprimé'
}
