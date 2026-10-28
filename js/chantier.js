// Fiche détail d'un chantier (page admin), en onglets :
// Composants (structure), Informations, Salariés sur le chantier, Casiers (occupation), Incidents, Nettoyage, Maintenance, Postes.
import { h, depuisGrist, enFrancais, dateHeure, euros, etiqueterLignes, lienContact } from './outils.js'
import { idsDeListe, libelleHoraires, nomContact, equipeDuChantier, partenairesDuChantier, PARTENAIRES, ROLE_CHEF, ROLE_SALARIE } from './donnees.js'
import { zonesDuChantier, basesVisibles, libelleLieu, lieuRapport } from './navigation.js'
import { NETTOYAGE, MAINTENANCE } from './rapports.js'
import { plan3d } from './plan3d.js'

export const ONGLETS_FICHE = [
  ['composants', 'Composants'],
  ['informations', 'Informations'],
  ['equipe', 'Salariés sur le chantier'],
  ['entreprises', 'Entreprises'],
  ['sous_traitants', 'Sous-traitants'],
  ['casiers', 'Casiers'],
  ['incidents', 'Incidents'],
  ['nettoyage', 'Nettoyage'],
  ['maintenance', 'Maintenance'],
  ['postes', 'Postes'],
]

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

// ---- Onglet Composants : plan 3D, puis zones → bases vie → étages → vestiaires et pièces ----

// Plan 3D d'une base vie du chantier (un onglet par base vie qui a des étages) : glisser pour tourner ;
// un clic sur un étage ou un vestiaire le met en avant et affiche son occupation sous le plan
function plan3dDuChantier(d, c) {
  const plusieursZones = zonesDuChantier(d, c.id).length > 1
  const nomBase = (b) => [plusieursZones && d.parId.Zones.get(b.Zone)?.Nom, b.Nom].filter(Boolean).join(' · ')
  const bases = d.Bases_vie.filter((b) => b.Chantier === c.id && d.Etages.some((e) => e.Base_vie === b.id))
    .sort((a, b) => nomBase(a).localeCompare(nomBase(b)))
  if (bases.length === 0) return null
  const etat = { baseId: bases[0].id, etageId: null, vestiaireId: null, vue: { rotation: -35, inclinaison: 55 } }
  const zone = h('section', { className: 'plan3d-fiche' })
  const resumeOccupation = (o) => `${pluriel(o.total, 'casier')} · ${o.occupes} occupés · ${o.libres} libres${o.hs ? ` · ${o.hs} HS` : ''}`

  const dessiner = () => {
    const etages = d.Etages.filter((e) => e.Base_vie === etat.baseId)
    const idsEtages = new Set(etages.map((e) => e.id))
    const vestiaires = d.Vestiaires.filter((v) => idsEtages.has(v.Etage))
      .map((v) => ({ ...v, ...occupation(d, d.Casiers.filter((k) => k.Vestiaire === v.id)) }))
    const vestiaire = vestiaires.find((v) => v.id === etat.vestiaireId)
    const etage = d.parId.Etages.get(etat.etageId)
    const info = vestiaire ? `Vestiaire ${vestiaire.Nom} · ${d.parId.Etages.get(vestiaire.Etage)?.Nom ?? ''} : ${resumeOccupation(vestiaire)}`
      : etage ? `Étage ${etage.Nom} : ${pluriel(vestiaires.filter((v) => v.Etage === etage.id).length, 'vestiaire')} · `
        + resumeOccupation(occupation(d, d.Casiers.filter((k) => vestiaires.some((v) => v.Etage === etage.id && v.id === k.Vestiaire))))
        : 'Glisse pour tourner · clique sur un étage ou un vestiaire'
    zone.replaceChildren(...[
      h('h3', null, 'Plan 3D'),
      bases.length > 1 && h('div', { className: 'onglets onglets-statut', role: 'tablist', 'aria-label': 'Bases vie' },
        bases.map((b) => h('button', { className: 'onglet', role: 'tab', 'aria-selected': String(b.id === etat.baseId),
          onClick: () => { etat.baseId = b.id; etat.etageId = null; etat.vestiaireId = null; dessiner() } }, nomBase(b)))),
      plan3d({ etages, vestiaires, pieces: d.Pieces, etageId: etat.etageId, vestiaireId: etat.vestiaireId, vue: etat.vue,
        onEtage: (e) => { etat.etageId = e.id; etat.vestiaireId = null; dessiner() },
        onVestiaire: (v) => { etat.etageId = v.Etage; etat.vestiaireId = v.id; dessiner() } }),
      h('p', { className: 'plan3d-aide' }, info),
    ].filter(Boolean))
  }
  dessiner()
  return zone
}

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
    plan3dDuChantier(d, c),
    h('p', { className: 'structure-resume' }, [
      zones.length > 0 && pluriel(zones.length, 'zone'),
      `${nb.bases} base${nb.bases > 1 ? 's' : ''} vie`,
      pluriel(nb.etages, 'étage'), pluriel(nb.vestiaires, 'vestiaire'), pluriel(nb.casiers, 'casier'), `${nb.pieces} pièce${nb.pieces > 1 ? 's' : ''}`,
    ].filter(Boolean).join(' · ')),
    h('div', { className: 'structure' }, blocs),
  ]
}

