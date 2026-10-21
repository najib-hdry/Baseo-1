// Accès aux tables du document Grist « Casiers chantier »
/* global grist */
import { versGrist, depuisGrist } from './outils.js'

const TABLES = ['Chantiers', 'Zones', 'Bases_vie', 'Etages', 'Vestiaires', 'Pieces', 'Casiers',
  'Entreprises', 'Intervenants', 'Attributions', 'Incidents', 'Controles_nettoyage', 'Maintenance', 'Postes', 'Sous_traitants', 'Candidats', 'Nationalites', 'Utilisateurs', 'Entretiens', 'Documents']
const OPTIONNELLES = ['Zones', 'Controles_nettoyage', 'Maintenance', 'Postes', 'Sous_traitants', 'Candidats', 'Nationalites', 'Utilisateurs', 'Entretiens', 'Documents'] // absentes des documents plus anciens

// Table au format colonnes ({ id: [...], Nom: [...] }) → liste d'objets
function enLignes(table) {
  return table.id.map((_, i) => Object.fromEntries(Object.keys(table).map((col) => [col, table[col][i]])))
}

// Profil de la personne connectée : { profil: 'Admin' | 'Chef d’équipe' | 'Salarié' | 'RH' | 'CIP' | 'Client', nom }
// (colonne Utilisateurs.Profil, libellé « Rôle ») ou null si aucun accès.
// - Acces_complet n'est lisible que par les admins (règles d'accès).
// - Utilisateurs ne montre à chacun que sa propre ligne.
// - Document sans table Utilisateurs (plus ancien) : tout le monde garde l'accès complet.
async function lireProfil() {
  const admin = await grist.docApi.fetchTable('Acces_complet').then((t) => t.id.length > 0).catch(() => false)
  if (admin) return { profil: 'Admin', nom: null }
  let lignes
  try {
    lignes = enLignes(await grist.docApi.fetchTable('Utilisateurs'))
  } catch {
    return { profil: 'Admin', nom: null }
  }
  const moi = lignes.length === 1 && lignes[0].Actif ? lignes[0] : null
  return moi?.Profil ? { profil: moi.Profil, nom: [moi.Prenom, moi.Nom].filter(Boolean).join(' ') || null } : null
}

// Chef d'équipe et admin : hors service, suivi des incidents ; les autres rôles déclarent seulement
export const peutGerer = (d) => ['Admin', 'Chef d’équipe'].includes(d.moi?.profil)
// Pages et actions réservées au profil Admin (`d` peut être null avant le premier chargement)
export const estAdmin = (d) => d?.moi?.profil === 'Admin'

// Charge toutes les tables et prépare les index utiles aux écrans ; `moi` null = pas d'accès
export async function chargerTout() {
  const moi = await lireProfil()
  if (!moi) return { moi: null }
  const absentes = new Set()
  const brutes = await Promise.all(TABLES.map((t) => grist.docApi.fetchTable(t).catch((e) => {
    if (!OPTIONNELLES.includes(t)) throw e
    absentes.add(t)
    return { id: [] }
  })))
  const d = Object.fromEntries(TABLES.map((t, i) => [t, enLignes(brutes[i])]))
  d.absentes = absentes
  d.moi = moi

  d.parId = Object.fromEntries(TABLES.map((t) => [t, new Map(d[t].map((r) => [r.id, r]))]))
  d.Zones.sort((a, b) => String(a.Nom).localeCompare(String(b.Nom)))
  d.Etages.sort((a, b) => (a.Niveau ?? 0) - (b.Niveau ?? 0))
  d.Vestiaires.sort((a, b) => String(a.Nom).localeCompare(String(b.Nom)))
  d.Pieces.sort((a, b) => String(a.Nom).localeCompare(String(b.Nom)))
  d.Casiers.sort((a, b) => String(a.Numero).localeCompare(String(b.Numero), 'fr', { numeric: true }))

  // Attribution en cours (sans date de fin) par casier et par intervenant
  d.actives = d.Attributions.filter((a) => !a.Date_fin)
  d.activeParCasier = new Map(d.actives.map((a) => [a.Casier, a]))
  d.activeParIntervenant = new Map(d.actives.map((a) => [a.Intervenant, a]))
  return d
}

