// Écran « Gestion des casiers » de l'application Grist
import { h, aujourdhui, enFrancais, ouvrirPanneau, depuisGrist, versGrist, fenetreSuppression } from './outils.js'
import { derniereLiberation, creerEtAttribuer, liberer, horsService, peutGerer, peutModifier, ROLE_CLIENT, estAdmin, enregistrerLigne, supprimerFiche } from './donnees.js'
import { cartesChantiers, vueChantier, selectionPourChantier } from './navigation.js'
import { historiqueCasiers } from './historique_casiers.js'

// Onglet « Historique » des attributions : Admin et Client seulement
const voitHistoriqueCasiers = (d) => ['Admin', ROLE_CLIENT].includes(d.moi?.profil)

// Écran « Gestion des casiers », affiché dans `racine` ; `recharger()` relit les données après une écriture
export function creerEcranCasiers(racine, recharger) {
  let d = null

  const etat = { chantierId: null, zoneId: null, baseId: null, etageId: null, vestiaireId: null, filtre: 'tous', vue3d: { rotation: -35, inclinaison: 55 },
    onglet: 'casiers', historique: { statut: 'tous', recherche: '', du: '', au: '' } }

  function rendre() {
    if (!d) return
    if (!etat.chantierId) {
      racine.replaceChildren(...cartesChantiers(d, {
        stats: (c) => {
          const casiers = d.Casiers.filter((k) => k.Chantier === c.id)
          const hs = casiers.filter((k) => k.Hors_service).length
          const occupes = casiers.filter((k) => !k.Hors_service && d.activeParCasier.has(k.id)).length
          return [
            { type: 'total', valeur: casiers.length, libelle: 'Total' },
            { type: 'libres', valeur: casiers.length - hs - occupes, libelle: 'Libres' },
            { type: 'occupes', valeur: occupes, libelle: 'Occupés' },
            { type: 'hs', valeur: hs, libelle: 'HS' },
          ]
        },
        jauge: (c) => {
          const casiers = d.Casiers.filter((k) => k.Chantier === c.id)
          return casiers.length ? casiers.filter((k) => d.activeParCasier.has(k.id)).length / casiers.length : 0
        },
        onOuvrir: (c) => {
          Object.assign(etat, { filtre: 'tous', onglet: 'casiers', historique: { statut: 'tous', recherche: '', du: '', au: '' } }, selectionPourChantier(d, c.id))
          rendre()
        },
      }))
      return
    }
    const chantier = d.parId.Chantiers.get(etat.chantierId)
    const historique = voitHistoriqueCasiers(d) && etat.onglet === 'historique'
    racine.replaceChildren(...[
      // Retour et nom du chantier sur une même ligne
      h('div', { className: 'entete-chantier' },
        h('button', { className: 'retour', onClick: () => { etat.chantierId = null; rendre() } }, '‹ Chantiers'),
        h('h1', null, chantier?.Nom ?? '')),
      voitHistoriqueCasiers(d) && h('div', { className: 'onglets onglets-statut', role: 'tablist', 'aria-label': 'Casiers du chantier' },
        [['casiers', 'Casiers'], ['historique', 'Historique']].map(([cle, libelle]) => h('button', { className: 'onglet', role: 'tab',
          'aria-selected': String(etat.onglet === cle), onClick: () => { etat.onglet = cle; rendre() } }, libelle))),
      ...(historique ? [historiqueCasiers(d, etat.chantierId, etat.historique,
        estAdmin(d) ? { modifier: ouvrirModifAttribution, supprimer: supprimerAttribution } : null)]
        : vueChantier(d, etat, { mode: 'casiers', onCasier: ouvrirCasier, rafraichir: rendre })),
    ].filter(Boolean))
  }

  // ---- Fenêtre d'un casier ----

  function ouvrirCasier(c) {
    const erreur = h('p', { className: 'erreur', hidden: true })
    const corps = h('div', { style: { display: 'grid', gap: '12px' } })
    const titre = c.statut === 'disponible' && peutModifier(d, 'casiers') ? `Affecter le casier n° ${c.Numero}` : `Casier ${c.Numero}`
    const { fermer } = ouvrirPanneau(titre, [corps, erreur])

    // Exécute une écriture Grist : attente, erreur ou fermeture + rechargement
    const executer = async (bouton, fn) => {
      erreur.hidden = true
      bouton.disabled = true
      try {
        await fn()
        fermer()
        await recharger()
      } catch (e) {
        erreur.textContent = e.message || 'L’opération a échoué.'
        erreur.hidden = false
        bouton.disabled = false
        recharger() // un nouvel essai partira de données à jour
      }
    }

    // Lecture (Client) : l'occupant ou « libre », sans attribution ni libération
    if (c.statut === 'occupe') corps.append(...blocOccupe(c, executer))
    else if (c.statut === 'disponible') corps.append(...(peutModifier(d, 'casiers') ? blocLibre(c, executer) : [h('p', { className: 'message' }, 'Ce casier est libre.')]))
    else {
      corps.append(h('p', { className: 'message' }, 'Ce casier est signalé hors service.'))
      if (peutGerer(d)) {
        const bouton = h('button', { className: 'bouton bouton-principal' }, 'Remettre en service')
        bouton.addEventListener('click', () => executer(bouton, () => horsService(d, c.id, false)))
        corps.append(bouton)
      }
    }
  }

  function blocOccupe(c, executer) {
    const zone = h('div', { style: { display: 'grid', gap: '12px' } })
    const libererBtn = h('button', { className: 'bouton' }, 'Libérer le casier')
    libererBtn.addEventListener('click', () => {
      // Attribution qui commence dans le futur : on peut la clore à sa date de début
      const dateMax = c.dateDebut && c.dateDebut > aujourdhui() ? c.dateDebut : aujourdhui()
      const date = h('input', { className: 'champ', type: 'date', value: dateMax, min: c.dateDebut ?? undefined, max: dateMax, required: true })
      const message = h('p', { className: 'erreur', hidden: true })
      const confirmer = h('button', { className: 'bouton bouton-danger' }, 'Confirmer la libération')
      // Une attribution saisie dans Grist peut ne pas avoir de date de début
      const avantDebut = (v) => c.dateDebut && v < c.dateDebut
      const verifier = () => {
        const v = date.value
        const ok = v && !avantDebut(v) && v <= dateMax
        message.hidden = ok || !v
        message.textContent = avantDebut(v) ? `La date de fin ne peut pas précéder le ${enFrancais(c.dateDebut)}.` : 'La date de fin ne peut pas être dans le futur.'
        confirmer.disabled = !ok
      }
      date.addEventListener('input', verifier)
      confirmer.addEventListener('click', () => executer(confirmer, () => liberer(c.attributionId, date.value)))
      zone.replaceChildren(h('label', { className: 'champ-groupe' }, 'Date de libération', date), message, confirmer)
    })
    if (peutModifier(d, 'casiers')) zone.append(libererBtn)
    return [
      h('p', { className: 'occupant' }, `${c.prenom} ${c.nom}`),
      h('p', { className: 'sous-texte' }, `${c.entreprise || 'Entreprise non renseignée'}${c.dateDebut ? `, ${c.dateDebut > aujourdhui() ? 'à partir du' : 'depuis le'} ${enFrancais(c.dateDebut)}` : ''}`),
      c.employeur && h('p', { className: 'sous-texte' }, `Employeur : ${c.employeur}`),
      c.coffre && h('p', { className: 'sous-texte' }, c.coffre === 'Oui' ? `Coffre : oui, clé n° ${c.cle || 'non renseignée'}` : 'Coffre : non'),
      zone,
    ]
  }

  function blocLibre(c, executer) {
    const dateMin = derniereLiberation(d, c.id)
    // Date de début : aujourd'hui, ou plus tard pour réserver le casier à l'avance
    const date = h('input', { className: 'champ', type: 'date', value: aujourdhui(), min: dateMin ?? undefined, required: true })
    const messageDate = h('p', { className: 'erreur', hidden: true })
    const dateValide = () => date.value && (!dateMin || date.value >= dateMin)
    const zone = h('div', { style: { display: 'grid', gap: '12px' } })

    const majDate = () => {
      messageDate.hidden = dateValide() || !date.value
      messageDate.textContent = `La date ne peut pas précéder le ${enFrancais(dateMin)} (dernière libération).`
      zone.querySelectorAll('[data-attribue]').forEach((b) => { b.disabled = !dateValide() })
    }
    date.addEventListener('input', majDate)

    // Attribution : on saisit toujours un nouvel intervenant (pas de recherche)
    const form = { prenom: '', nom: '', entreprise: '', badge: '', employeur: 0, coffre: 'Non', cle: '' }
    const champ = (cle, libelle, extra) => h('label', { className: 'champ-groupe' }, libelle,
      h('input', { className: 'champ', autocomplete: 'off', ...extra, onInput: (e) => { form[cle] = e.target.value } }))
    const liste = h('datalist', { id: 'liste-entreprises' }, d.Entreprises.map((e) => h('option', { value: e.Nom })))
    // Employeur : référence vers la table Sous_traitants (0 = aucun)
    const employeur = h('label', { className: 'champ-groupe' }, 'Employeur',
      h('select', { className: 'champ', onChange: (e) => { form.employeur = Number(e.target.value) || 0 } },
        h('option', { value: '0' }, '—'),
        [...d.Sous_traitants].sort((a, b) => String(a.Nom).localeCompare(String(b.Nom)))
          .map((s) => h('option', { value: String(s.id) }, s.Nom || 'Sans nom'))))
    // Numéro de clé : demandé seulement s'il y a un coffre
    const saisieCle = h('input', { className: 'champ', autocomplete: 'off', onInput: (e) => { form.cle = e.target.value } })
    const cle = h('label', { className: 'champ-groupe', hidden: true }, 'Si oui, entrez le numéro de clé', saisieCle)
    const coffre = h('label', { className: 'champ-groupe' }, 'Y a-t-il un coffre ?',
      h('select', { className: 'champ', onChange: (e) => {
        form.coffre = e.target.value
        cle.hidden = form.coffre !== 'Oui'
        saisieCle.required = form.coffre === 'Oui'
      } }, ['Non', 'Oui'].map((v) => h('option', { value: v }, v.toUpperCase()))))
    const valider = h('button', { className: 'bouton bouton-principal', type: 'submit', 'data-attribue': '', disabled: !dateValide() },
      `Affecter le casier n° ${c.Numero}`)
    const formulaire = h('form', { className: 'formulaire', onSubmit: (e) => {
      e.preventDefault()
      if (!form.prenom.trim() || !form.nom.trim()) return
      executer(valider, () => creerEtAttribuer(d, c.id, form, date.value))
    } },
    h('label', { className: 'champ-groupe' }, 'Date d’attribution', date), messageDate,
    champ('prenom', 'Prénom', { required: true }),
    champ('nom', 'Nom', { required: true }),
    champ('badge', 'N° de badge'),
    champ('entreprise', 'Entreprise', { list: 'liste-entreprises' }), liste,
    employeur, coffre, cle,
    valider)
    zone.replaceChildren(formulaire)
    if (peutGerer(d)) {
      const hs = h('button', { className: 'bouton' }, 'Signaler hors service')
      hs.addEventListener('click', () => executer(hs, () => horsService(d, c.id, true)))
      zone.append(hs)
    }

    return [zone]
  }

  // ---- Historique (Admin) : modifier ou supprimer une attribution ----

  // Autre attribution du même casier qui chevaucherait [debut, fin] (fin vide = toujours en cours) ;
  // une attribution peut commencer le jour où la précédente se termine
  function chevauchement(a, debut, fin) {
    return d.Attributions.find((b) => b.id !== a.id && b.Casier === a.Casier
      && debut < (depuisGrist(b.Date_fin) ?? '9999-12-31') && (depuisGrist(b.Date_debut) ?? '0000-01-01') < (fin || '9999-12-31'))
  }

  function ouvrirModifAttribution(a) {
    const i = d.parId.Intervenants.get(a.Intervenant)
    const casier = d.parId.Casiers.get(a.Casier)
    const champs = { debut: depuisGrist(a.Date_debut) ?? '', fin: depuisGrist(a.Date_fin) ?? '', coffre: a.Coffre === 'Oui' ? 'Oui' : 'Non', cle: a.Numero_cle ?? '', commentaire: a.Commentaire ?? '' }
    const erreur = h('p', { className: 'erreur', hidden: true })
    const valider = h('button', { className: 'bouton bouton-principal', type: 'submit' }, 'Enregistrer')
    const saisieCle = h('input', { className: 'champ', autocomplete: 'off', value: champs.cle, onInput: (e) => { champs.cle = e.target.value } })
    const cle = h('label', { className: 'champ-groupe', hidden: champs.coffre !== 'Oui' }, 'Numéro de clé', saisieCle)
    const date = (col, libelle, extra) => h('label', { className: 'champ-groupe' }, libelle,
      h('input', { className: 'champ', type: 'date', value: champs[col], ...extra, onInput: (e) => { champs[col] = e.target.value } }))

    const formulaire = h('form', { className: 'formulaire', onSubmit: async (ev) => {
      ev.preventDefault()
      erreur.hidden = true
      const autre = chevauchement(a, champs.debut, champs.fin)
      const message = !champs.debut ? 'La date de début est obligatoire.'
        : champs.fin && champs.fin < champs.debut ? 'La date de fin ne peut pas précéder la date de début.'
          : autre ? `Ces dates chevauchent une autre attribution de ce casier (du ${enFrancais(depuisGrist(autre.Date_debut)) || '?'}${autre.Date_fin ? ` au ${enFrancais(depuisGrist(autre.Date_fin))}` : ', toujours en cours'}).`
            : null
      if (message) { erreur.textContent = message; erreur.hidden = false; return }
      valider.disabled = true
      try {
        await enregistrerLigne('Attributions', a.id, { Date_debut: versGrist(champs.debut), Date_fin: versGrist(champs.fin), Coffre: champs.coffre,
          Numero_cle: champs.coffre === 'Oui' ? champs.cle.trim() : '', Commentaire: champs.commentaire.trim() })
        fermer()
        await recharger()
      } catch (err) {
        erreur.textContent = err.message || 'L’enregistrement a échoué.'
        erreur.hidden = false
        valider.disabled = false
      }
    } },
    h('p', { className: 'sous-texte' }, `${[i?.Prenom, i?.Nom].filter(Boolean).join(' ') || 'Intervenant'} · casier ${casier?.Numero ?? '?'}`),
    h('div', { className: 'grille-2' },
      date('debut', 'Date de début', { required: true }),
      date('fin', 'Date de fin (vide = toujours en cours)')),
    h('label', { className: 'champ-groupe' }, 'Y a-t-il un coffre ?',
      h('select', { className: 'champ', onChange: (e) => { champs.coffre = e.target.value; cle.hidden = champs.coffre !== 'Oui' } },
        ['Non', 'Oui'].map((v) => h('option', { value: v, selected: v === champs.coffre }, v.toUpperCase())))),
    cle,
    h('label', { className: 'champ-groupe' }, 'Commentaire',
      h('textarea', { className: 'champ', rows: 3, onInput: (e) => { champs.commentaire = e.target.value } }, champs.commentaire)),
    erreur, valider)
    const { fermer } = ouvrirPanneau('Modifier l’attribution', formulaire)
  }

  function supprimerAttribution(a) {
    const i = d.parId.Intervenants.get(a.Intervenant)
    const casier = d.parId.Casiers.get(a.Casier)
    const debut = enFrancais(depuisGrist(a.Date_debut)) || '?'
    fenetreSuppression('Supprimer cette attribution ?',
      `${[i?.Prenom, i?.Nom].filter(Boolean).join(' ') || 'Intervenant'} · casier ${casier?.Numero ?? '?'} · du ${debut}${a.Date_fin ? ` au ${enFrancais(depuisGrist(a.Date_fin))}` : ''}. `
        + (a.Date_fin ? 'Elle disparaîtra de l’historique.' : 'Elle est en cours : le casier redeviendra libre, et elle disparaîtra de l’historique.')
        + ' Pour garder une trace, préfère « Modifier » et une date de fin.',
      [['Supprimer', 'bouton-danger', () => supprimerFiche('Attributions', a.id)]], recharger)
  }

  return {
    // affiche l'écran avec des données à jour
    afficher(donnees) {
      d = donnees
      if (etat.chantierId && !d.parId.Chantiers.has(etat.chantierId)) etat.chantierId = null
      rendre()
    },
    // revient à la liste des chantiers
    // revient à la liste des chantiers, ou ouvre directement `chantierId` (tuile du Tableau de bord)
    accueil({ chantierId } = {}) {
      etat.chantierId = null
      if (chantierId && d?.parId.Chantiers.has(chantierId)) Object.assign(etat, { filtre: 'tous' }, selectionPourChantier(d, chantierId))
      rendre()
    },
  }
}
