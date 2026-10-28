// Écran « Tableau de bord » (admin) : chiffres clés et graphiques, pour tous les chantiers ou un seul.
// Casiers, incidents, salariés (actifs, alertes de fin de contrat, de Pass IAE et de titre de séjour),
// articles de stock à commander, nouvelles demandes de congé et d'acompte. Chaque tuile ouvre la page concernée.
import { h, depuisGrist, enFrancais, etiqueterLignes, euros, icone } from './outils.js'
import { estAdmin, idsDeListe, nomContact, ROLE_SALARIE } from './donnees.js'

// Couleurs des graphiques (variables du thème)
const TB_COULEURS = { occupes: 'var(--occupe)', libres: 'var(--libre)', hs: 'var(--hs)', ouvert: 'var(--hs)', en_cours: 'var(--signal)',
  resolu: 'var(--libre)', actif: 'var(--marque-turquoise)', inactif: '#9AA7B2', alerte: 'var(--hs)', neutre: 'var(--marque-vert)' }
const tbPluriel = (n, mot, pluriel = `${mot}s`) => `${n} ${n > 1 ? pluriel : mot}`

// `aller(cle)` : ouvre une page du menu
export function creerEcranTableauDeBord(racine, recharger, aller) {
  let d = null
  let chantier = 0 // 0 : tous les chantiers

  // ---- Petits éléments de dessin ----

  // Tuile : grand nombre, libellé, détail ; cliquable vers une page
  const tuile = ({ valeur, libelle, detail, couleur, page }) => h('button', { className: 'tb-tuile', type: 'button',
    style: { '--teinte': couleur }, onClick: () => page && aller(page), title: page ? 'Ouvrir la page' : null },
  h('span', { className: 'tb-valeur' }, String(valeur)),
  h('span', { className: 'tb-libelle' }, libelle),
  detail && h('span', { className: 'tb-detail' }, detail))

  // Barres horizontales : lignes = [libellé, [[valeur, couleur, nom], …]] (parties empilées), longueurs comparables
  const barres = (titre, lignes, vide, legende = []) => {
    const total = (parts) => parts.reduce((t, [n]) => t + n, 0)
    const max = Math.max(0, ...lignes.map(([, parts]) => total(parts)))
    return h('section', { className: 'graph' }, h('h3', null, titre),
      legende.length > 0 && h('div', { className: 'graph-legende' },
        legende.map(([nom, couleur]) => h('span', null, h('i', { className: 'graph-pastille', style: { background: couleur } }), nom))),
      lignes.length === 0 || max === 0 ? h('p', { className: 'sous-texte' }, vide) : lignes.map(([libelle, parts]) => h('div', { className: 'graph-ligne' },
        h('span', { className: 'graph-libelle', title: libelle }, libelle),
        h('div', { className: 'graph-piste' },
          h('div', { className: 'graph-barre', style: { width: `${(100 * total(parts)) / max}%` }, title: parts.map(([n, , nom]) => `${nom ?? ''} ${n}`).join(' · ') },
            parts.filter(([n]) => n > 0).map(([n, couleur]) => h('span', { className: 'graph-part', style: { flexGrow: n, background: couleur } })))),
        h('span', { className: 'graph-valeur' }, String(total(parts))))))
  }

  // Anneau : parts = [[valeur, couleur, nom]] ; `centre` : grand texte, `sous` : petit texte
  const anneau = (titre, parts, centre, sous) => {
    const r = 42
    const tour = 2 * Math.PI * r
    const total = parts.reduce((t, [n]) => t + n, 0)
    let deja = 0
    const dessin = h('span', { className: 'anneau-dessin' })
    const arcs = total === 0 ? [] : parts.filter(([n]) => n > 0).map(([n, couleur]) => {
      const long = (tour * n) / total
      const arc = `<circle cx="60" cy="60" r="${r}" class="graph-arc" style="stroke:${couleur}" stroke-dasharray="${long} ${tour - long}" stroke-dashoffset="${-deja}"/>`
      deja += long
      return arc
    })
    dessin.innerHTML = `<svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="${r}" class="graph-arc graph-vide"/>`
      + `<g transform="rotate(-90 60 60)">${arcs.join('')}</g></svg>`
    return h('section', { className: 'graph' }, h('h3', null, titre),
      h('div', { className: 'anneau' }, dessin,
        h('div', null,
          h('strong', { className: 'anneau-taux' }, centre), sous && h('span', { className: 'sous-texte' }, ` ${sous}`),
          h('div', { className: 'graph-legende', style: { marginTop: '8px' } },
            parts.map(([n, couleur, nom]) => h('span', null, h('i', { className: 'graph-pastille', style: { background: couleur } }), `${nom} : ${n}`))))))
  }

  // Colonnes par mois : mois = [[libellé, [[valeur, couleur, nom], …]]] (colonnes côte à côte)
  const colonnes = (titre, mois, legende) => {
    const max = Math.max(1, ...mois.flatMap(([, vals]) => vals.map(([n]) => n)))
    return h('section', { className: 'graph graph-large' }, h('h3', null, titre),
      h('div', { className: 'graph-legende' }, legende.map(([nom, couleur]) => h('span', null, h('i', { className: 'graph-pastille', style: { background: couleur } }), nom))),
      h('div', { className: 'tb-colonnes' }, mois.map(([libelle, vals]) => h('div', { className: 'tb-mois' },
        h('div', { className: 'tb-paire' }, vals.map(([n, couleur, nom]) => h('span', { className: 'tb-col', title: `${nom} : ${n}`,
          style: { height: `${(100 * n) / max}%`, background: couleur } }, n > 0 ? h('span', { className: 'tb-col-valeur' }, String(n)) : null))),
        h('span', { className: 'tb-mois-libelle' }, libelle)))))
  }

  const tableau = (entetes, lignes, vide) => h('div', { className: 'tableau-defilant' },
    h('table', { className: 'tableau' },
      h('thead', null, h('tr', null, entetes.map((t) => h('th', null, t)))),
      etiqueterLignes(h('tbody', null, lignes.length === 0
        ? h('tr', null, h('td', { className: 'tableau-vide', colSpan: entetes.length }, vide))
        : lignes.map((cellules) => h('tr', null, cellules.map((c) => h('td', null, c))))), entetes)))

  const section = (titre, nomIcone, ...contenu) => h('section', { className: 'tb-section' },
    h('h2', null, h('span', { className: 'titre-icone' }, icone(nomIcone, 20)), titre), ...contenu)

  // ---- Données du périmètre choisi ----

  function perimetre() {
    const dansChantier = (id) => !chantier || id === chantier
    const salaries = d.Utilisateurs.filter((u) => u.Profil === ROLE_SALARIE && (!chantier || idsDeListe(u.Chantiers).includes(chantier)))
    const idsSalaries = new Set(salaries.map((u) => u.id))
    const stocks = (d.Stock ?? []).filter((s) => !chantier || idsDeListe(s.Chantiers).includes(chantier))
    const idsStocks = new Set(stocks.map((s) => s.id))
    return {
      casiers: d.Casiers.filter((k) => dansChantier(k.Chantier)),
      incidents: d.Incidents.filter((i) => dansChantier(i.Chantier)),
      salaries,
      // Alertes : candidat lié au compte du salarié ; fin du dernier contrat
      candidats: (d.Candidats ?? []).filter((c) => idsSalaries.has(c.Utilisateur)),
      contrats: (d.Contrats ?? []).filter((k) => idsSalaries.has(k.Salarie)),
      elements: (d.Stock_Elements ?? []).filter((e) => idsStocks.has(e.Stock)),
      conges: (d.Demande_de_conge ?? []).filter((c) => c.Statut === 'Nouvelle' && idsSalaries.has(c.Salarie)),
      acomptes: (d.Acompte ?? []).filter((a) => a.Statut === 'Nouvelle' && idsSalaries.has(a.Salarie)),
    }
  }

  const nomSalarie = (id) => { const u = d.parId.Utilisateurs.get(id); return nomContact(u) || u?.Email || '—' }
  const date = (v) => enFrancais(depuisGrist(v)) || '—'
  const actuelle = (e) => (e.Quantite_entree || 0) - (e.Quantite_sortie || 0)
  const aCommander = (e) => Boolean(e.Quantite_seuil) && actuelle(e) <= e.Quantite_seuil

  // ---- Rendu ----

  function rendre() {
    if (!d) return
    if (!estAdmin(d)) {
      racine.replaceChildren(h('p', { className: 'message' }, 'Page réservée aux administrateurs.'))
      return
    }
    const p = perimetre()
    const chantiers = [...d.Chantiers].sort((a, b) => String(a.Nom).localeCompare(String(b.Nom), 'fr', { numeric: true }))

    // Casiers
    const occupation = (casiers) => {
      const hs = casiers.filter((k) => k.Hors_service).length
      const occupes = casiers.filter((k) => !k.Hors_service && d.activeParCasier.has(k.id)).length
      return { total: casiers.length, occupes, hs, libres: casiers.length - occupes - hs }
    }
    const occ = occupation(p.casiers)
    const partsCasiers = (o) => [[o.occupes, TB_COULEURS.occupes, 'Occupés'], [o.libres, TB_COULEURS.libres, 'Libres'], [o.hs, TB_COULEURS.hs, 'HS']]
    const taux = occ.total ? `${Math.round((100 * occ.occupes) / occ.total)} %` : '—'
    // Tous les chantiers : une barre par chantier ; un chantier : une barre par base vie
    const lignesCasiers = chantier
      ? d.Bases_vie.filter((b) => b.Chantier === chantier).map((b) => [b.Nom || 'Sans nom', partsCasiers(occupation(p.casiers.filter((k) => k.Base_vie === b.id)))])
      : chantiers.map((c) => [c.Nom || 'Sans nom', partsCasiers(occupation(p.casiers.filter((k) => k.Chantier === c.id)))])

    // Incidents
    const parStatut = (s) => p.incidents.filter((i) => (i.Statut || 'Ouvert') === s).length
    const [ouverts, enCours, resolus] = ['Ouvert', 'En cours', 'Résolu'].map(parStatut)
    const categories = new Map()
    for (const i of p.incidents) {
      const cat = i.Categorie || 'Sans catégorie'
      const parts = categories.get(cat) ?? { ouverts: 0, enCours: 0, resolus: 0 }
      if (i.Statut === 'Résolu') parts.resolus++; else if (i.Statut === 'En cours') parts.enCours++; else parts.ouverts++
      categories.set(cat, parts)
    }
    const lignesCategories = [...categories].sort((a, b) => (b[1].ouverts + b[1].enCours) - (a[1].ouverts + a[1].enCours))
      .map(([cat, n]) => [cat, [[n.ouverts, TB_COULEURS.ouvert, 'Ouverts'], [n.enCours, TB_COULEURS.en_cours, 'En cours'], [n.resolus, TB_COULEURS.resolu, 'Résolus']]])
    // 6 derniers mois : signalés (date du signalement) et résolus (date de résolution)
    const auj = new Date()
    const mois = Array.from({ length: 6 }, (_, i) => new Date(auj.getFullYear(), auj.getMonth() - 5 + i, 1))
    const cleMois = (s) => { if (!s) return null; const dt = new Date(s * 1000); return `${dt.getFullYear()}-${dt.getMonth()}` }
    const evolution = mois.map((m) => {
      const cle = `${m.getFullYear()}-${m.getMonth()}`
      return [m.toLocaleDateString('fr-FR', { month: 'short' }), [
        [p.incidents.filter((i) => cleMois(i.Signale_le) === cle).length, TB_COULEURS.ouvert, 'Signalés'],
        [p.incidents.filter((i) => i.Statut === 'Résolu' && cleMois(i.Resolu_le) === cle).length, TB_COULEURS.resolu, 'Résolus']]]
    })

    // Salariés et alertes
    const actifs = p.salaries.filter((u) => u.Actif).length
    const alertes = [
      ...p.contrats.filter((k) => k.Alerte_fin_contrat).map((k) => [k.Salarie, 'Fin de contrat', k.Date_fin]),
      ...p.candidats.filter((c) => c.Alerte_Pass_IAE).map((c) => [c.Utilisateur, 'Fin du Pass IAE', c.Pass_IAE_fin]),
      ...p.candidats.filter((c) => c.Alerte_titre_sejour).map((c) => [c.Utilisateur, 'Fin du titre de séjour', c.Date_validite_titre_sejour]),
    ].sort((a, b) => (a[2] ?? Infinity) - (b[2] ?? Infinity))
    const nbAlerte = (type) => alertes.filter((a) => a[1] === type).length

    // Stock à commander
    const alertesStock = p.elements.filter(aCommander)
      .sort((a, b) => actuelle(a) - (a.Quantite_seuil || 0) - (actuelle(b) - (b.Quantite_seuil || 0)))
    const parSource = new Map()
    for (const e of alertesStock) {
      const src = d.parId.Stock_Source?.get(e.Source)?.Source || 'Sans source'
      parSource.set(src, (parSource.get(src) ?? 0) + 1)
    }

    // Demandes
    const totalAcomptes = p.acomptes.reduce((t, a) => t + (a.Montant || 0), 0)

    const nomChantier = chantier ? d.parId.Chantiers.get(chantier)?.Nom : null
    racine.replaceChildren(h('div', { className: 'tableau-bord' },
      h('div', { className: 'tb-filtre' },
        h('label', { className: 'champ-groupe' }, 'Chantier',
          h('select', { className: 'champ champ-compact', onChange: (e) => { chantier = Number(e.target.value); rendre() } },
            h('option', { value: '0', selected: !chantier }, 'Tous les chantiers'),
            chantiers.map((c) => h('option', { value: String(c.id), selected: c.id === chantier }, c.Nom || 'Sans nom')))),
        h('span', { className: 'sous-texte' }, nomChantier ? `Chiffres du chantier ${nomChantier}` : `Chiffres de ${tbPluriel(chantiers.length, 'chantier')}`)),

      h('div', { className: 'tb-tuiles' },
        tuile({ valeur: taux, libelle: 'Casiers occupés', detail: `${occ.occupes}/${occ.total} · ${tbPluriel(occ.libres, 'libre')} · ${occ.hs} HS`, couleur: TB_COULEURS.occupes, page: 'casiers' }),
        tuile({ valeur: ouverts + enCours, libelle: 'Incidents à traiter', detail: `${tbPluriel(ouverts, 'ouvert')} · ${enCours} en cours`, couleur: TB_COULEURS.ouvert, page: 'incidents' }),
        tuile({ valeur: actifs, libelle: 'Salariés actifs', detail: tbPluriel(p.salaries.length - actifs, 'désactivé'), couleur: TB_COULEURS.actif, page: 'utilisateurs' }),
        tuile({ valeur: alertes.length, libelle: 'Alertes salariés', detail: `${tbPluriel(nbAlerte('Fin de contrat'), 'contrat')} · ${nbAlerte('Fin du Pass IAE')} Pass IAE · ${tbPluriel(nbAlerte('Fin du titre de séjour'), 'titre')} de séjour`, couleur: TB_COULEURS.alerte, page: 'utilisateurs' }),
        tuile({ valeur: alertesStock.length, libelle: 'Articles à commander', detail: tbPluriel(parSource.size, 'source'), couleur: TB_COULEURS.en_cours, page: 'stocks' }),
        tuile({ valeur: p.conges.length, libelle: 'Nouvelles demandes de congé', couleur: TB_COULEURS.neutre, page: 'conges' }),
        tuile({ valeur: p.acomptes.length, libelle: 'Nouvelles demandes d’acompte', detail: p.acomptes.length ? `${euros.format(totalAcomptes)} au total` : null, couleur: TB_COULEURS.neutre, page: 'acomptes' })),

      section('Casiers', 'total',
        h('div', { className: 'graphiques' },
          anneau('Occupation', partsCasiers(occ), taux, 'occupés'),
          barres(chantier ? 'Par base vie' : 'Par chantier', lignesCasiers, 'Aucun casier.', partsCasiers(occ).map(([, c, nom]) => [nom, c])))),

      section('Incidents', 'hs',
        h('div', { className: 'graphiques' },
          anneau('Par statut', [[ouverts, TB_COULEURS.ouvert, 'Ouverts'], [enCours, TB_COULEURS.en_cours, 'En cours'], [resolus, TB_COULEURS.resolu, 'Résolus']],
            String(p.incidents.length), 'au total'),
          barres('Par catégorie', lignesCategories, 'Aucun incident.', [['Ouverts', TB_COULEURS.ouvert], ['En cours', TB_COULEURS.en_cours], ['Résolus', TB_COULEURS.resolu]]),
          colonnes('Signalés et résolus, 6 derniers mois', evolution, [['Signalés', TB_COULEURS.ouvert], ['Résolus', TB_COULEURS.resolu]]))),

      section('Salariés et alertes', 'utilisateurs',
        h('div', { className: 'graphiques' },
          anneau('Comptes salariés', [[actifs, TB_COULEURS.actif, 'Actifs'], [p.salaries.length - actifs, TB_COULEURS.inactif, 'Désactivés']], String(actifs), 'actifs'),
          barres('Alertes (un mois ou moins)', [['Fin de contrat', [[nbAlerte('Fin de contrat'), TB_COULEURS.alerte]]],
            ['Fin du Pass IAE', [[nbAlerte('Fin du Pass IAE'), TB_COULEURS.alerte]]],
            ['Fin du titre de séjour', [[nbAlerte('Fin du titre de séjour'), TB_COULEURS.alerte]]]], 'Aucune alerte.')),
        tableau(['Salarié', 'Alerte', 'Échéance'], alertes.map(([id, type, echeance]) => [h('strong', null, nomSalarie(id)), type, date(echeance)]),
          'Aucune alerte : pas de fin de contrat, de Pass IAE ou de titre de séjour dans le mois.')),

      section('Stock à commander', 'stock',
        h('div', { className: 'graphiques' },
          barres('Par source', [...parSource].sort((a, b) => b[1] - a[1]).map(([src, n]) => [src, [[n, TB_COULEURS.en_cours]]]), 'Aucun article à commander.'),
          h('div', { className: 'graph' }, h('h3', null, 'Articles sous le seuil'),
            tableau(['Stock', 'Article', 'Actuelle', 'Seuil'], alertesStock.map((e) => [
              d.parId.Stock?.get(e.Stock)?.Nom || '—',
              h('strong', null, d.parId.Stock_Reference?.get(e.Descriptif)?.Libelle || '—'),
              String(actuelle(e)), String(e.Quantite_seuil)]), 'Aucun article sous son seuil.')))),

      section('Nouvelles demandes', 'conges',
        h('div', { className: 'graphiques' },
          h('div', { className: 'graph' }, h('h3', null, `Congés (${p.conges.length})`),
            tableau(['Salarié', 'Type', 'Du', 'Au'], [...p.conges].sort((a, b) => (a.Date_debut ?? 0) - (b.Date_debut ?? 0))
              .map((c) => [h('strong', null, nomSalarie(c.Salarie)), c.Type || '—', date(c.Date_debut), date(c.Date_fin || c.Date_debut)]), 'Aucune nouvelle demande de congé.')),
          h('div', { className: 'graph' }, h('h3', null, `Acomptes (${p.acomptes.length}${p.acomptes.length ? ` · ${euros.format(totalAcomptes)}` : ''})`),
            tableau(['Salarié', 'Montant', 'Demandé le'], [...p.acomptes].sort((a, b) => (b.Cree_le ?? 0) - (a.Cree_le ?? 0))
              .map((a) => [h('strong', null, nomSalarie(a.Salarie)), euros.format(a.Montant || 0), a.Cree_le ? new Date(a.Cree_le * 1000).toLocaleDateString('fr-FR') : '—']),
            'Aucune nouvelle demande d’acompte.'))))))
  }

  return {
    afficher(donnees) {
      d = donnees
      rendre()
    },
    accueil() {
      rendre()
    },
  }
}