// Casier enrichi : statut, occupant, entreprise, date de début
export function detailCasier(d, c) {
  const a = d.activeParCasier.get(c.id)
  const i = a && d.parId.Intervenants.get(a.Intervenant)
  const statut = c.Hors_service ? 'hors_service' : a ? 'occupe' : 'disponible'
  return {
    ...c,
    statut,
    attributionId: a?.id ?? null,
    dateDebut: depuisGrist(a?.Date_debut),
    prenom: i?.Prenom ?? '',
    nom: i?.Nom ?? '',
    entreprise: (i && d.parId.Entreprises.get(i.Entreprise)?.Nom) || '',
    employeur: (i && d.parId.Sous_traitants.get(i.Employeur)?.Nom) || '',
    coffre: a?.Coffre ?? '',
    cle: a?.Numero_cle ?? '',
  }
}

// Dernière date de libération d'un casier (pour interdire les chevauchements)
export function derniereLiberation(d, casierId) {
  const fins = d.Attributions.filter((a) => a.Casier === casierId && a.Date_fin).map((a) => depuisGrist(a.Date_fin))
  return fins.sort().at(-1) ?? null
}

const action = (actions) => grist.docApi.applyUserActions(actions)

// Crée l'entreprise si besoin (nom identique sans tenir compte des majuscules), puis l'intervenant, puis l'attribution
export async function creerEtAttribuer(d, casierId, form, dateDebut) {
  if (d.activeParCasier.has(casierId)) throw new Error('Ce casier vient d’être attribué. Ferme la fenêtre pour voir le plan à jour.')
  // On crée toujours un nouvel intervenant ; un badge n'est refusé que si son titulaire occupe déjà un casier
  const badge = form.badge.trim()
  const titulaire = badge && d.Intervenants.find((i) =>
    (i.Badge ?? '').toLowerCase() === badge.toLowerCase() && d.activeParIntervenant.has(i.id))
  if (titulaire)
    throw new Error(`Ce badge appartient à ${titulaire.Prenom ?? ''} ${titulaire.Nom ?? ''}, qui occupe déjà un casier. Il faut d’abord libérer l’ancien.`)

  // Un seul envoi, appliqué en entier ou pas du tout : pas d'intervenant orphelin si l'attribution échoue.
  // Les nouvelles lignes reçoivent un identifiant choisi ici (le suivant du plus grand) pour pouvoir
  // y faire référence ; si quelqu'un l'a pris entre-temps, Grist refuse tout l'envoi.
  const actions = []
  let entrepriseId = null
  const nomEntreprise = form.entreprise.trim()
  if (nomEntreprise) {
    const existante = d.Entreprises.find((e) => (e.Nom ?? '').toLowerCase() === nomEntreprise.toLowerCase())
    entrepriseId = existante?.id ?? compteur(d, 'Entreprises')()
    if (!existante) actions.push(['AddRecord', 'Entreprises', entrepriseId, { Nom: nomEntreprise }])
  }
  const intervenantId = compteur(d, 'Intervenants')()
  actions.push(
    ['AddRecord', 'Intervenants', intervenantId, {
      Prenom: form.prenom.trim(), Nom: form.nom.trim(), Entreprise: entrepriseId, Badge: badge || null, Employeur: form.employeur || null,
    }],
    ['AddRecord', 'Attributions', null, {
      Casier: casierId, Intervenant: intervenantId, Date_debut: versGrist(dateDebut),
      Coffre: form.coffre, Numero_cle: form.coffre === 'Oui' ? form.cle.trim() : '',
    }])
  try {
    await action(actions)
  } catch {
    throw new Error('L’attribution n’a pas pu être enregistrée (données modifiées entre-temps ?). Réessaie dans un instant.')
  }
}

export const liberer = (attributionId, dateFin) =>
  action([['UpdateRecord', 'Attributions', attributionId, { Date_fin: versGrist(dateFin) }]])

export async function horsService(d, casierId, valeur) {
  if (valeur && d.activeParCasier.has(casierId)) throw new Error('Ce casier est occupé : libère-le avant de le signaler hors service.')
  await action([['UpdateRecord', 'Casiers', casierId, { Hors_service: valeur }]])
}

// ---- Incidents ----

export const CATEGORIES = ['Plomberie', 'Électricité', 'Serrure', 'Propreté', 'Sécurité', 'Autre']

