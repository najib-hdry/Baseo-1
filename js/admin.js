// Écran « Gestion des chantiers » (admin, première page) : tableau des chantiers par onglet de statut, changement de statut,
// création d'un chantier entier (zones → bases vie → étages → vestiaires avec casiers, pièces),
// modification des informations, suppression avec tout son contenu.
import { h, depuisGrist, enFrancais, ouvrirPanneau } from './outils.js'
import { STATUTS_CHANTIER, TYPES_VESTIAIRE, TYPES_PIECE, creerChantier, modifierChantier, changerStatutChantier, contenuChantier, supprimerChantier } from './donnees.js'

// Ordre des onglets de la page
const ONGLETS_CHANTIERS = ['En cours', 'Terminé', 'À venir', 'Nouveau']
const LIBELLES_CONTENU = {
  Zones: 'zones', Bases_vie: 'bases vie', Etages: 'étages', Vestiaires: 'vestiaires', Casiers: 'casiers', Pieces: 'pièces',
  Attributions: 'attributions', Incidents: 'incidents', Controles_nettoyage: 'contrôles nettoyage', Maintenance: 'interventions de maintenance',
}

// Nom d'étage proposé pour un niveau : -1 Sous-sol, 0 RDC, n R+n
const nomEtage = (niveau) => (niveau === 0 ? 'RDC' : niveau < 0 ? (niveau === -1 ? 'Sous-sol' : `Sous-sol ${-niveau}`) : `R+${niveau}`)
const nouveauVestiaire = () => ({ nom: 'Vestiaire hommes', type: 'hommes', casiers: 20 })
const nouvelEtage = (niveau) => ({ nom: nomEtage(niveau), niveau, vestiaires: [nouveauVestiaire()], pieces: [] })
const nouvelleBase = (n) => ({ nom: `Base vie ${n}`, etages: [nouvelEtage(0)] })
const nouvelleZone = (n) => ({ nom: n === 1 ? 'Zone principale' : `Zone ${n}`, bases: [nouvelleBase(1)] })