// ---- Onglet Informations ----

function informations(d, c) {
  const date = (v) => enFrancais(depuisGrist(v)) || '—'
  const oui = (v) => (v ? 'Oui' : 'Non')
  // Contacts : nom, fonction, téléphone et e-mail cliquables
  const contacts = idsDeListe(c.Contacts).map((id) => d.parId.Contacts.get(id)).filter(Boolean)
  const lignes = [
    ['Contacts', contacts.length === 0 ? '—' : h('ul', { className: 'contacts-chantier' }, contacts.map((k) => h('li', null,
      h('strong', null, nomContact(k) || 'Sans nom'), k.Fonction && ` · ${k.Fonction}`,
      k.Telephone && [' · ', lienContact('tel', k.Telephone)], k.Email && [' · ', lienContact('mailto', k.Email)])))],
    ['Adresse', c.Adresse || '—'],
    ['Statut', c.Statut || 'Sans statut'],
    ['Visible dans l’application', c.Actif ? 'Oui' : 'Non (masqué)'],
    ['Date de contrat', date(c.Date_contrat)],
    ['Date de fin', date(c.Date_fin)],
    ['Samedi travaillé', oui(c.Samedi_travaille)],
    ['Dimanche travaillé', oui(c.Dimanche_travaille)],
    ['Prix du casier', c.Prix_casier != null && c.Prix_casier !== '' ? euros.format(c.Prix_casier) : '—'],
  ]
  return h('dl', { className: 'fiche-infos' }, lignes.map(([terme, valeur]) => [h('dt', null, terme), h('dd', null, valeur)]))
}

// ---- Onglet Salariés sur le chantier : chefs d'équipe, salariés, puis les autres rôles affectés ----

function equipe(d, c) {
  if (d.absentes.has('Utilisateurs')) return h('p', { className: 'message' }, 'Ce document n’a pas de table Utilisateurs.')
  const ordre = (u) => [ROLE_CHEF, ROLE_SALARIE].indexOf(u.Profil) + 1 || 3
  const membres = equipeDuChantier(d, c.id).sort((a, b) => ordre(a) - ordre(b) || nomContact(a).localeCompare(nomContact(b)))
  const nb = (role) => membres.filter((u) => u.Profil === role).length
  return [
    h('p', { className: 'structure-resume' }, `${pluriel(nb(ROLE_CHEF), 'chef')} d’équipe · ${pluriel(nb(ROLE_SALARIE), 'salarié')}`
      + (membres.length > nb(ROLE_CHEF) + nb(ROLE_SALARIE) ? ` · ${membres.length - nb(ROLE_CHEF) - nb(ROLE_SALARIE)} autre(s)` : '')),
    tableau(['Nom', 'Rôle', 'Téléphone', 'Email', 'Actif'],
      membres.map((u) => [h('strong', null, nomContact(u) || u.Email || 'Sans nom'), u.Profil || '—',
        lienContact('tel', u.Telephone) || '—', lienContact('mailto', u.Email) || '—', u.Actif ? 'Oui' : 'Non']),
      'Personne n’est encore affecté à ce chantier. Utilise « Gérer les salariés ».'),
  ]
}

