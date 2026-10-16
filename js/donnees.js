// Accès aux tables du document Grist « Casiers chantier »
/* global grist */
import { versGrist, depuisGrist } from './outils.js'

const TABLES = ['Chantiers', 'Zones', 'Bases_vie', 'Etages', 'Vestiaires', 'Pieces', 'Casiers',
  'Entreprises', 'Intervenants', 'Attributions', 'Incidents', 'Controles_nettoyage', 'Maintenance']
const OPTIONNELLES = ['Zones', 'Controles_nettoyage', 'Maintenance'] // absentes des documents plus anciens

// Table au format colonnes ({ id: [...], Nom: [...] }) → liste d'objets
function enLignes(table) {
  return table.id.map((_, i) => Object.fromEntries(Object.keys(table).map((col) => [col, table[col][i]])))
}

// Charge toutes les tables et prépare les index utiles aux écrans
export async function chargerTout() {
  const absentes = new Set()
  const brutes = await Promise.all(TABLES.map((t) => grist.docApi.fetchTable(t).catch((e) => {
    if (!OPTIONNELLES.includes(t)) throw e
    absentes.add(t)
    return { id: [] }
  })))
  const d = Object.fromEntries(TABLES.map((t, i) => [t, enLignes(brutes[i])]))
  d.absentes = absentes

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

// ---- Contrôles nettoyage et maintenance ----

export const enregistrer = (table, champs) => action([['AddRecord', table, null, champs]])

export const changerStatut = (incidentId, statut, aujourdhuiIso) =>
  action([['UpdateRecord', 'Incidents', incidentId, {
    Statut: statut,
    Resolu_le: statut === 'Résolu' ? versGrist(aujourdhuiIso) : null,
  }]])