// Écran affiché dans `racine` ; `recharger()` relit les données après une écriture
export function creerEcranAdmin(racine, recharger) {
  let d = null
  let onglet = 'En cours' // un statut, ou '' pour les chantiers sans statut

  function rendre() {
    if (!d) return
    if (d.moi?.profil !== 'Admin') {
      racine.replaceChildren(h('h1', null, 'Gestion des chantiers'), h('p', { className: 'message' }, 'Page réservée aux administrateurs.'))
      return
    }
    // Onglets dans l'ordre demandé ; « Sans statut » n'apparaît que s'il en reste
    const parStatut = (s) => d.Chantiers.filter((c) => (c.Statut || '') === s).sort((a, b) => String(a.Nom).localeCompare(String(b.Nom)))
    const onglets = [...ONGLETS_CHANTIERS.map((s) => [s, s]), ...(parStatut('').length > 0 ? [['', 'Sans statut']] : [])]
    if (!onglets.some(([s]) => s === onglet)) onglet = onglets[0][0]
    const chantiers = parStatut(onglet)

    racine.replaceChildren(
      h('h1', null, 'Gestion des chantiers'),
      h('div', { className: 'barre-outils' },
        h('div', { className: 'onglets onglets-statut', role: 'tablist', 'aria-label': 'Statut des chantiers' },
          onglets.map(([s, libelle]) => h('button', { className: 'onglet', role: 'tab', 'aria-selected': String(s === onglet),
            onClick: () => { onglet = s; rendre() } }, `${libelle} (${parStatut(s).length})`))),
        h('button', { className: 'bouton bouton-principal bouton-compact', onClick: () => ouvrirEdition(null) }, '＋ Nouveau chantier')),
      h('div', { className: 'tableau-defilant' },
        h('table', { className: 'tableau' },
          h('thead', null, h('tr', null, ['Chantier', 'Période', 'Structure', 'Visible', 'Statut', ''].map((t) => h('th', null, t)))),
          h('tbody', null, chantiers.length === 0
            ? h('tr', null, h('td', { className: 'tableau-vide', colSpan: 6 }, 'Aucun chantier avec ce statut.'))
            : chantiers.map(ligne)))))
  }

  function ligne(c) {
    const contenu = contenuChantier(d, c.id)
    const structure = [['Bases_vie', 'bases vie'], ['Etages', 'étages'], ['Casiers', 'casiers']]
      .map(([t, libelle]) => `${contenu[t].length} ${libelle}`).join(' · ')
    const periode = [depuisGrist(c.Date_debut), depuisGrist(c.Date_fin)].map(enFrancais)
    const statut = h('select', { className: 'champ champ-compact', 'aria-label': `Statut de ${c.Nom}`, onClick: (e) => e.stopPropagation(), onChange: async (e) => {
      e.target.disabled = true
      try { await changerStatutChantier(c.id, e.target.value); await recharger() } catch { e.target.disabled = false }
    } },
    !c.Statut && h('option', { value: '', selected: true, disabled: true }, 'Statut…'),
    STATUTS_CHANTIER.map((s) => h('option', { value: s, selected: c.Statut === s }, s)))
    return h('tr', { className: 'tableau-ligne', onClick: () => ouvrirEdition(c) },
      h('td', null,
        h('div', { className: 'tableau-nom' }, c.Nom || 'Sans nom'),
        h('div', { className: 'sous-texte' }, c.Adresse || 'Adresse non renseignée')),
      h('td', null, periode.some(Boolean) ? `${periode[0] || '?'} → ${periode[1] || '?'}` : '—'),
      h('td', { className: 'sous-texte' }, structure),
      h('td', null, h('span', { className: `badge ${c.Actif ? 'badge-resolu' : 'badge-termine'}` }, c.Actif ? 'Oui' : 'Masqué')),
      h('td', null, statut),
      h('td', { className: 'tableau-actions' },
        h('button', { className: 'bouton bouton-compact', onClick: (e) => { e.stopPropagation(); ouvrirEdition(c) } }, 'Modifier'),
        h('button', { className: 'bouton bouton-compact bouton-danger', onClick: (e) => { e.stopPropagation(); ouvrirSuppression(c) } }, 'Supprimer')))
  }

  // ---- Création / modification ----

  // `c` null : nouveau chantier avec sa structure ; sinon modification des informations
  function ouvrirEdition(c) {
    const infos = {
      Nom: c?.Nom ?? '', Adresse: c?.Adresse ?? '', Statut: c?.Statut || 'Nouveau', Actif: c ? Boolean(c.Actif) : true,
      Date_debut: depuisGrist(c?.Date_debut) ?? '', Date_fin: depuisGrist(c?.Date_fin) ?? '', Date_contrat: depuisGrist(c?.Date_contrat) ?? '',
      Samedi_travaille: Boolean(c?.Samedi_travaille), Dimanche_travaille: Boolean(c?.Dimanche_travaille), Prix_casier: c?.Prix_casier ?? null,
    }
    const structure = { zones: [nouvelleZone(1)] }
    const erreur = h('p', { className: 'erreur', hidden: true })
    const valider = h('button', { className: 'bouton bouton-principal', type: 'submit' }, c ? 'Enregistrer' : 'Créer le chantier')

    const champ = (libelle, cle, attributs = {}) => h('label', { className: 'champ-groupe' }, libelle,
      h('input', { className: 'champ', value: infos[cle] ?? '', ...attributs,
        onInput: (e) => { infos[cle] = attributs.type === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value } }))
    const coche = (libelle, cle) => h('label', { className: 'case' },
      h('input', { type: 'checkbox', checked: infos[cle], onChange: (e) => { infos[cle] = e.target.checked } }), libelle)

    const blocInfos = h('div', { className: 'formulaire' },
      champ('Nom du chantier', 'Nom', { required: true, autocomplete: 'off' }),
      champ('Adresse', 'Adresse', { autocomplete: 'off' }),
      h('label', { className: 'champ-groupe' }, 'Statut',
        h('select', { className: 'champ', onChange: (e) => { infos.Statut = e.target.value } },
          STATUTS_CHANTIER.map((s) => h('option', { value: s, selected: infos.Statut === s }, s)))),
      h('div', { className: 'grille-2' },
        champ('Date de début', 'Date_debut', { type: 'date' }),
        champ('Date de fin', 'Date_fin', { type: 'date' }),
        champ('Date de contrat', 'Date_contrat', { type: 'date' }),
        champ('Prix du casier (€)', 'Prix_casier', { type: 'number', min: 0, step: 0.01 })),
      coche('Samedi jour travaillé', 'Samedi_travaille'),
      coche('Dimanche jour travaillé', 'Dimanche_travaille'),
      coche('Visible dans l’application (actif)', 'Actif'))

    const formulaire = h('form', { className: 'formulaire', onSubmit: async (e) => {
      e.preventDefault()
      const probleme = !infos.Nom.trim() ? 'Le nom du chantier est obligatoire.' : c ? null : verifierStructure(structure)
      if (probleme) {
        erreur.textContent = probleme
        erreur.hidden = false
        return
      }
      erreur.hidden = true
      valider.disabled = true
      valider.textContent = c ? 'Enregistrement…' : 'Création…'
      try {
        const donneesInfos = { ...infos, Nom: infos.Nom.trim(), Adresse: infos.Adresse.trim() }
        if (c) await modifierChantier(c.id, donneesInfos)
        else await creerChantier(d, donneesInfos, structure)
        fermer()
        await recharger()
      } catch (err) {
        erreur.textContent = err.message || 'L’enregistrement a échoué.'
        erreur.hidden = false
        valider.disabled = false
        valider.textContent = c ? 'Enregistrer' : 'Créer le chantier'
        recharger() // un nouvel essai partira d'identifiants à jour
      }
    } },
    h('h3', { className: 'titre-section' }, 'Informations'),
    blocInfos,
    !c && h('h3', { className: 'titre-section' }, 'Structure'),
    !c && editeurStructure(structure),
    !c && h('p', { className: 'sous-texte' }, 'La structure d’un chantier existant se complète ensuite dans les tables Grist.'),
    erreur, valider)

    const { fermer, section } = ouvrirPanneau(c ? `Modifier ${c.Nom}` : 'Nouveau chantier', formulaire)
    section.classList.add('panneau-large')
  }

  // ---- Éditeur de structure ----

  function verifierStructure(structure) {
    for (const z of structure.zones) {
      if (!z.nom.trim()) return 'Chaque zone doit avoir un nom.'
      for (const b of z.bases) {
        if (!b.nom.trim()) return 'Chaque base vie doit avoir un nom.'
        for (const e of b.etages) {
          if (!e.nom.trim()) return 'Chaque étage doit avoir un nom.'
          if ([...e.vestiaires, ...e.pieces].some((x) => !x.nom.trim())) return 'Chaque vestiaire et chaque pièce doit avoir un nom.'
          if (e.vestiaires.some((v) => !(Number(v.casiers) >= 0 && Number(v.casiers) <= 500))) return 'Le nombre de casiers doit être entre 0 et 500.'
        }
      }
    }
    return null
  }

  function editeurStructure(structure) {
    const avecZones = !d.absentes.has('Zones')
    const conteneur = h('div', { className: 'structure' })
    const resume = h('p', { className: 'structure-resume' })

    const majResume = () => {
      const bases = structure.zones.flatMap((z) => z.bases)
      const etages = bases.flatMap((b) => b.etages)
      const vestiaires = etages.flatMap((e) => e.vestiaires)
      resume.textContent = [
        avecZones && `${structure.zones.length} zone${structure.zones.length > 1 ? 's' : ''}`,
        `${bases.length} base${bases.length > 1 ? 's' : ''} vie`,
        `${etages.length} étage${etages.length > 1 ? 's' : ''}`,
        `${vestiaires.length} vestiaire${vestiaires.length > 1 ? 's' : ''}`,
        `${vestiaires.reduce((n, v) => n + (Number(v.casiers) || 0), 0)} casiers`,
        `${etages.reduce((n, e) => n + e.pieces.length, 0)} pièces`,
      ].filter(Boolean).join(' · ')
    }

    // Champ texte / nombre / choix relié à obj[cle] ; ne redessine pas (garde le curseur)
    const texte = (obj, cle, libelle, attributs = {}) => h('input', { className: 'champ champ-compact', value: obj[cle], 'aria-label': libelle,
      placeholder: libelle, ...attributs, onInput: (e) => { obj[cle] = attributs.type === 'number' ? Number(e.target.value) : e.target.value; majResume() } })
    const choix = (obj, cle, valeurs, libelle) => h('select', { className: 'champ champ-compact', 'aria-label': libelle, onChange: (e) => { obj[cle] = e.target.value } },
      valeurs.map((v) => h('option', { value: v, selected: obj[cle] === v }, v)))
    // Boutons qui changent la structure : modifient le modèle puis redessinent
    const ajouter = (libelle, fn) => h('button', { className: 'lien-ajout', type: 'button', onClick: () => { fn(); dessiner() } }, `＋ ${libelle}`)
    const retirer = (liste, el, libelle) => liste.length > 1 || libelle === 'vestiaire' || libelle === 'pièce'
      ? h('button', { className: 'retirer', type: 'button', 'aria-label': `Retirer ${libelle}`, onClick: () => { liste.splice(liste.indexOf(el), 1); dessiner() } }, '✕')
      : null

    const blocEtage = (b, e) => h('div', { className: 'niveau niveau-etage' },
      h('div', { className: 'niveau-haut' },
        h('span', { className: 'niveau-type' }, 'Étage'),
        texte(e, 'nom', 'Nom de l’étage'),
        texte(e, 'niveau', 'Niveau', { type: 'number', step: 1, className: 'champ champ-compact champ-niveau' }),
        retirer(b.etages, e, 'étage')),
      e.vestiaires.map((v) => h('div', { className: 'ligne-element' },
        h('span', { className: 'niveau-type' }, 'Vestiaire'),
        texte(v, 'nom', 'Nom du vestiaire'),
        choix(v, 'type', TYPES_VESTIAIRE, 'Type de vestiaire'),
        texte(v, 'casiers', 'Casiers', { type: 'number', min: 0, max: 500, className: 'champ champ-compact champ-niveau' }),
        h('span', { className: 'sous-texte' }, 'casiers'),
        retirer(e.vestiaires, v, 'vestiaire'))),
      e.pieces.map((p) => h('div', { className: 'ligne-element' },
        h('span', { className: 'niveau-type' }, 'Pièce'),
        texte(p, 'nom', 'Nom de la pièce'),
        choix(p, 'type', TYPES_PIECE, 'Type de pièce'),
        retirer(e.pieces, p, 'pièce'))),
      h('div', { className: 'ajouts' },
        ajouter('Vestiaire', () => e.vestiaires.push(nouveauVestiaire())),
        ajouter('Pièce', () => e.pieces.push({ nom: 'WC', type: 'wc' }))))

    const blocBase = (z, b) => h('div', { className: 'niveau niveau-base' },
      h('div', { className: 'niveau-haut' },
        h('span', { className: 'niveau-type' }, 'Base vie'),
        texte(b, 'nom', 'Nom de la base vie'),
        retirer(z.bases, b, 'base vie')),
      b.etages.map((e) => blocEtage(b, e)),
      h('div', { className: 'ajouts' },
        ajouter('Étage', () => b.etages.push(nouvelEtage(Math.max(-1, ...b.etages.map((e) => Number(e.niveau) || 0)) + 1)))))

    const blocZone = (z) => h('div', { className: avecZones ? 'niveau niveau-zone' : '' },
      avecZones && h('div', { className: 'niveau-haut' },
        h('span', { className: 'niveau-type' }, 'Zone'),
        texte(z, 'nom', 'Nom de la zone'),
        retirer(structure.zones, z, 'zone')),
      z.bases.map((b) => blocBase(z, b)),
      h('div', { className: 'ajouts' }, ajouter('Base vie', () => z.bases.push(nouvelleBase(z.bases.length + 1)))))

    function dessiner() {
      conteneur.replaceChildren(...[resume,
        ...structure.zones.map(blocZone),
        avecZones && h('div', { className: 'ajouts' }, ajouter('Zone', () => structure.zones.push(nouvelleZone(structure.zones.length + 1))))].filter(Boolean))
      majResume()
    }
    dessiner()
    return conteneur
  }

  // ---- Suppression ----

  function ouvrirSuppression(c) {
    const contenu = contenuChantier(d, c.id)
    const liste = Object.entries(contenu).filter(([, ids]) => ids.length > 0).map(([t, ids]) => `${ids.length} ${LIBELLES_CONTENU[t]}`)
    const erreur = h('p', { className: 'erreur', hidden: true })
    const confirmer = h('button', { className: 'bouton bouton-danger', disabled: true }, 'Supprimer définitivement')
    const saisie = h('input', { className: 'champ', autocomplete: 'off', 'aria-label': 'Nom du chantier',
      onInput: (e) => { confirmer.disabled = e.target.value.trim() !== String(c.Nom).trim() } })
    const terminer = h('button', { className: 'bouton' }, 'Plutôt passer en « Terminé » et masquer')

    const executer = async (bouton, fn) => {
      bouton.disabled = true
      erreur.hidden = true
      try { await fn(); fermer(); await recharger() } catch (err) {
        erreur.textContent = err.message || 'L’opération a échoué.'
        erreur.hidden = false
        bouton.disabled = false
      }
    }
    confirmer.addEventListener('click', () => executer(confirmer, () => supprimerChantier(d, c.id)))
    terminer.addEventListener('click', () => executer(terminer, () => modifierChantier(c.id, { Statut: 'Terminé', Actif: false })))

    const { fermer } = ouvrirPanneau(`Supprimer ${c.Nom}`, [
      h('p', null, liste.length > 0
        ? `Seront supprimés avec le chantier : ${liste.join(', ')}. L’historique des attributions et des incidents sera perdu.`
        : 'Ce chantier est vide.'),
      h('p', { className: 'sous-texte' }, 'En cas d’erreur, la suppression s’annule dans l’Historique du document Grist.'),
      h('label', { className: 'champ-groupe' }, `Pour confirmer, tape le nom du chantier : ${c.Nom}`, saisie),
      erreur, confirmer, terminer,
    ])
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
