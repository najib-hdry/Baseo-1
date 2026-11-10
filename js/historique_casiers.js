// Onglets « Historique » et « Occupation par société » de la page Casiers (Admin et Client).
// Historique : toutes les attributions d'un chantier, passées, en cours et à venir, avec leur emplacement, l'intervenant
// et son employeur. Filtre par statut et par période, recherche, tri des colonnes (commun à tous les tableaux) et export
// Excel des lignes affichées.
// Occupation par société : les entreprises du chantier (table Chantier_Entreprise, colonnes formules de Grist) avec
// leur responsable, le nombre de casiers occupés (passés et en cours), les jours occupés et le prix.
import { h, enFrancais, depuisGrist, aujourdhui, etiqueterLignes, compte, notifier, menuPlus, lienContact, euros } from './outils.js'
import { chargerXlsx } from './taches.js'

const TITRES_HISTORIQUE = ['Casier', 'Emplacement', 'Intervenant', 'Badge', 'Employeur', 'Début', 'Fin', 'Durée (j)', 'Statut', 'Clé', 'Commentaire']
const STATUTS_HISTORIQUE = [['tous', 'Toutes'], ['En cours', 'En cours'], ['À venir', 'À venir'], ['Terminée', 'Terminées']]

// Base vie · Étage · Vestiaire d'un casier
function emplacementCasier(d, casier) {
  const v = casier && d.parId.Vestiaires.get(casier.Vestiaire)
  const e = v && d.parId.Etages.get(v.Etage)
  const b = e && d.parId.Bases_vie.get(e.Base_vie)
  return [b?.Nom, e?.Nom, v?.Nom].filter(Boolean).join(' · ')
}

// Une attribution mise à plat pour le tableau et l'export
function ligneHistorique(d, a) {
  const casier = d.parId.Casiers.get(a.Casier)
  const i = d.parId.Intervenants.get(a.Intervenant)
  const debut = depuisGrist(a.Date_debut)
  const fin = depuisGrist(a.Date_fin)
  return {
    attribution: a,
    casier: casier?.Numero ?? '—',
    emplacement: emplacementCasier(d, casier),
    intervenant: [i?.Prenom, i?.Nom].filter(Boolean).join(' ') || i?.Nom_complet || '—',
    badge: i?.Badge || '',
    employeur: (i && (d.parId.Entreprises.get(i.Entreprise)?.Nom || d.parId.Sous_traitants.get(i.Employeur)?.Nom)) || '',
    debut, fin,
    // Colonne formule Jours_occupes de Grist ; à défaut, jours entre le début et la fin (ou aujourd'hui)
    duree: typeof a.Jours_occupes === 'number' ? a.Jours_occupes
      : debut ? Math.max(0, Math.round((Date.parse(fin || aujourdhui()) - Date.parse(debut)) / 86400000)) : '',
    statut: fin ? 'Terminée' : debut > aujourdhui() ? 'À venir' : 'En cours',
    cle: a.Coffre === 'Oui' ? a.Numero_cle || 'Oui' : '',
    commentaire: a.Commentaire || '',
  }
}

/**
 * Historique du chantier `chantierId`. `filtres` ({ statut, recherche, du, au }) est gardé par l'appelant :
 * les choix restent quand la page est redessinée. Seul le tableau est redessiné quand un filtre change.
 * `actions` ({ modifier(a), supprimer(a) }, Admin seulement) : menu « ⋯ » sur chaque ligne ; null = lecture seule.
 */