// ---- Onglets Entreprises et Sous-traitants : lignes de la table de liaison (occupants et casiers occupés calculés par Grist) ----

function partenaires(d, c, p) {
  if (d.absentes.has(p.table)) return h('p', { className: 'message' }, `Ce document n’a pas de table ${p.table.replace('_', '+')}.`)
  const lignes = partenairesDuChantier(d, p, c.id).map((l) => ({ ...l, x: d.parId[p.cible]?.get(l[p.col]) }))
    .filter((l) => l.x).sort((a, b) => String(a.x.Nom).localeCompare(String(b.x.Nom)))
  // Partenaires qui occupent des casiers du chantier sans y être attribués
  const occupants = d.Casiers.filter((k) => k.Chantier === c.id).map((k) => d.activeParCasier.get(k.id))
    .filter(Boolean).map((a) => d.parId.Intervenants.get(a.Intervenant)?.[p.occupant]).filter(Boolean)
  const nonAttribues = [...new Set(occupants)].filter((id) => !lignes.some((l) => l[p.col] === id))
    .map((id) => d.parId[p.cible]?.get(id)?.Nom).filter(Boolean).sort()
  const sousTraitants = p.cle === 'sous_traitants' // un sous-traitant appartient à une entreprise
  const titreNom = p.nom[0].toUpperCase() + p.nom.slice(1)
  return [
    h('p', { className: 'structure-resume' }, `${pluriel(lignes.length, p.nom)} ${p.attribue}${lignes.length > 1 ? 's' : ''}`),
    tableau([titreNom, ...(sousTraitants ? ['Entreprise'] : []), 'Responsable', 'Téléphone', 'Email', 'Occupants', 'Casiers occupés'],
      lignes.map(({ x, Nb_occupants, Nb_casiers_occupes }) => [h('strong', null, x.Nom || 'Sans nom'),
        ...(sousTraitants ? [d.parId.Entreprises?.get(x.Entreprise)?.Nom || '—'] : []),
        [x.Responsable_prenom, x.Responsable_nom].filter(Boolean).join(' ') || '—',
        lienContact('tel', x.Telephone) || '—', lienContact('mailto', x.Email) || '—', Nb_occupants ?? 0, Nb_casiers_occupes ?? 0]),
      `${p.aucun} n’est encore ${p.attribue} à ce chantier. Utilise « Gérer les ${p.titre.toLowerCase()} ».`),
    nonAttribues.length > 0 && h('p', { className: 'sous-texte' },
      `Occupent aussi des casiers sans être ${p.attribue}s : ${nonAttribues.join(', ')}.`),
  ].filter(Boolean)
}

// ---- Onglet Casiers : occupation globale, graphiques (chantier, bases vie, étages), puis par vestiaire ----

const PARTS = [['occupes', 'Occupés'], ['libres', 'Libres'], ['hs', 'HS']]
const taux = (o) => (o.total ? `${Math.round((100 * o.occupes) / o.total)} %` : '—')
const legende = () => h('div', { className: 'graph-legende' },
  PARTS.map(([type, libelle]) => h('span', null, h('i', { className: `graph-pastille graph-${type}` }), libelle)))

