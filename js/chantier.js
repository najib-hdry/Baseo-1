// Fiche détail d'un chantier (page admin), en onglets :
// Composants (structure), Informations, Casiers (occupation), Incidents, Nettoyage, Maintenance, Postes.
import { h, depuisGrist, enFrancais, dateHeure, etiqueterLignes } from './outils.js'
import { idsDeListe } from './donnees.js'
import { zonesDuChantier, basesVisibles, libelleLieu } from './navigation.js'

export const ONGLETS_FICHE = [
  ['composants', 'Composants'],
  ['informations', 'Informations'],
  ['casiers', 'Casiers'],
  ['incidents', 'Incidents'],
  ['nettoyage', 'Nettoyage'],
  ['maintenance', 'Maintenance'],
  ['postes', 'Postes'],
]

const euros = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })
const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`

// Occupation d'une liste de casiers : total, occupés, hors service, libres
function occupation(d, casiers) {
  const hs = casiers.filter((c) => c.Hors_service).length
  const occupes = casiers.filter((c) => !c.Hors_service && d.activeParCasier.has(c.id)).length
  return { total: casiers.length, occupes, hs, libres: casiers.length - occupes - hs }
}

// Tableau simple : en-têtes + lignes (tableaux de cellules)
const tableau = (entetes, lignes, vide) => h('div', { className: 'tableau-defilant' },
  h('table', { className: 'tableau' },
    h('thead', null, h('tr', null, entetes.map((t) => h('th', null, t)))),
    etiqueterLignes(h('tbody', null, lignes.length === 0
      ? h('tr', null, h('td', { className: 'tableau-vide', colSpan: entetes.length }, vide))
      : lignes.map((cellules) => h('tr', null, cellules.map((c) => h('td', null, c))))), entetes)))

// ---- Onglet Composants : zones → bases vie → étages → vestiaires et pièces ----

function composants(d, c) {
  const zones = zonesDuChantier(d, c.id)
  // Sans zone, une zone fictive regroupe les bases vie rattachées directement au chantier
  const groupes = zones.length > 0 ? zones : [{ id: null, Nom: null }]
  const nb = { bases: 0, etages: 0, vestiaires: 0, casiers: 0, pieces: 0 }

  const blocEtage = (e) => {
    const vestiaires = d.Vestiaires.filter((v) => v.Etage === e.id)
    const pieces = d.Pieces.filter((p) => p.Etage === e.id)
    nb.etages++
    nb.vestiaires += vestiaires.length
    nb.pieces += pieces.length
    return h('div', { className: 'niveau niveau-etage' },
      h('div', { className: 'niveau-haut' }, h('span', { className: 'niveau-type' }, 'Étage'), h('strong', null, e.Nom), h('span', { className: 'sous-texte' }, `niveau ${e.Niveau ?? 0}`)),
      vestiaires.map((v) => {
        const o = occupation(d, d.Casiers.filter((k) => k.Vestiaire === v.id))
        nb.casiers += o.total
        return h('div', { className: 'ligne-element' },
          h('span', { className: 'niveau-type' }, 'Vestiaire'),
          h('span', { className: 'composant-nom' }, v.Nom),
          v.Type && h('span', { className: 'badge badge-termine' }, v.Type),
          h('span', { className: 'sous-texte' }, `${pluriel(o.total, 'casier')} · ${o.occupes} occupés · ${o.libres} libres${o.hs ? ` · ${o.hs} HS` : ''}`))
      }),
      pieces.length > 0 && h('div', { className: 'ligne-element' },
        h('span', { className: 'niveau-type' }, 'Pièces'),
        h('ul', { className: 'pieces' }, pieces.map((p) => h('li', { className: `piece piece-${p.Type}` }, p.Nom)))),
      vestiaires.length + pieces.length === 0 && h('p', { className: 'sous-texte' }, 'Étage vide.'))
  }

  const blocBase = (b) => {
    const etages = d.Etages.filter((e) => e.Base_vie === b.id)
    nb.bases++
    return h('div', { className: 'niveau niveau-base' },
      h('div', { className: 'niveau-haut' }, h('span', { className: 'niveau-type' }, 'Base vie'), h('strong', null, b.Nom)),
      etages.length > 0 ? etages.map(blocEtage) : h('p', { className: 'sous-texte' }, 'Aucun étage.'))
  }

  const blocs = groupes.map((z) => {
    const bases = basesVisibles(d, { chantierId: c.id, zoneId: z.id })
    const contenu = bases.length > 0 ? bases.map(blocBase) : h('p', { className: 'sous-texte' }, 'Aucune base vie.')
    return z.id == null ? h('div', { className: 'structure' }, contenu)
      : h('div', { className: 'niveau niveau-zone' },
        h('div', { className: 'niveau-haut' }, h('span', { className: 'niveau-type' }, 'Zone'), h('strong', null, z.Nom)),
        contenu)
  })

  // Le résumé se calcule pendant la construction des blocs ci-dessus
  return [
    h('p', { className: 'structure-resume' }, [
      zones.length > 0 && pluriel(zones.length, 'zone'),
      `${nb.bases} base${nb.bases > 1 ? 's' : ''} vie`,
      pluriel(nb.etages, 'étage'), pluriel(nb.vestiaires, 'vestiaire'), pluriel(nb.casiers, 'casier'), `${nb.pieces} pièce${nb.pieces > 1 ? 's' : ''}`,
    ].filter(Boolean).join(' · ')),
    h('div', { className: 'structure' }, blocs),
  ]
}

// ---- Onglet Informations ----

function informations(c) {
  const date = (v) => enFrancais(depuisGrist(v)) || '—'
  const oui = (v) => (v ? 'Oui' : 'Non')
  const lignes = [
    ['Adresse', c.Adresse || '—'],
    ['Statut', c.Statut || 'Sans statut'],
    ['Visible dans l’application', c.Actif ? 'Oui' : 'Non (masqué)'],
    ['Date de début', date(c.Date_debut)],
    ['Date de fin', date(c.Date_fin)],
    ['Date de contrat', date(c.Date_contrat)],
    ['Samedi travaillé', oui(c.Samedi_travaille)],
    ['Dimanche travaillé', oui(c.Dimanche_travaille)],
    ['Prix du casier', c.Prix_casier != null && c.Prix_casier !== '' ? euros.format(c.Prix_casier) : '—'],
  ]
  return h('dl', { className: 'fiche-infos' }, lignes.map(([terme, valeur]) => [h('dt', null, terme), h('dd', null, valeur)]))
}

// ---- Onglet Casiers : occupation globale puis par vestiaire ----

function casiers(d, c) {
  const vestiaires = d.Vestiaires.filter((v) => v.Chantier === c.id)
  const global = occupation(d, d.Casiers.filter((k) => k.Chantier === c.id))
  const lieu = (v) => {
    const e = d.parId.Etages.get(v.Etage)
    return [d.parId.Bases_vie.get(e?.Base_vie)?.Nom, e?.Nom].filter(Boolean).join(' · ')
  }
  return [
    h('div', { className: 'stats' },
      [['total', global.total, 'Total'], ['libres', global.libres, 'Libres'], ['occupes', global.occupes, 'Occupés'], ['hs', global.hs, 'HS']]
        .map(([type, valeur, libelle]) => h('div', { className: `stat stat-${type}${valeur === 0 ? ' stat-nul' : ''}` },
          h('span', { className: 'stat-valeur' }, valeur), h('span', { className: 'stat-libelle' }, libelle)))),
    tableau(['Vestiaire', 'Emplacement', 'Casiers', 'Occupés', 'Libres', 'HS', 'Taux'],
      vestiaires.map((v) => {
        const o = occupation(d, d.Casiers.filter((k) => k.Vestiaire === v.id))
        return [h('strong', null, v.Nom), lieu(v), o.total, o.occupes, o.libres, o.hs, o.total ? `${Math.round((100 * o.occupes) / o.total)} %` : '—']
      }),
      'Aucun vestiaire.'),
  ]
}

// ---- Onglets Incidents, Nettoyage, Maintenance : résumé puis enregistrements, du plus récent au plus ancien ----

// « libellé : nombre » séparés par des points médians
const resume = (liste, criteres) => h('p', { className: 'structure-resume' },
  [`Total : ${liste.length}`, ...criteres.map(([libelle, garde]) => `${libelle} : ${liste.filter(garde).length}`)].join(' · '))

// Lieu d'un contrôle ou d'une maintenance (zone si le chantier en a plusieurs, base vie, étage, vestiaire ou pièce)
function lieuRapport(d, c, r) {
  const zone = zonesDuChantier(d, c.id).length > 1 ? d.parId.Zones.get(r.Zone)?.Nom : null
  const base = d.parId.Bases_vie.get(r.Base_vie)
  const etage = d.parId.Etages.get(r.Etage)
  const endroit = d.parId.Vestiaires.get(r.Vestiaire)?.Nom ?? d.parId.Pieces.get(r.Piece)?.Nom
  return [zone, base?.Nom ?? 'Toutes les bases vie', base && (etage?.Nom ?? 'Tous les étages'), endroit].filter(Boolean).join(' · ')
}

const plusRecent = (champ) => (a, b) => (depuisGrist(b[champ]) ?? '').localeCompare(depuisGrist(a[champ]) ?? '') || b.id - a.id
const fiche = (r) => h('span', { className: `badge ${r.Fiche_passage_complete ? 'badge-resolu' : 'badge-ouvert'}` }, r.Fiche_passage_complete ? 'Complète' : 'Incomplète')
const CLASSES_INCIDENT = { Ouvert: 'badge-ouvert', 'En cours': 'badge-en_cours', Résolu: 'badge-resolu' }

function incidents(d, c) {
  const liste = d.Incidents.filter((i) => i.Chantier === c.id).sort((a, b) => (b.Signale_le ?? 0) - (a.Signale_le ?? 0))
  return [
    resume(liste, [['ouverts', (i) => i.Statut === 'Ouvert'], ['en cours', (i) => i.Statut === 'En cours'], ['résolus', (i) => i.Statut === 'Résolu']]),
    tableau(['Signalé le', 'Lieu', 'Catégorie', 'Description', 'Statut'],
      liste.map((i) => [
        i.Signale_le ? dateHeure(i.Signale_le) : '—',
        libelleLieu(d, { casier: d.parId.Casiers.get(i.Casier), piece: d.parId.Pieces.get(i.Piece), element: i.Element }),
        i.Categorie ?? '', i.Description ?? '',
        h('span', { className: `badge ${CLASSES_INCIDENT[i.Statut] ?? 'badge-ouvert'}` }, i.Statut ?? 'Ouvert'),
      ]),
      'Aucun incident sur ce chantier.'),
  ]
}

function nettoyage(d, c) {
  const liste = d.Controles_nettoyage.filter((r) => r.Chantier === c.id).sort(plusRecent('Date'))
  return [
    resume(liste, [['contrôles', (r) => r.Type_action === 'Contrôle nettoyage'], ['écarts déclarés', (r) => r.Type_action === 'Déclarer écart de nettoyage'],
      ['fiches incomplètes', (r) => !r.Fiche_passage_complete]]),
    tableau(['Date', 'Horaire', 'Type d’action', 'Lieu', 'Fiche', 'Commentaire'],
      liste.map((r) => [enFrancais(depuisGrist(r.Date)) || '—', r.Horaire_passage ?? '', r.Type_action ?? '', lieuRapport(d, c, r), fiche(r), r.Commentaire ?? '']),
      'Aucun contrôle nettoyage sur ce chantier.'),
  ]
}

function maintenance(d, c) {
  const liste = d.Maintenance.filter((r) => r.Chantier === c.id).sort(plusRecent('Date'))
  return [
    resume(liste, [['maintenances', (r) => r.Action === 'Maintenance'], ['aménagements et installations', (r) => r.Action && r.Action !== 'Maintenance'],
      ['fiches incomplètes', (r) => !r.Fiche_passage_complete]]),
    tableau(['Date', 'Action', 'Type', 'Lieu', 'Fiche', 'Commentaire'],
      liste.map((r) => [enFrancais(depuisGrist(r.Date)) || '—', r.Action ?? '', r.Type ?? '', lieuRapport(d, c, r), fiche(r), r.Commentaire ?? '']),
      'Aucune maintenance sur ce chantier.'),
  ]
}

// ---- Onglet Postes ----

function postes(d, c) {
  const liste = d.Postes.filter((p) => idsDeListe(p.Chantiers).includes(c.id))
    .sort((a, b) => (depuisGrist(a.Date_demarrage) ?? '9999').localeCompare(depuisGrist(b.Date_demarrage) ?? '9999'))
  return tableau(['Poste', 'Démarrage', 'Personnes', 'Horaires', 'Statut'],
    liste.map((p) => [h('strong', null, p.Titre || 'Sans titre'), enFrancais(depuisGrist(p.Date_demarrage)) || '—', p.Nb_personnes ?? '',
      p.Horaires === 'Autre' ? p.Horaires_precision || 'Autre' : p.Horaires ?? '', p.Statut ?? '']),
    'Aucun poste sur ce chantier.')
}

// Contenu de l'onglet `onglet` de la fiche du chantier `c`
export function contenuFiche(d, c, onglet) {
  if (onglet === 'informations') return informations(c)
  if (onglet === 'casiers') return casiers(d, c)
  if (onglet === 'incidents') return incidents(d, c)
  if (onglet === 'nettoyage') return nettoyage(d, c)
  if (onglet === 'maintenance') return maintenance(d, c)
  if (onglet === 'postes') return postes(d, c)
  return composants(d, c)
}