// Envoie un fichier dans les pièces jointes du document ; renvoie son identifiant.
// `nom` : nom du fichier enregistré (une photo réduite est toujours un JPEG)
export async function envoyerPhoto(blob, nom = 'photo.jpg') {
  const { token, baseUrl } = await grist.docApi.getAccessToken({ readOnly: false })
  const formulaire = new FormData()
  formulaire.append('upload', blob, nom)
  const rep = await fetch(`${baseUrl}/attachments?auth=${token}`, {
    method: 'POST', body: formulaire, headers: { 'X-Requested-With': 'XMLHttpRequest' },
  })
  if (!rep.ok) throw new Error(`Le fichier « ${nom} » n’a pas pu être envoyé.`)
  return (await rep.json())[0]
}

// Candidat : nouvelle ligne (`candidatId` null) ou modification ; `champs` déjà au format Grist
export const enregistrerCandidat = (candidatId, champs) =>
  action([candidatId == null ? ['AddRecord', 'Candidats', null, champs] : ['UpdateRecord', 'Candidats', candidatId, champs]])

// Supprime le candidat avec ses documents (pièces d'identité, RIB…) et ses entretiens, en un seul envoi
export async function supprimerCandidat(d, candidatId) {
  const lies = (table) => d[table].filter((r) => r.Candidat === candidatId).map((r) => r.id)
  await action([
    ...['Documents', 'Entretiens'].map((t) => [t, lies(t)]).filter(([, ids]) => ids.length > 0).map(([t, ids]) => ['BulkRemoveRecord', t, ids]),
    ['RemoveRecord', 'Candidats', candidatId],
  ])
}

/**
 * Fiche d'embauche : met à jour le candidat (`champs` au format Grist) et ses documents en un seul envoi.
 * `documents` : { type: { Recto?: idPièceJointe, Verso?: idPièceJointe } } ; une ligne Documents par type et par candidat
 * (créée si besoin) ; seules les faces envoyées sont remplacées.
 */
export async function enregistrerEmbauche(d, candidatId, champs, documents) {
  const actions = [['UpdateRecord', 'Candidats', candidatId, champs]]
  for (const [type, faces] of Object.entries(documents)) {
    const valeurs = Object.fromEntries(Object.entries(faces).map(([face, id]) => [face, ['L', id]]))
    const existant = d.Documents.find((r) => r.Candidat === candidatId && r.Type_document === type)
    actions.push(existant
      ? ['UpdateRecord', 'Documents', existant.id, valeurs]
      : ['AddRecord', 'Documents', null, { Candidat: candidatId, Type_document: type, ...valeurs }])
  }
  await action(actions)
}

// Nouvel entretien d'un candidat ; « Créé le » est rempli par Grist (date et heure de création)
export const creerEntretien = (candidatId, texte) => action([['AddRecord', 'Entretiens', null, { Candidat: candidatId, Entretien: texte }]])

// Adresse temporaire pour afficher une pièce jointe
export async function lienPhotos() {
  const { token, baseUrl } = await grist.docApi.getAccessToken({ readOnly: true })
  return (id) => `${baseUrl}/attachments/${id}/download?auth=${token}`
}

export async function signaler({ casierId, pieceId, element, categorie, description, photoId }) {
  await action([['AddRecord', 'Incidents', null, {
    Casier: casierId ?? 0,
    Piece: pieceId ?? 0,
    Element: element || null,
    Categorie: categorie,
    Description: description,
    Statut: 'Ouvert',
    Photo: photoId ? ['L', photoId] : null,
  }]])
}

// ---- Gestion des chantiers (admin) ----

export const STATUTS_CHANTIER = ['Nouveau', 'À venir', 'En cours', 'Terminé']
export const TYPES_VESTIAIRE = ['hommes', 'femmes', 'mixte']
export const TYPES_PIECE = ['wc', 'sanitaire', 'cuisine', 'bureau', 'couloir', 'escalier', 'autre']

// Identifiants des nouvelles lignes, choisis d'avance pour relier les niveaux dans un seul envoi
function compteur(d, table) {
  let suivant = Math.max(0, ...d[table].map((r) => r.id)) + 1
  return () => suivant++
}