// Anneau d'occupation du chantier (les valeurs injectées dans le SVG ne sont que des nombres)
function anneau(o) {
  const r = 42
  const tour = 2 * Math.PI * r
  let deja = 0
  const arcs = PARTS.map(([type]) => [type, o[type]]).filter(([, n]) => n > 0).map(([type, n]) => {
    const long = (tour * n) / o.total
    const arc = `<circle cx="60" cy="60" r="${r}" class="graph-arc graph-${type}" stroke-dasharray="${long} ${tour - long}" stroke-dashoffset="${-deja}"/>`
    deja += long
    return arc
  }).join('')
  const dessin = h('span', { className: 'anneau-dessin' })
  dessin.innerHTML = `<svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="${r}" class="graph-arc graph-vide"/>`
    + `<g transform="rotate(-90 60 60)">${arcs}</g></svg>`
  return h('div', { className: 'anneau' }, dessin,
    h('div', null,
      h('strong', { className: 'anneau-taux' }, taux(o)), h('span', { className: 'sous-texte' }, ' occupés'),
      h('p', { className: 'sous-texte' }, `${pluriel(o.total, 'casier')} · ${o.occupes} occupés · ${o.libres} libres · ${o.hs} HS`)))
}

// Barres empilées ; longueur proportionnelle au nombre de casiers (comparables entre elles)
function barres(titre, lignes, vide) {
  const max = Math.max(0, ...lignes.map(([, o]) => o.total))
  return h('section', { className: 'graph' }, h('h3', null, titre), legende(),
    lignes.length === 0 ? h('p', { className: 'sous-texte' }, vide) : lignes.map(([libelle, o]) => h('div', { className: 'graph-ligne' },
      h('span', { className: 'graph-libelle', title: libelle }, libelle),
      h('div', { className: 'graph-piste' },
        h('div', { className: 'graph-barre', style: { width: `${max ? (100 * o.total) / max : 0}%` },
          title: `${o.occupes} occupés · ${o.libres} libres · ${o.hs} HS` },
        PARTS.filter(([type]) => o[type] > 0).map(([type]) => h('span', { className: `graph-part graph-${type}`, style: { flexGrow: o[type] } })))),
      h('span', { className: 'graph-valeur' }, `${o.occupes}/${o.total} · ${taux(o)}`))))
}