export function historiqueCasiers(d, chantierId, filtres, actions = null) {
  const titres = actions ? [...TITRES_HISTORIQUE, ''] : TITRES_HISTORIQUE
  const toutes = d.Attributions.filter((a) => (d.parId.Casiers.get(a.Casier)?.Chantier ?? a.Chantier) === chantierId).map((a) => ligneHistorique(d, a))
    .sort((x, y) => String(y.debut).localeCompare(String(x.debut))) // plus récentes d'abord
  const corps = h('tbody')
  const compteur = h('p', { className: 'sous-texte' })
  let visibles = []

  const dessiner = () => {
    const texte = filtres.recherche.trim().toLowerCase()
    visibles = toutes.filter((l) => (filtres.statut === 'tous' || l.statut === filtres.statut)
      // Période : attributions qui la chevauchent (fin vide = toujours en cours)
      && (!filtres.du || !l.fin || l.fin >= filtres.du) && (!filtres.au || l.debut <= filtres.au)
      && (!texte || [l.casier, l.intervenant, l.badge, l.employeur, l.emplacement, l.commentaire].some((v) => String(v).toLowerCase().includes(texte))))
    compteur.textContent = compte(visibles.length, toutes.length, 'attribution')
    corps.replaceChildren(...(visibles.length === 0
      ? [h('tr', null, h('td', { className: 'tableau-vide', colSpan: titres.length }, toutes.length ? 'Aucun résultat.' : 'Aucune attribution sur ce chantier.'))]
      : visibles.map((l) => h('tr', null,
        h('td', { className: 'tableau-nom' }, l.casier), h('td', null, l.emplacement || '—'), h('td', null, l.intervenant), h('td', null, l.badge || '—'),
        h('td', null, l.employeur || '—'), h('td', null, enFrancais(l.debut) || '—'), h('td', null, enFrancais(l.fin) || '—'),
        h('td', null, String(l.duree)), h('td', null, l.statut), h('td', null, l.cle || '—'), h('td', null, l.commentaire || '—'),
        actions && h('td', { className: 'tableau-actions' }, menuPlus([
          h('button', { className: 'bouton bouton-compact', role: 'menuitem', onClick: () => actions.modifier(l.attribution) }, 'Modifier'),
          h('button', { className: 'bouton bouton-compact bouton-danger', role: 'menuitem', onClick: () => actions.supprimer(l.attribution) }, 'Supprimer')]))))))
    etiqueterLignes(corps, titres)
  }

  const boutonsStatut = STATUTS_HISTORIQUE.map(([cle, libelle]) => h('button', { className: 'filtre', type: 'button', 'aria-pressed': String(filtres.statut === cle),
    onClick: (e) => {
      filtres.statut = cle
      boutonsStatut.forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget)))
      dessiner()
    } }, libelle))
  const date = (cle, libelle) => h('label', { className: 'historique-date' }, libelle,
    h('input', { className: 'champ champ-compact', type: 'date', value: filtres[cle], onChange: (e) => { filtres[cle] = e.target.value; dessiner() } }))

  // Export Excel des lignes affichées (filtres appliqués), dates au format JJ/MM/AAAA
  async function exporter(bouton) {
    bouton.disabled = true
    try {
      const XLSX = await chargerXlsx()
      const feuille = XLSX.utils.aoa_to_sheet([TITRES_HISTORIQUE, ...visibles.map((l) => [l.casier, l.emplacement, l.intervenant, l.badge, l.employeur,
        enFrancais(l.debut), enFrancais(l.fin), l.duree, l.statut, l.cle, l.commentaire])])
      feuille['!cols'] = [10, 30, 24, 12, 22, 12, 12, 10, 12, 10, 40].map((wch) => ({ wch }))
      const classeur = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(classeur, feuille, 'Historique')
      const chantier = d.parId.Chantiers.get(chantierId)?.Nom ?? 'chantier'
      XLSX.writeFile(classeur, `historique-casiers-${chantier}-${aujourdhui()}.xlsx`.replace(/[\\/:*?"<>|]/g, '-'))
    } catch (err) {
      notifier(err.message || 'L’export a échoué.', 'erreur')
    } finally {
      bouton.disabled = false
    }
  }
  const boutonExport = h('button', { className: 'bouton bouton-compact', type: 'button', onClick: () => exporter(boutonExport) }, 'Exporter (Excel)')

  dessiner()
  return h('section', { className: 'carte-tableau historique-casiers' },
    h('div', { className: 'filtres' }, boutonsStatut),
    h('div', { className: 'barre-outils' },
      h('input', { className: 'champ champ-compact', type: 'search', placeholder: 'Rechercher (nom, badge, n° de casier, employeur…)', value: filtres.recherche,
        'aria-label': 'Rechercher dans l’historique', onInput: (e) => { filtres.recherche = e.target.value; dessiner() } }),
      date('du', 'Du'), date('au', 'Au'), boutonExport),
    compteur,
    h('div', { className: 'tableau-defilant' },
      h('table', { className: 'tableau' },
        h('thead', null, h('tr', null, titres.map((t) => h('th', null, t)))),
        corps)))
}

const TITRES_SOCIETES = ['Entreprise', 'Responsable', 'Téléphone', 'Email', 'Nbr casiers', 'Nbr jours', 'Prix']
// Prix : colonne formule de type Any (un nombre, ou une erreur si le prix du casier manque)
const prixSociete = (l) => (typeof l.Prix === 'number' ? l.Prix : null)

// Occupation par société du chantier `chantierId` : une ligne par entreprise rattachée au chantier, total en dessous
export function occupationSocietes(d, chantierId) {
  const lignes = (d.Chantier_Entreprise ?? []).filter((l) => l.Chantier === chantierId).map((l) => {
    const e = d.parId.Entreprises.get(l.Entreprise)
    return { ...l, e, nom: e?.Nom || 'Sans nom', responsable: [e?.Responsable_prenom, e?.Responsable_nom].filter(Boolean).join(' ') }
  }).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
  const somme = (f) => lignes.reduce((t, l) => t + (Number(f(l)) || 0), 0)
  const prixCasier = d.parId.Chantiers.get(chantierId)?.Prix_casier
  const corps = h('tbody', null, lignes.length === 0
    ? h('tr', null, h('td', { className: 'tableau-vide', colSpan: TITRES_SOCIETES.length }, 'Aucune entreprise rattachée à ce chantier.'))
    : lignes.map((l) => h('tr', null,
      h('td', { className: 'tableau-nom' }, l.nom), h('td', null, l.responsable || '—'),
      h('td', null, lienContact('tel', l.e?.Telephone) || '—'), h('td', null, lienContact('mailto', l.e?.Email) || '—'),
      h('td', null, String(l.Nbr_casiers ?? 0)), h('td', null, String(l.Nbr_jours_occupes ?? 0)),
      h('td', null, prixSociete(l) == null ? '—' : euros.format(prixSociete(l))))))
  etiqueterLignes(corps, TITRES_SOCIETES)
  return h('section', { className: 'carte-tableau' },
    h('p', { className: 'sous-texte' }, prixCasier ? `Prix du casier : ${euros.format(prixCasier)} par jour` : 'Prix du casier non renseigné dans la fiche du chantier : les prix restent à 0.'),
    h('div', { className: 'tableau-defilant' },
      h('table', { className: 'tableau' },
        h('thead', null, h('tr', null, TITRES_SOCIETES.map((t) => h('th', null, t)))),
        corps)),
    lignes.length > 0 && h('p', { className: 'societes-total' },
      `Total : ${somme((l) => l.Nbr_casiers)} casiers · ${somme((l) => l.Nbr_jours_occupes)} jours · ${euros.format(somme(prixSociete))}`))
}