// Lignes [{ id, Col: v }] → BulkAddRecord avec les identifiants choisis (rien si la liste est vide)
function ajoutGroupe(table, liste) {
  if (liste.length === 0) return []
  const colonnes = Object.keys(liste[0]).filter((c) => c !== 'id')
  return [['BulkAddRecord', table, liste.map((l) => l.id), Object.fromEntries(colonnes.map((c) => [c, liste.map((l) => l[c])]))]]
}

// Colonnes `infos` (Nom, Adresse, Statut, Actif, dates ISO, jours travaillés, prix) au format Grist ;
// seules les colonnes présentes sont écrites
const infosVersGrist = (infos) => Object.fromEntries(Object.entries(infos).map(([col, v]) =>
  [col, col.startsWith('Date_') ? versGrist(v) : v]))

/**
 * Crée un chantier et toute sa structure en un seul envoi (tout ou rien).
 * structure : { zones: [{ nom, bases: [{ nom, etages: [{ nom, niveau, vestiaires: [{ nom, type, casiers }], pieces: [{ nom, type }] }] }] }] }
 * Sans table Zones, les bases vie de toutes les zones sont rattachées directement au chantier.
 */
export async function creerChantier(d, infos, structure) {
  const id = { Chantiers: compteur(d, 'Chantiers'), Zones: compteur(d, 'Zones'), Bases_vie: compteur(d, 'Bases_vie'),
    Etages: compteur(d, 'Etages'), Vestiaires: compteur(d, 'Vestiaires'), Casiers: compteur(d, 'Casiers'), Pieces: compteur(d, 'Pieces') }
  const lignes = { Zones: [], Bases_vie: [], Etages: [], Vestiaires: [], Casiers: [], Pieces: [] }
  const avecZones = !d.absentes.has('Zones')
  const chantierId = id.Chantiers()

  for (const z of structure.zones) {
    const zoneId = avecZones ? id.Zones() : null
    if (avecZones) lignes.Zones.push({ id: zoneId, Nom: z.nom.trim(), Chantier: chantierId })
    for (const b of z.bases) {
      const baseId = id.Bases_vie()
      lignes.Bases_vie.push({ id: baseId, Nom: b.nom.trim(), ...(avecZones ? { Zone: zoneId } : { Chantier: chantierId }) })
      for (const e of b.etages) {
        const etageId = id.Etages()
        lignes.Etages.push({ id: etageId, Base_vie: baseId, Nom: e.nom.trim(), Niveau: Number(e.niveau) || 0 })
        for (const v of e.vestiaires) {
          const vestiaireId = id.Vestiaires()
          lignes.Vestiaires.push({ id: vestiaireId, Etage: etageId, Nom: v.nom.trim(), Type: v.type })
          for (let n = 1; n <= Number(v.casiers); n++)
            lignes.Casiers.push({ id: id.Casiers(), Vestiaire: vestiaireId, Numero: String(n).padStart(3, '0'), Hors_service: false })
        }
        for (const p of e.pieces) lignes.Pieces.push({ id: id.Pieces(), Etage: etageId, Nom: p.nom.trim(), Type: p.type })
      }
    }
  }

  await action([
    ['AddRecord', 'Chantiers', chantierId, infosVersGrist(infos)],
    ...Object.entries(lignes).flatMap(([table, liste]) => ajoutGroupe(table, liste)),
  ])
}

// Structure existante d'un chantier, au format de l'éditeur ; chaque élément garde son `id`.
// Sans zone, une zone fictive (id null) regroupe les bases vie rattachées directement au chantier.
export function structureDuChantier(d, chantierId) {
  const parNom = (a, b) => String(a.Nom).localeCompare(String(b.Nom))
  const zones = d.Zones.filter((z) => z.Chantier === chantierId).sort(parNom)
  const basesDe = (zoneId) => (zoneId == null
    ? d.Bases_vie.filter((b) => b.Chantier === chantierId && !b.Zone)
    : d.Bases_vie.filter((b) => b.Zone === zoneId)).sort(parNom)
  const etage = (e) => ({
    id: e.id, nom: e.Nom ?? '', niveau: e.Niveau ?? 0,
    vestiaires: d.Vestiaires.filter((v) => v.Etage === e.id).map((v) => ({
      id: v.id, nom: v.Nom ?? '', type: v.Type || 'mixte', casiers: d.Casiers.filter((k) => k.Vestiaire === v.id).length })),
    pieces: d.Pieces.filter((p) => p.Etage === e.id).map((p) => ({ id: p.id, nom: p.Nom ?? '', type: p.Type || 'autre' })),
  })
  const base = (b) => ({ id: b.id, nom: b.Nom ?? '', etages: d.Etages.filter((e) => e.Base_vie === b.id).map(etage) })
  const groupes = zones.length > 0 ? zones : [{ id: null, Nom: 'Zone principale' }]
  return { zones: groupes.map((z) => ({ id: z.id, nom: z.Nom ?? '', bases: basesDe(z.id).map(base) })) }
}

