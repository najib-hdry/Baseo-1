// Écran « Gestion des casiers » de l'application Grist
import { h, aujourdhui, enFrancais, ouvrirPanneau } from './outils.js'
import { derniereLiberation, creerEtAttribuer, liberer, horsService, peutGerer } from './donnees.js'
import { cartesChantiers, vueChantier, selectionPourChantier } from './navigation.js'

// Écran « Gestion des casiers », affiché dans `racine` ; `recharger()` relit les données après une écriture
export function creerEcranCasiers(racine, recharger) {
  let d = null

  const etat = { chantierId: null, zoneId: null, baseId: null, etageId: null, vestiaireId: null, filtre: 'tous', vue3d: { rotation: -35, inclinaison: 55 } }

  function rendre() {
    if (!d) return
    if (!etat.chantierId) {
      racine.replaceChildren(...cartesChantiers(d, {
        titre: 'Gestion des casiers',
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
          Object.assign(etat, { filtre: 'tous' }, selectionPourChantier(d, c.id))
          rendre()
        },
      }))
      return
    }
    const chantier = d.parId.Chantiers.get(etat.chantierId)
    racine.replaceChildren(
      h('button', { className: 'retour', onClick: () => { etat.chantierId = null; rendre() } }, '‹ Chantiers'),
      h('h1', null, chantier?.Nom ?? ''),
      ...vueChantier(d, etat, { mode: 'casiers', onCasier: ouvrirCasier, rafraichir: rendre }))
  }

  // ---- Fenêtre d'un casier ----

  function ouvrirCasier(c) {
    const erreur = h('p', { className: 'erreur', hidden: true })
    const corps = h('div', { style: { display: 'grid', gap: '12px' } })
    const titre = c.statut === 'disponible' ? `Affecter le casier n° ${c.Numero}` : `Casier ${c.Numero}`
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

    if (c.statut === 'occupe') corps.append(...blocOccupe(c, executer))
    else if (c.statut === 'disponible') corps.append(...blocLibre(c, executer))
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
      const date = h('input', { className: 'champ', type: 'date', value: aujourdhui(), min: c.dateDebut ?? undefined, max: aujourdhui(), required: true })
      const message = h('p', { className: 'erreur', hidden: true })
      const confirmer = h('button', { className: 'bouton bouton-danger' }, 'Confirmer la libération')
      // Une attribution saisie dans Grist peut ne pas avoir de date de début
      const avantDebut = (v) => c.dateDebut && v < c.dateDebut
      const verifier = () => {
        const v = date.value
        const ok = v && !avantDebut(v) && v <= aujourdhui()
        message.hidden = ok || !v
        message.textContent = avantDebut(v) ? `La date de fin ne peut pas précéder le ${enFrancais(c.dateDebut)}.` : 'La date de fin ne peut pas être dans le futur.'
        confirmer.disabled = !ok
      }
      date.addEventListener('input', verifier)
      confirmer.addEventListener('click', () => executer(confirmer, () => liberer(c.attributionId, date.value)))
      zone.replaceChildren(h('label', { className: 'champ-groupe' }, 'Date de libération', date), message, confirmer)
    })
    zone.append(libererBtn)
    return [
      h('p', { className: 'occupant' }, `${c.prenom} ${c.nom}`),
      h('p', { className: 'sous-texte' }, `${c.entreprise || 'Entreprise non renseignée'}${c.dateDebut ? `, depuis le ${enFrancais(c.dateDebut)}` : ''}`),
      c.employeur && h('p', { className: 'sous-texte' }, `Employeur : ${c.employeur}`),
      c.coffre && h('p', { className: 'sous-texte' }, c.coffre === 'Oui' ? `Coffre : oui, clé n° ${c.cle || 'non renseignée'}` : 'Coffre : non'),
      zone,
    ]
  }

  function blocLibre(c, executer) {
    const dateMin = derniereLiberation(d, c.id)
    const date = h('input', { className: 'champ', type: 'date', value: aujourdhui(), min: dateMin ?? undefined, max: aujourdhui(), required: true })
    const messageDate = h('p', { className: 'erreur', hidden: true })
    const dateValide = () => date.value && date.value <= aujourdhui() && (!dateMin || date.value >= dateMin)
    const zone = h('div', { style: { display: 'grid', gap: '12px' } })

    const majDate = () => {
      messageDate.hidden = dateValide() || !date.value
      messageDate.textContent = dateMin
        ? `La date doit être comprise entre le ${enFrancais(dateMin)} (dernière libération) et aujourd’hui.`
        : 'La date ne peut pas être dans le futur.'
      zone.querySelectorAll('[data-attribue]').forEach((b) => { b.disabled = !dateValide() })
    }
    date.addEventListener('input', majDate)

    // Attribution : on saisit toujours un nouvel intervenant (pas de recherche)
    const form = { prenom: '', nom: '', entreprise: '', badge: '', employeur: 0, coffre: 'Non', cle: '' }
    const champ = (cle, libelle, extra) => h('label', { className: 'champ-groupe' }, libelle,
      h('input', { className: 'champ', autocomplete: 'off', ...extra, onInput: (e) => { form[cle] = e.target.value } }))
    const liste = h('datalist', { id: 'liste-entreprises' }, d.Entreprises.map((e) => h('option', { value: e.Nom })))
    // Employeur : référence vers la table Sous_traitants (0 = aucun)
    const employeur = h('label', { className: 'champ-groupe' }, 'Employeur (facultatif)',
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
    champ('badge', 'N° de badge (facultatif)'),
    champ('entreprise', 'Entreprise (facultatif)', { list: 'liste-entreprises' }), liste,
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

  return {
    // affiche l'écran avec des données à jour
    afficher(donnees) {
      d = donnees
      if (etat.chantierId && !d.parId.Chantiers.has(etat.chantierId)) etat.chantierId = null
      rendre()
    },
    // revient à la liste des chantiers
    accueil() {
      etat.chantierId = null
      rendre()
    },
  }
}
