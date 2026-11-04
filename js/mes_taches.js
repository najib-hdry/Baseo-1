// Écran « Mes tâches » (salarié, sur téléphone) : en-tête, quatre gros boutons vers les pages du chantier
// (casiers et incidents selon les autorisations du compte), puis les tâches du jour ; une tâche touchée ouvre sa fiche
// en lecture seule. Des pictogrammes accompagnent chaque texte, pour les salariés qui lisent peu.
import { h, icone, ouvrirPanneau } from './outils.js'
import { ROLE_SALARIE } from './donnees.js'

// [page, libellé, pictogramme, couleur, autorisation du compte nécessaire (clé de d.moi) ou null]
const RACCOURCIS_TACHES = [
  ['casiers', 'Gérer les casiers', 'cadenas', '#1F8A4C', 'casiers'],
  ['maintenance', 'Maintenance', 'maintenance', '#E07B2E', null],
  ['nettoyage', 'Contrôle du nettoyage', 'nettoyage', '#2F6FDB', null],
  ['incidents', 'Déclarer un incident', 'hs', '#C8382E', 'incidents'],
]
// Pictogramme d'une tâche d'après son titre et son action (le premier mot reconnu l'emporte)
const PICTOS_TACHE = [
  [/nettoy|propre|m[ée]nage|lavage|balay/i, 'nettoyage'],
  [/maint|r[ée]par|d[ée]pann|entretien/i, 'maintenance'],
  [/casier|cl[ée]|cadenas/i, 'cadenas'],
  [/stock|livr|inventaire/i, 'stock'],
]
const dateDeTache = (v) => (v ? new Date(v * 1000) : null) // colonnes Date et heure : secondes depuis 1970
const heureDeTache = (dt) => (dt ? dt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—')
const memeJour = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

export function creerEcranMesTaches(racine, allerA) {
  let d = null

  const pictoTache = (t) => (t.Incident ? 'hs' : PICTOS_TACHE.find(([motif]) => motif.test(`${t.Titre ?? ''} ${t.Action ?? ''}`))?.[1] ?? 'emargements')
  const horaires = (t) => `${heureDeTache(dateDeTache(t.Date_debut))} → ${heureDeTache(dateDeTache(t.Date_fin))}`
  // Niveaux remplis, du chantier au vestiaire : [pictogramme, libellé, nom]
  const emplacements = (t) => [['grue', 'Chantier', 'Chantiers', t.Chantier], ['lieu', 'Zone', 'Zones', t.Zone], ['entreprise', 'Base vie', 'Bases_vie', t.Base_vie],
    ['etage', 'Étage', 'Etages', t.Etage], ['porte', 'Pièce', 'Pieces', t.Piece], ['total', 'Vestiaire', 'Vestiaires', t.Vestiaire]]
    .map(([picto, libelle, table, id]) => [picto, libelle, id && d.parId[table]?.get(id)?.Nom]).filter(([, , nom]) => nom)

  // Une ligne de la fiche : pictogramme, libellé discret, valeur en gras
  const ligneFiche = (picto, libelle, valeur) => h('div', { className: 'tache-info' },
    h('span', { className: 'tache-info-picto' }, icone(picto, 26)),
    h('div', null, h('span', { className: 'tache-info-libelle' }, libelle), h('strong', null, valeur)))

  function ouvrirTache(t) {
    const incident = t.Incident && d.parId.Incidents.get(t.Incident)
    ouvrirPanneau(t.Titre || 'Tâche', h('div', { className: 'tache-fiche' },
      h('div', { className: 'tache-fiche-picto' }, icone(pictoTache(t), 48)),
      ligneFiche('en_cours', 'Horaires', horaires(t)),
      emplacements(t).map(([picto, libelle, nom]) => ligneFiche(picto, libelle, nom)),
      t.Action && ligneFiche('main', 'Action', t.Action),
      t.Detail && ligneFiche('note', 'Détail', t.Detail),
      incident && ligneFiche('hs', 'Incident', incident.Description || `Incident n° ${incident.id}`)))
  }

  function rendre() {
    if (!d) return
    if (d.moi.profil !== ROLE_SALARIE) {
      racine.replaceChildren(h('p', { className: 'message' }, 'Page réservée aux salariés.'))
      return
    }
    const auj = new Date()
    const taches = (d.Emploi_du_temps ?? [])
      .filter((t) => t.Salarie === d.moi.id && t.Date_debut && memeJour(dateDeTache(t.Date_debut), auj))
      .sort((a, b) => a.Date_debut - b.Date_debut)
    racine.replaceChildren(h('div', { className: 'mes-taches' },
      h('section', { className: 'taches-entete' },
        h('span', { className: 'taches-pastille' }, 'Tâches'),
        h('h1', null, 'Mes tâches'),
        h('p', { className: 'sous-texte' }, 'Que souhaitez-vous faire ?')),
      h('div', { className: 'taches-raccourcis' },
        RACCOURCIS_TACHES.filter(([, , , , autorisation]) => !autorisation || d.moi[autorisation]).map(([page, libelle, picto, couleur]) =>
          h('button', { className: 'tache-raccourci', type: 'button', style: { '--couleur': couleur }, onClick: () => allerA(page) },
            h('span', { className: 'tache-raccourci-picto' }, icone(picto, 30)),
            h('span', { className: 'tache-raccourci-libelle' }, libelle),
            h('span', { className: 'tache-raccourci-fleche' }, icone('fleche', 20))))),
      h('section', { className: 'taches-jour' },
        h('h2', null, h('span', { className: 'taches-jour-picto' }, icone('conges', 24)), 'À faire aujourd’hui'),
        d.absentes.has('Emploi_du_temps') ? h('p', { className: 'message' }, 'Ce document n’a pas de table Emploi du temps.')
          : taches.length === 0 ? h('p', { className: 'taches-vide' }, icone('libres', 32), 'Aucune tâche aujourd’hui.')
            : h('ul', { className: 'taches-liste' }, taches.map((t) => h('li', null,
              h('button', { className: 'tache-ligne', type: 'button', onClick: () => ouvrirTache(t) },
                h('span', { className: 'tache-ligne-picto' }, icone(pictoTache(t), 28)),
                h('span', { className: 'tache-ligne-texte' }, h('strong', null, t.Titre || 'Tâche'),
                  h('span', { className: 'tache-ligne-heure' }, icone('en_cours', 16), horaires(t))),
                h('span', { className: 'tache-ligne-fleche' }, icone('fleche', 18)))))))))
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