/**
 * Enregistre la structure modifiée d'un chantier en un seul envoi (tout ou rien) :
 * renommages et types, nouveaux éléments, éléments retirés (avec leurs casiers),
 * nombre de casiers par vestiaire (ajout à la suite, retrait des derniers numéros).
 * `avant` : structure prise à l'ouverture de l'éditeur ; si elle a changé depuis (autre admin), rien n'est écrit.
 * Refuse de retirer un casier occupé ; si des lignes d'historique perdent leur lieu, demande `confirme`.
 */
export async function modifierStructure(d, chantierId, structure, { avant, confirme = false }) {
  if (JSON.stringify(structureDuChantier(d, chantierId)) !== JSON.stringify(avant))
    throw new Error('Les composants de ce chantier ont été modifiés entre-temps (par quelqu’un d’autre ?). Ferme cette fenêtre et rouvre-la pour repartir de la version à jour.')
  const id = { Zones: compteur(d, 'Zones'), Bases_vie: compteur(d, 'Bases_vie'), Etages: compteur(d, 'Etages'),
    Vestiaires: compteur(d, 'Vestiaires'), Casiers: compteur(d, 'Casiers'), Pieces: compteur(d, 'Pieces') }
  const avecZones = !d.absentes.has('Zones')
  const ajouts = { Zones: [], Bases_vie: [], Etages: [], Vestiaires: [], Casiers: [], Pieces: [] }
  const mises = [] // [table, id, champs]
  const gardes = { Zones: new Set(), Bases_vie: new Set(), Etages: new Set(), Vestiaires: new Set(), Pieces: new Set() }
  const casiersRetires = []
  const numero = (c) => parseInt(c.Numero, 10) || 0
  const occupe = (c) => d.activeParCasier.has(c.id)

  // Élément existant : mise à jour si un champ a changé ; nouvel élément : ajout avec un identifiant choisi
  const traiter = (table, el, champs) => {
    if (el.id != null) {
      gardes[table].add(el.id)
      const actuel = d.parId[table].get(el.id)
      const changes = Object.fromEntries(Object.entries(champs).filter(([col, v]) => (actuel?.[col] ?? '') !== v))
      if (Object.keys(changes).length > 0) mises.push([table, el.id, changes])
      return el.id
    }
    const nouvel = id[table]()
    ajouts[table].push({ id: nouvel, ...champs })
    return nouvel
  }

  for (const z of structure.zones) {
    // Avec la table Zones, une zone fictive (chantier sans zone) devient une vraie zone
    const zoneId = avecZones ? traiter('Zones', z, { Nom: z.nom.trim() || 'Zone principale', Chantier: chantierId }) : null
    for (const b of z.bases) {
      const baseId = traiter('Bases_vie', b, { Nom: b.nom.trim(), ...(zoneId != null ? { Zone: zoneId } : { Chantier: chantierId }) })
      for (const e of b.etages) {
        const etageId = traiter('Etages', e, { Nom: e.nom.trim(), Niveau: Number(e.niveau) || 0, Base_vie: baseId })
        for (const v of e.vestiaires) {
          const vestiaireId = traiter('Vestiaires', v, { Nom: v.nom.trim(), Type: v.type, Etage: etageId })
          // Nombre de casiers : ajout à la suite des numéros existants, ou retrait des derniers (s'ils sont libres)
          const existants = v.id != null ? d.Casiers.filter((k) => k.Vestiaire === v.id).sort((a, b) => numero(a) - numero(b)) : []
          const voulu = Number(v.casiers) || 0
          let suivant = Math.max(0, ...existants.map(numero)) + 1
          for (let n = existants.length; n < voulu; n++)
            ajouts.Casiers.push({ id: id.Casiers(), Vestiaire: vestiaireId, Numero: String(suivant++).padStart(3, '0'), Hors_service: false })
          casiersRetires.push(...existants.slice(voulu))
        }
        for (const p of e.pieces) traiter('Pieces', p, { Nom: p.nom.trim(), Type: p.type, Etage: etageId })
      }
    }
  }

  // Éléments présents avant et absents maintenant : retirés, avec les casiers des vestiaires retirés
  const anciens = { Zones: [], Bases_vie: [], Etages: [], Vestiaires: [], Pieces: [] }
  for (const z of avant.zones) {
    if (z.id != null) anciens.Zones.push(z.id)
    for (const b of z.bases) {
      anciens.Bases_vie.push(b.id)
      for (const e of b.etages) {
        anciens.Etages.push(e.id)
        anciens.Vestiaires.push(...e.vestiaires.map((v) => v.id))
        anciens.Pieces.push(...e.pieces.map((p) => p.id))
      }
    }
  }
  const retraits = Object.fromEntries(Object.entries(anciens).map(([t, ids]) => [t, ids.filter((i) => !gardes[t].has(i))]))
  casiersRetires.push(...d.Casiers.filter((k) => retraits.Vestiaires.includes(k.Vestiaire)))
  const occupes = casiersRetires.filter(occupe)
  if (occupes.length > 0)
    throw new Error(`Impossible : ${occupes.length} casier(s) à retirer sont occupés (${occupes.slice(0, 5).map((c) => c.Numero).join(', ')}…). Libère-les d’abord.`)

  // Historique qui perdrait son lieu : attributions passées, incidents, contrôles nettoyage, maintenances
  const dans = (ids) => { const s = new Set(ids); return (v) => s.has(v) }
  const [casier, piece, vestiaire, etage, base] = [casiersRetires.map((c) => c.id), retraits.Pieces, retraits.Vestiaires, retraits.Etages, retraits.Bases_vie].map(dans)
  const historique = d.Attributions.filter((a) => casier(a.Casier)).length
    + d.Incidents.filter((i) => casier(i.Casier) || piece(i.Piece)).length
    + [...d.Controles_nettoyage, ...d.Maintenance].filter((r) => vestiaire(r.Vestiaire) || piece(r.Piece) || etage(r.Etage) || base(r.Base_vie)).length
  if (historique > 0 && !confirme) {
    const err = new Error(`${historique} ligne(s) d’historique (attributions passées, incidents, contrôles, maintenances) concernent les éléments retirés : elles resteront dans Grist, mais sans lieu. Clique sur « Confirmer et enregistrer » pour continuer.`)
    err.historique = true
    throw err
  }

  const retrait = (table, ids) => (ids.length > 0 ? [['BulkRemoveRecord', table, ids]] : [])
  const actions = [
    ...Object.entries(ajouts).flatMap(([t, liste]) => ajoutGroupe(t, liste)),
    ...mises.map(([t, i, champs]) => ['UpdateRecord', t, i, champs]),
    ...retrait('Casiers', casiersRetires.map((c) => c.id)),
    ...retrait('Pieces', retraits.Pieces), ...retrait('Vestiaires', retraits.Vestiaires),
    ...retrait('Etages', retraits.Etages), ...retrait('Bases_vie', retraits.Bases_vie), ...retrait('Zones', retraits.Zones),
  ]
  if (actions.length > 0) await action(actions)
  return actions.length
}