function casiers(d, c) {
  const vestiaires = d.Vestiaires.filter((v) => v.Chantier === c.id)
  const casiersDuChantier = d.Casiers.filter((k) => k.Chantier === c.id)
  const global = occupation(d, casiersDuChantier)
  const lieu = (v) => {
    const e = d.parId.Etages.get(v.Etage)
    return [d.parId.Bases_vie.get(e?.Base_vie)?.Nom, e?.Nom].filter(Boolean).join(' · ')
  }

  // Casiers regroupés par étage, puis par base vie
  const etageDe = (k) => d.parId.Vestiaires.get(k.Vestiaire)?.Etage
  const parEtage = new Map()
  for (const k of casiersDuChantier) parEtage.set(etageDe(k), [...(parEtage.get(etageDe(k)) ?? []), k])
  const plusieursZones = zonesDuChantier(d, c.id).length > 1
  const nomBase = (b) => [plusieursZones && d.parId.Zones.get(b.Zone)?.Nom, b.Nom].filter(Boolean).join(' · ')
  const bases = d.Bases_vie.filter((b) => b.Chantier === c.id).sort((a, b) => nomBase(a).localeCompare(nomBase(b)))
  const etagesDe = (b) => d.Etages.filter((e) => e.Base_vie === b.id).sort((x, y) => (y.Niveau ?? 0) - (x.Niveau ?? 0))
  const lignesBases = bases.map((b) => [nomBase(b), occupation(d, etagesDe(b).flatMap((e) => parEtage.get(e.id) ?? []))])
  const lignesEtages = bases.flatMap((b) => etagesDe(b).filter((e) => parEtage.has(e.id))
    .map((e) => [`${nomBase(b)} · ${e.Nom}`, occupation(d, parEtage.get(e.id))]))

  return [
    h('div', { className: 'stats' },
      [['total', global.total, 'Total'], ['libres', global.libres, 'Libres'], ['occupes', global.occupes, 'Occupés'], ['hs', global.hs, 'HS']]
        .map(([type, valeur, libelle]) => h('div', { className: `stat stat-${type}${valeur === 0 ? ' stat-nul' : ''}` },
          h('span', { className: 'stat-valeur' }, valeur), h('span', { className: 'stat-libelle' }, libelle)))),
    h('div', { className: 'graphiques' },
      h('section', { className: 'graph' }, h('h3', null, 'Chantier'), legende(), anneau(global)),
      barres('Par base vie', lignesBases, 'Aucune base vie.'),
      h('div', { className: 'graph-large' }, barres('Par étage', lignesEtages, 'Aucun étage avec des casiers.'))),
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
  const [controle, ecart] = NETTOYAGE.choix[0].valeurs // mêmes valeurs que le formulaire
  return [
    resume(liste, [['contrôles', (r) => r.Type_action === controle], ['écarts déclarés', (r) => r.Type_action === ecart],
      ['fiches incomplètes', (r) => !r.Fiche_passage_complete]]),
    tableau(['Date', 'Horaire', 'Type d’action', 'Lieu', 'Fiche', 'Commentaire'],
      liste.map((r) => [enFrancais(depuisGrist(r.Date)) || '—', r.Horaire_passage ?? '', r.Type_action ?? '', lieuRapport(d, c.id, r), fiche(r), r.Commentaire ?? '']),
      'Aucun contrôle nettoyage sur ce chantier.'),
  ]
}

function maintenance(d, c) {
  const liste = d.Maintenance.filter((r) => r.Chantier === c.id).sort(plusRecent('Date'))
  const [entretien] = MAINTENANCE.choix[0].valeurs // « Maintenance » ; les autres actions sont des aménagements
  return [
    resume(liste, [['maintenances', (r) => r.Action === entretien], ['aménagements et installations', (r) => r.Action && r.Action !== entretien],
      ['fiches incomplètes', (r) => !r.Fiche_passage_complete]]),
    tableau(['Date', 'Action', 'Type', 'Lieu', 'Fiche', 'Commentaire'],
      liste.map((r) => [enFrancais(depuisGrist(r.Date)) || '—', r.Action ?? '', r.Type ?? '', lieuRapport(d, c.id, r), fiche(r), r.Commentaire ?? '']),
      'Aucune maintenance sur ce chantier.'),
  ]
}

// ---- Onglet Postes ----

function postes(d, c) {
  const liste = d.Postes.filter((p) => idsDeListe(p.Chantiers).includes(c.id))
    .sort((a, b) => (depuisGrist(a.Date_demarrage) ?? '9999').localeCompare(depuisGrist(b.Date_demarrage) ?? '9999'))
  return tableau(['Poste', 'Démarrage', 'Personnes', 'Horaires', 'Statut'],
    liste.map((p) => [h('strong', null, p.Titre || 'Sans titre'), enFrancais(depuisGrist(p.Date_demarrage)) || '—', p.Nb_personnes ?? '',
      libelleHoraires(p), p.Statut ?? '']),
    'Aucun poste sur ce chantier.')
}

// Contenu de l'onglet `onglet` de la fiche du chantier `c`
export function contenuFiche(d, c, onglet) {
  if (onglet === 'informations') return informations(d, c)
  if (onglet === 'equipe') return equipe(d, c)
  if (onglet === 'entreprises') return partenaires(d, c, PARTENAIRES.entreprises)
  if (onglet === 'sous_traitants') return partenaires(d, c, PARTENAIRES.sous_traitants)
  if (onglet === 'casiers') return casiers(d, c)
  if (onglet === 'incidents') return incidents(d, c)
  if (onglet === 'nettoyage') return nettoyage(d, c)
  if (onglet === 'maintenance') return maintenance(d, c)
  if (onglet === 'postes') return postes(d, c)
  return composants(d, c)
}
