// Accès aux tables du document Grist « Casiers chantier »
/* global grist */
import { versGrist, depuisGrist } from './outils.js'

const TABLES = ['Chantiers', 'Zones', 'Bases_vie', 'Etages', 'Vestiaires', 'Pieces', 'Casiers',
  'Entreprises', 'Intervenants', 'Attributions', 'Incidents', 'Controles_nettoyage', 'Maintenance', 'Postes']
const OPTIONNELLES = ['Zones', 'Controles_nettoyage', 'Maintenance', 'Postes'] // absentes des documents plus anciens

// Table au format colonnes ({ id: [...], Nom: [...] }) → liste d'objets
function enLignes(table) {
  return table.id.map((_, i) => Object.fromEntries(Object.keys(table).map((col) => [col, table[col][i]])))
}

// Profil de la personne connectée : { profil: 'Admin' | 'Chef d’équipe' | 'Salarié', nom } ou null si aucun accès.
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
  return moi?.Profil ? { profil: moi.Profil, nom: moi.Nom || null } : null
}

// Chef d'équipe et admin : hors service, suivi des incidents ; le salarié déclare seulement
export const peutGerer = (d) => d.moi?.profil !== 'Salarié'

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
  }
}

// Dernière date de libération d'un casier (pour interdire les chevauchements)
export function derniereLiberation(d, casierId) {
  const fins = d.Attributions.filter((a) => a.Casier === casierId && a.Date_fin).map((a) => depuisGrist(a.Date_fin))
  return fins.sort().at(-1) ?? null
}

const action = (actions) => grist.docApi.applyUserActions(actions)

export async function attribuer(d, casierId, intervenantId, dateDebut) {
  if (d.activeParCasier.has(casierId)) throw new Error('Ce casier vient d’être attribué. Ferme la fenêtre pour voir le plan à jour.')
  if (d.activeParIntervenant.has(intervenantId)) throw new Error('Cette personne a déjà un casier. Il faut d’abord libérer l’ancien.')
  if (d.parId.Casiers.get(casierId)?.Hors_service) throw new Error('Ce casier est hors service.')
  await action([['AddRecord', 'Attributions', null, { Casier: casierId, Intervenant: intervenantId, Date_debut: versGrist(dateDebut) }]])
}

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
  const prochainId = (table) => Math.max(0, ...d[table].map((r) => r.id)) + 1
  const actions = []
  let entrepriseId = null
  const nomEntreprise = form.entreprise.trim()
  if (nomEntreprise) {
    const existante = d.Entreprises.find((e) => (e.Nom ?? '').toLowerCase() === nomEntreprise.toLowerCase())
    entrepriseId = existante?.id ?? prochainId('Entreprises')
    if (!existante) actions.push(['AddRecord', 'Entreprises', entrepriseId, { Nom: nomEntreprise }])
  }
  const intervenantId = prochainId('Intervenants')
  actions.push(
    ['AddRecord', 'Intervenants', intervenantId, {
      Prenom: form.prenom.trim(), Nom: form.nom.trim(), Entreprise: entrepriseId, Badge: badge || null,
    }],
    ['AddRecord', 'Attributions', null, { Casier: casierId, Intervenant: intervenantId, Date_debut: versGrist(dateDebut) }])
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

// Envoie une image dans les pièces jointes du document ; renvoie son identifiant
export async function envoyerPhoto(blob) {
  const { token, baseUrl } = await grist.docApi.getAccessToken({ readOnly: false })
  const formulaire = new FormData()
  formulaire.append('upload', blob, 'photo.jpg')
  const rep = await fetch(`${baseUrl}/attachments?auth=${token}`, {
    method: 'POST', body: formulaire, headers: { 'X-Requested-With': 'XMLHttpRequest' },
  })
  if (!rep.ok) throw new Error('La photo n’a pas pu être envoyée.')
  return (await rep.json())[0]
}

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

  // Lignes [{ id, Col: v }] → BulkAddRecord avec les identifiants choisis
  const ajout = (table, liste) => {
    if (liste.length === 0) return []
    const colonnes = Object.keys(liste[0]).filter((c) => c !== 'id')
    return [['BulkAddRecord', table, liste.map((l) => l.id), Object.fromEntries(colonnes.map((c) => [c, liste.map((l) => l[c])]))]]
  }
  await action([
    ['AddRecord', 'Chantiers', chantierId, infosVersGrist(infos)],
    ...Object.entries(lignes).flatMap(([table, liste]) => ajout(table, liste)),
  ])
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

// ---- Gestion des entreprises (admin) ----

// Une autre entreprise porte-t-elle déjà ce nom (sans tenir compte des majuscules) ?
function verifierNomEntreprise(d, nom, sauf) {
  if (!nom) throw new Error('Le nom de l’entreprise est obligatoire.')
  if (d.Entreprises.some((e) => e.id !== sauf && (e.Nom ?? '').trim().toLowerCase() === nom.toLowerCase()))
    throw new Error(`Une entreprise « ${nom} » existe déjà.`)
}

// `champs` : Nom, Adresse, Responsable_prenom, Responsable_nom, Telephone, Email
export async function creerEntreprise(d, champs) {
  verifierNomEntreprise(d, champs.Nom, null)
  await action([['AddRecord', 'Entreprises', null, champs]])
}

export async function modifierEntreprise(d, entrepriseId, champs) {
  verifierNomEntreprise(d, champs.Nom, entrepriseId)
  await action([['UpdateRecord', 'Entreprises', entrepriseId, champs]])
}

// Les intervenants rattachés restent, sans entreprise (Grist vide leur référence)
export const supprimerEntreprise = (entrepriseId) => action([['RemoveRecord', 'Entreprises', entrepriseId]])

// ---- Gestion des postes (admin) ----

export const STATUTS_POSTE = ['À venir', 'En cours', 'Archives']
export const HORAIRES_POSTE = ['4', '5', '6', '7', 'Autre']

// Liste de références Grist (['L', 1, 2]) ↔ tableau d'identifiants
export const idsDeListe = (v) => (Array.isArray(v) ? v.filter((x) => x !== 'L') : [])

// `champs` : Titre, Date_demarrage (ISO), Nb_personnes, Statut, Chantiers (ids), Mission, Horaires, Horaires_precision
const posteVersGrist = (champs) => ({
  ...champs,
  Date_demarrage: versGrist(champs.Date_demarrage),
  Chantiers: champs.Chantiers.length > 0 ? ['L', ...champs.Chantiers] : null,
  Horaires_precision: champs.Horaires === 'Autre' ? champs.Horaires_precision : '',
})

function verifierPoste(champs) {
  if (!champs.Titre) throw new Error('Le titre du poste est obligatoire.')
  if (champs.Nb_personnes != null && !(Number.isInteger(champs.Nb_personnes) && champs.Nb_personnes >= 0))
    throw new Error('Le nombre de personnes doit être un entier positif.')
  if (champs.Horaires === 'Autre' && !champs.Horaires_precision) throw new Error('Précise les horaires (choix « Autre »).')
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