export const modifierChantier = (chantierId, infos) => action([['UpdateRecord', 'Chantiers', chantierId, infosVersGrist(infos)]])

export const changerStatutChantier = (chantierId, statut) => action([['UpdateRecord', 'Chantiers', chantierId, { Statut: statut }]])

// Tout ce qui appartient à un chantier (pour l'annoncer avant suppression, puis le supprimer)
export function contenuChantier(d, chantierId) {
  const casiers = d.Casiers.filter((c) => c.Chantier === chantierId).map((c) => c.id)
  const dans = (table) => d[table].filter((r) => r.Chantier === chantierId).map((r) => r.id)
  return {
    Attributions: d.Attributions.filter((a) => casiers.includes(a.Casier)).map((a) => a.id),
    Incidents: dans('Incidents'),
    Controles_nettoyage: dans('Controles_nettoyage'),
    Maintenance: dans('Maintenance'),
    Casiers: casiers,
    Pieces: dans('Pieces'),
    Vestiaires: dans('Vestiaires'),
    Etages: dans('Etages'),
    Bases_vie: dans('Bases_vie'),
    Zones: dans('Zones'),
  }
}

// Supprime le chantier et tout son contenu en un seul envoi (annulable dans l'historique Grist)
export async function supprimerChantier(d, chantierId) {
  const contenu = contenuChantier(d, chantierId)
  await action([
    ...Object.entries(contenu).filter(([, ids]) => ids.length > 0).map(([table, ids]) => ['BulkRemoveRecord', table, ids]),
    ['RemoveRecord', 'Chantiers', chantierId],
  ])
}

// ---- Annuaires (admin) : entreprises, sous-traitants ----

// Fiche d'un annuaire : le nom est obligatoire et unique dans sa table (sans tenir compte des majuscules)
function verifierNom(d, table, nom, sauf) {
  if (!nom) throw new Error('Le nom est obligatoire.')
  if (d[table].some((r) => r.id !== sauf && (r.Nom ?? '').trim().toLowerCase() === nom.toLowerCase()))
    throw new Error(`« ${nom} » existe déjà.`)
}

// `ligneId` null : nouvelle fiche ; sinon modification
export async function enregistrerFiche(d, table, ligneId, champs) {
  verifierNom(d, table, champs.Nom, ligneId)
  await action([ligneId == null ? ['AddRecord', table, null, champs] : ['UpdateRecord', table, ligneId, champs]])
}

// Les lignes qui y font référence restent, sans cette référence (Grist la vide)
export const supprimerFiche = (table, ligneId) => action([['RemoveRecord', table, ligneId]])

// ---- Gestion des postes (admin) ----

export const STATUTS_POSTE = ['À venir', 'En cours', 'Archives']
const HORAIRES_AUTRE = 'Autre'
export const HORAIRES_POSTE = ['4', '5', '6', '7', HORAIRES_AUTRE]
// Horaires lisibles d'un poste : la précision quand le choix est « Autre » ; `vide` sans horaires
export const libelleHoraires = (p, vide = '') => (p.Horaires === HORAIRES_AUTRE ? p.Horaires_precision || HORAIRES_AUTRE : p.Horaires || vide)

// Liste de références Grist (['L', 1, 2]) ↔ tableau d'identifiants
export const idsDeListe = (v) => (Array.isArray(v) ? v.filter((x) => x !== 'L') : [])

// `champs` : Titre, Date_demarrage (ISO), Nb_personnes, Statut, Chantiers (ids), Mission, Horaires, Horaires_precision
const posteVersGrist = (champs) => ({
  ...champs,
  Date_demarrage: versGrist(champs.Date_demarrage),
  Chantiers: champs.Chantiers.length > 0 ? ['L', ...champs.Chantiers] : null,
  Horaires_precision: champs.Horaires === HORAIRES_AUTRE ? champs.Horaires_precision : '',
})

function verifierPoste(champs) {
  if (!champs.Titre) throw new Error('Le titre du poste est obligatoire.')
  if (champs.Nb_personnes != null && !(Number.isInteger(champs.Nb_personnes) && champs.Nb_personnes >= 0))
    throw new Error('Le nombre de personnes doit être un entier positif.')
  if (champs.Horaires === HORAIRES_AUTRE && !champs.Horaires_precision) throw new Error('Précise les horaires (choix « Autre »).')
}

export async function creerPoste(champs) {
  verifierPoste(champs)
  await action([['AddRecord', 'Postes', null, posteVersGrist(champs)]])
}

export async function modifierPoste(posteId, champs) {
  verifierPoste(champs)
  await action([['UpdateRecord', 'Postes', posteId, posteVersGrist(champs)]])
}

export const archiverPoste = (posteId) => action([['UpdateRecord', 'Postes', posteId, { Statut: 'Archives' }]])

export const supprimerPoste = (posteId) => action([['RemoveRecord', 'Postes', posteId]])

// ---- Contrôles nettoyage et maintenance ----

export const enregistrer = (table, champs) => action([['AddRecord', table, null, champs]])

export const changerStatut = (incidentId, statut, aujourdhuiIso) =>
  action([['UpdateRecord', 'Incidents', incidentId, {
    Statut: statut,
    Resolu_le: statut === 'Résolu' ? versGrist(aujourdhuiIso) : null,
  }]])
