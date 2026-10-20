// Écran « Gestion des candidats » (admin) : tableau des candidats avec recherche, et formulaire
// « Ajouter un candidat » en blocs (le même sert à modifier un candidat), fiche détail en lecture, suppression.
// Les 45 colonnes de la table ne tiennent pas dans un tableau : on affiche les plus utiles pour repérer et contacter.
import { h, depuisGrist, enFrancais, versGrist, euros, ouvrirPanneau, reduirePhoto, icone, etiqueterLignes } from './outils.js'
import { envoyerPhoto, enregistrerCandidat, supprimerCandidat, lienPhotos } from './donnees.js'

const TITRES_CANDIDATS = ['Candidat', 'Nationalité', 'Téléphone', 'Email', 'Poste', 'CIP responsable', 'Pass IAE', 'France Travail', '']

const OUI_NON = ['Oui', 'Non']
const NIVEAUX_LANGUE = ['Aucun', 'Débutant', 'Intermédiaire', 'Courant', 'Langue maternelle']

/**
 * Blocs du formulaire, deux par ligne, dans l'ordre des colonnes Grist.
 * Champ : [colonne, libellé, type, options] ; types : texte, long, date, tel, email, nombre, choix (options = valeurs),
 * ref (options = [table, colonne affichée]), photo, fichier.
 */
const BLOCS_CANDIDAT = [
  ['Informations personnelles', [
    ['Prenom', 'Prénom', 'texte'], ['Nom', 'Nom', 'texte'], ['Date_naissance', 'Date de naissance', 'date'],
    ['Nationalite', 'Nationalité', 'ref', ['Nationalites', 'Nationalite']], ['Telephone', 'Téléphone', 'tel'], ['Email', 'Email', 'email'],
  ]],
  ['Situation administrative', [
    ['Numero_securite_sociale', 'Numéro de sécurité sociale', 'texte'], ['Date_validite_titre_sejour', 'Date validité titre de séjour', 'date'],
    ['CMU', 'CMU', 'choix', OUI_NON], ['RQTH', 'RQTH', 'choix', OUI_NON],
    ['Pass_IAE_debut', 'Pass IAE date début', 'date'], ['Pass_IAE_fin', 'Pass IAE date fin', 'date'],
  ]],
  ['France Travail', [
    ['Inscrit_France_Travail', 'Inscrit à France Travail ?', 'choix', OUI_NON], ['Numero_allocataire_FT', 'Numéro d’allocataire France Travail', 'texte'],
    ['Conseiller_FT_prenom', 'Prénom du conseiller', 'texte'], ['Conseiller_FT_nom', 'Nom du conseiller', 'texte'],
    ['Conseiller_FT_telephone', 'Téléphone du conseiller', 'tel'], ['Conseiller_FT_email', 'Email du conseiller', 'email'],
  ]],
  ['Prescripteur', [
    ['Prescripteur', 'Prescripteur', 'choix', ['France Travail', 'Mission locale', 'Cap emploi', 'Département (RSA)', 'CCAS', 'Structure d’insertion (SIAE)', 'Association', 'Autre']],
    ['Prescripteur_nom', 'Nom du prescripteur', 'texte'], ['Prescripteur_prenom', 'Prénom du prescripteur', 'texte'],
    ['Prescripteur_telephone', 'Téléphone du prescripteur', 'tel'], ['Prescripteur_email', 'Email du prescripteur', 'email'],
  ]],
  ['Accompagnement social', [
    ['Assistant_social', 'Assistant social', 'choix', OUI_NON],
    ['Referent_social_prenom', 'Prénom du référent ou de l’assistant social', 'texte'], ['Referent_social_nom', 'Nom du référent ou de l’assistant social', 'texte'],
    ['Referent_social_telephone', 'Téléphone du référent ou de l’assistant social', 'tel'], ['Referent_social_email', 'Email du référent ou de l’assistant social', 'email'],
  ]],
  ['Logement', [
    ['Situation_logement', 'Logement ou hébergé(e) chez quelqu’un ?', 'choix', ['Logement personnel', 'Hébergé(e) chez quelqu’un', 'Hébergement d’urgence ou foyer', 'Sans domicile', 'Autre']],
    ['Demande_logement', 'Une demande de logement a-t-elle été effectuée ?', 'choix', OUI_NON], ['Demande_logement_par', 'Si oui, par qui ?', 'texte'],
  ]],
  ['Ressources', [
    ['Ressource', 'Ressource', 'choix', ['RSA', 'ARE (allocation chômage)', 'ASS', 'AAH', 'Salaire', 'Prime d’activité', 'Aucune', 'Autre']],
    ['Ressource_montant', 'Montant (€)', 'nombre'], ['Ressource_origine', 'Origine des ressources', 'texte'],
  ]],
  ['Parcours / Formation', [
    ['Formation', 'Formation', 'texte'], ['Diplome', 'Diplôme', 'texte'], ['Experiences', 'Expériences', 'long'],
  ]],
  ['Niveau de langue', [
    ['Francais_oral', 'Niveau de français oral', 'choix', NIVEAUX_LANGUE], ['Francais_ecrit', 'Niveau de français écrit', 'choix', NIVEAUX_LANGUE],
  ]],
  ['Autres', [
    ['Composition_famille', 'Composition de famille', 'texte'], ['Autres', 'Autres', 'long'],
  ]],
  ['CIP responsable', [['CIP_responsable', 'CIP responsable', 'ref', ['Utilisateurs', 'Nom']]]],
  ['Poste', [['Poste', 'Poste', 'ref', ['Postes', 'Titre']]]],
  ['Photo', [['Photo', 'Photo', 'photo']]],
  ['CV', [['CV', 'CV', 'fichier']]],
]

// Âge en années à partir d'une date ISO (AAAA-MM-JJ)
function age(iso) {
  if (!iso) return null
  const [a, m, j] = iso.split('-').map(Number)
  const auj = new Date()
  return auj.getFullYear() - a - (auj.getMonth() + 1 < m || (auj.getMonth() + 1 === m && auj.getDate() < j) ? 1 : 0)
}

// Écran affiché dans `racine` ; `recharger()` relit les données après une écriture
export function creerEcranCandidats(racine, recharger) {
  let d = null
  let recherche = ''

  const nom = (c) => [c.Prenom, c.Nom].filter(Boolean).join(' ') || 'Sans nom'
  const nationalite = (c) => d.parId.Nationalites.get(c.Nationalite)?.Nationalite ?? ''
  const poste = (c) => d.parId.Postes.get(c.Poste)?.Titre ?? ''
  const cip = (c) => d.parId.Utilisateurs.get(c.CIP_responsable)?.Nom ?? ''
  const passIae = (c) => {
    const [debut, fin] = [depuisGrist(c.Pass_IAE_debut), depuisGrist(c.Pass_IAE_fin)].map(enFrancais)
    return debut || fin ? `${debut || '?'} → ${fin || '?'}` : ''
  }

  function rendre() {
    if (!d) return
    if (d.moi?.profil !== 'Admin') {
      racine.replaceChildren(h('h1', null, 'Gestion des candidats'), h('p', { className: 'message' }, 'Page réservée aux administrateurs.'))
      return
    }
    if (d.absentes.has('Candidats')) {
      racine.replaceChildren(h('h1', null, 'Gestion des candidats'), h('p', { className: 'message' }, 'Ce document n’a pas de table Candidats.'))
      return
    }
    const corps = h('tbody')
    const compteur = h('p', { className: 'sous-texte' })
    // Ne redessine que les lignes : le champ de recherche garde le curseur
    const dessinerLignes = () => {
      const filtre = recherche.trim().toLowerCase()
      const liste = d.Candidats
        .filter((c) => !filtre || [nom(c), nationalite(c), c.Telephone, c.Email, poste(c), cip(c)].some((v) => String(v ?? '').toLowerCase().includes(filtre)))
        .sort((a, b) => String(a.Nom).localeCompare(String(b.Nom)) || String(a.Prenom).localeCompare(String(b.Prenom)))
      compteur.textContent = `${liste.length} candidat${liste.length > 1 ? 's' : ''}${filtre ? ` sur ${d.Candidats.length}` : ''}`
      corps.replaceChildren(...(liste.length === 0
        ? [h('tr', null, h('td', { className: 'tableau-vide', colSpan: TITRES_CANDIDATS.length }, filtre ? 'Aucun candidat ne correspond.' : 'Aucun candidat pour l’instant.'))]
        : liste.map((c) => {
          const naissance = depuisGrist(c.Date_naissance)
          return h('tr', { className: 'tableau-ligne', title: 'Voir la fiche du candidat', onClick: () => ouvrirFiche(c) },
            h('td', null,
              h('div', { className: 'tableau-nom' }, nom(c)),
              naissance && h('div', { className: 'sous-texte' }, `${enFrancais(naissance)} · ${age(naissance)} ans`)),
            h('td', null, nationalite(c)),
            h('td', null, c.Telephone ? h('a', { href: `tel:${c.Telephone}`, onClick: (e) => e.stopPropagation() }, c.Telephone) : ''),
            h('td', null, c.Email ? h('a', { href: `mailto:${c.Email}`, onClick: (e) => e.stopPropagation() }, c.Email) : ''),
            h('td', null, poste(c)),
            h('td', null, cip(c)),
            h('td', null, passIae(c)),
            h('td', null, c.Inscrit_France_Travail ?? ''),
            h('td', { className: 'tableau-actions' },
              h('button', { className: 'bouton bouton-compact', onClick: (e) => { e.stopPropagation(); ouvrirFormulaire(c) } }, 'Modifier'),
              h('button', { className: 'bouton bouton-compact bouton-danger', onClick: (e) => { e.stopPropagation(); ouvrirSuppression(c) } }, 'Supprimer')))
        })))
      etiqueterLignes(corps, TITRES_CANDIDATS)
    }
    dessinerLignes()
    racine.replaceChildren(
      h('h1', null, 'Gestion des candidats'),
      h('div', { className: 'barre-outils' },
        h('input', { className: 'champ champ-compact', type: 'search', placeholder: 'Rechercher (nom, nationalité, téléphone, email, poste, CIP…)', value: recherche,
          'aria-label': 'Rechercher un candidat', onInput: (e) => { recherche = e.target.value; dessinerLignes() } }),
        h('button', { className: 'bouton bouton-principal bouton-compact', onClick: () => ouvrirFormulaire(null) }, '＋ Ajouter un candidat')),
      compteur,
      h('div', { className: 'tableau-defilant' },
        h('table', { className: 'tableau' },
          h('thead', null, h('tr', null, TITRES_CANDIDATS.map((t) => h('th', null, t)))),
          corps)))
  }

  // ---- Formulaire : ajout (`c` null) ou modification d'un candidat ----

  function ouvrirFormulaire(c) {
    const valeurs = {} // saisies en cours, au format du formulaire (texte, ISO, nombre, identifiant)
    const fichiers = {} // fichiers choisis, par colonne
    const erreur = h('p', { className: 'erreur', hidden: true })
    const valider = h('button', { className: 'bouton bouton-principal', type: 'submit' }, c ? 'Enregistrer les modifications' : 'Ajouter le candidat')

    // `seul` : unique champ d'un bloc portant le même nom → libellé masqué (le titre du bloc suffit), gardé pour les lecteurs d'écran
    const champ = ([col, libelle, type, options], seul = false) => {
      const etiquette = seul ? h('span', { className: 'visuellement-cache' }, libelle) : libelle
      const brut = c?.[col]
      const maj = (v) => { valeurs[col] = v }
      let saisie
      if (type === 'date') {
        valeurs[col] = depuisGrist(brut) ?? ''
        saisie = h('input', { className: 'champ', type: 'date', value: valeurs[col], onInput: (e) => maj(e.target.value) })
      } else if (type === 'choix') {
        valeurs[col] = brut ?? ''
        saisie = h('select', { className: 'champ', onChange: (e) => maj(e.target.value) },
          h('option', { value: '', selected: !valeurs[col] }, '-- Choisissez --'),
          options.map((v) => h('option', { value: v, selected: valeurs[col] === v }, v)))
      } else if (type === 'ref') {
        const [table, affichage] = options
        valeurs[col] = Number(brut) || 0
        const lignes = [...(d[table] ?? [])].sort((a, b) => String(a[affichage]).localeCompare(String(b[affichage])))
        saisie = h('select', { className: 'champ', onChange: (e) => maj(Number(e.target.value) || 0) },
          h('option', { value: '0', selected: !valeurs[col] }, '-- Choisissez --'),
          lignes.map((r) => h('option', { value: String(r.id), selected: r.id === valeurs[col] }, r[affichage] || 'Sans nom')))
      } else if (type === 'nombre') {
        valeurs[col] = brut ?? ''
        saisie = h('input', { className: 'champ', type: 'number', min: 0, step: 0.01, value: valeurs[col], onInput: (e) => maj(e.target.value) })
      } else if (type === 'long') {
        valeurs[col] = brut ?? ''
        saisie = h('textarea', { className: 'champ champ-texte', value: valeurs[col], onInput: (e) => maj(e.target.value) })
      } else if (type === 'photo' || type === 'fichier') {
        const nom = h('span', { className: 'sous-texte' },
          Array.isArray(brut) && brut.length > 1 ? 'Un fichier est déjà enregistré ; en choisir un autre le remplace.' : 'Ou glissez et déposez votre fichier ici')
        const entree = h('input', { type: 'file', hidden: true, accept: type === 'photo' ? 'image/*' : '.pdf,.doc,.docx,.odt,image/*',
          onChange: (e) => { fichiers[col] = e.target.files?.[0] ?? null; nom.textContent = fichiers[col] ? fichiers[col].name : nom.textContent } })
        const zone = h('label', { className: 'zone-fichier',
          onDragover: (e) => { e.preventDefault(); zone.classList.add('survol') },
          onDragleave: () => zone.classList.remove('survol'),
          onDrop: (e) => { e.preventDefault(); zone.classList.remove('survol'); const f = e.dataTransfer.files?.[0]; if (f) { fichiers[col] = f; nom.textContent = f.name } } },
        h('span', { className: 'bouton bouton-compact' }, 'Importer un fichier'), nom, entree)
        return h('div', { className: 'champ-groupe' }, etiquette, zone)
      } else {
        valeurs[col] = brut ?? ''
        saisie = h('input', { className: 'champ', autocomplete: 'off', type: type === 'tel' ? 'tel' : type === 'email' ? 'email' : 'text',
          required: col === 'Prenom' || col === 'Nom', value: valeurs[col], onInput: (e) => maj(e.target.value) })
      }
      return h('label', { className: 'champ-groupe' }, etiquette, saisie)
    }

    // Saisies → colonnes Grist : dates en secondes, montant en nombre, textes nettoyés, références en identifiant
    const versColonnes = () => Object.fromEntries(BLOCS_CANDIDAT.flatMap(([, champs]) => champs)
      .filter(([, , type]) => type !== 'photo' && type !== 'fichier')
      .map(([col, , type]) => {
        const v = valeurs[col]
        if (type === 'date') return [col, versGrist(v)]
        if (type === 'nombre') return [col, v === '' || v == null ? null : Number(v)]
        if (type === 'ref') return [col, v || 0]
        return [col, typeof v === 'string' ? v.trim() : v]
      }))

    const formulaire = h('form', { className: 'formulaire', onSubmit: async (e) => {
      e.preventDefault()
      erreur.hidden = true
      if (!String(valeurs.Prenom ?? '').trim() || !String(valeurs.Nom ?? '').trim()) {
        erreur.textContent = 'Le prénom et le nom sont obligatoires.'
        erreur.hidden = false
        return
      }
      valider.disabled = true
      valider.textContent = 'Enregistrement…'
      try {
        const champs = versColonnes()
        // Fichiers : un nouveau fichier remplace l'ancien ; sans nouveau fichier, l'ancien reste
        for (const [col, f] of Object.entries(fichiers)) {
          if (!f) continue
          const id = col === 'Photo' && f.type.startsWith('image/') ? await envoyerPhoto(await reduirePhoto(f)) : await envoyerPhoto(f, f.name)
          champs[col] = ['L', id]
        }
        await enregistrerCandidat(c?.id ?? null, champs)
        fermer()
        await recharger()
      } catch (err) {
        erreur.textContent = err.message || 'L’enregistrement a échoué.'
        erreur.hidden = false
        valider.disabled = false
        valider.textContent = c ? 'Enregistrer les modifications' : 'Ajouter le candidat'
      }
    } },
    h('div', { className: 'blocs-candidat' },
      BLOCS_CANDIDAT.map(([titre, champs]) => h('section', { className: 'bloc-candidat' }, h('h3', null, titre),
        champs.map((f) => champ(f, champs.length === 1 && f[1] === titre))))),
    erreur,
    h('div', { className: 'fiche-actions' }, valider))

    const titre = h('span', { className: 'titre-formulaire' }, h('span', { className: 'titre-icone' }, icone('occupes', 22)),
      c ? `${[c.Prenom, c.Nom].filter(Boolean).join(' ') || 'Candidat'}` : 'Ajouter un candidat')
    const { fermer, section } = ouvrirPanneau(titre, formulaire)
    section.classList.add('panneau-large', 'panneau-fiche', 'panneau-candidat')
  }

  // ---- Fiche détail (lecture) ----

  // Valeur lisible d'un champ selon son type ; vide → tiret
  function valeurLisible(c, [col, , type, options], lien) {
    const v = c[col]
    if (type === 'date') return enFrancais(depuisGrist(v)) || '—'
    if (type === 'ref') return d[options[0]] ? d.parId[options[0]].get(v)?.[options[1]] || '—' : '—'
    if (type === 'nombre') return v != null && v !== '' ? euros.format(v) : '—'
    if (type === 'tel') return v ? h('a', { href: `tel:${v}` }, v) : '—'
    if (type === 'email') return v ? h('a', { href: `mailto:${v}` }, v) : '—'
    if (type === 'photo' || type === 'fichier') {
      const id = Array.isArray(v) ? v.find((x) => x !== 'L') : null
      if (!id) return '—'
      if (!lien) return 'Fichier enregistré'
      return type === 'photo'
        ? h('a', { href: lien(id), target: '_blank', rel: 'noreferrer' }, h('img', { className: 'photo-candidat', src: lien(id), alt: 'Photo du candidat' }))
        : h('a', { href: lien(id), target: '_blank', rel: 'noreferrer' }, 'Ouvrir le CV')
    }
    return v === '' || v == null ? '—' : String(v)
  }

  async function ouvrirFiche(c) {
    const lien = await lienPhotos().catch(() => null) // adresse temporaire des pièces jointes (photo, CV)
    const contenu = h('div', { className: 'blocs-candidat' },
      BLOCS_CANDIDAT.map(([titre, champs]) => h('section', { className: 'bloc-candidat' }, h('h3', null, titre),
        h('dl', { className: 'fiche-infos' }, champs.map((f) => [
          champs.length === 1 && f[1] === titre ? null : h('dt', null, f[1]),
          h('dd', { className: champs.length === 1 && f[1] === titre ? 'fiche-seule' : '' }, valeurLisible(c, f, lien)),
        ].filter(Boolean))))))
    const naissance = depuisGrist(c.Date_naissance)
    const titre = h('span', { className: 'titre-formulaire' }, h('span', { className: 'titre-icone' }, icone('occupes', 22)), nom(c))
    const { fermer, section } = ouvrirPanneau(titre, [
      h('div', { className: 'fiche-entete' },
        h('div', { className: 'carte-titre sous-texte' }, [naissance && `${enFrancais(naissance)} · ${age(naissance)} ans`, poste(c)].filter(Boolean).join(' · ') || ' '),
        h('button', { className: 'bouton bouton-compact', onClick: () => { fermer(); ouvrirFormulaire(c) } }, 'Modifier'),
        h('button', { className: 'bouton bouton-compact bouton-danger', onClick: () => { fermer(); ouvrirSuppression(c) } }, 'Supprimer')),
      contenu,
    ])
    section.classList.add('panneau-large', 'panneau-fiche', 'panneau-candidat')
  }

  // ---- Suppression ----

  function ouvrirSuppression(c) {
    const erreur = h('p', { className: 'erreur', hidden: true })
    const confirmer = h('button', { className: 'bouton bouton-danger' }, 'Supprimer définitivement')
    confirmer.addEventListener('click', async () => {
      confirmer.disabled = true
      try {
        await supprimerCandidat(c.id)
        fermer()
        await recharger()
      } catch (err) {
        erreur.textContent = err.message || 'La suppression a échoué.'
        erreur.hidden = false
        confirmer.disabled = false
      }
    })
    const { fermer } = ouvrirPanneau(`Supprimer ${nom(c)} ?`, [
      h('p', null, 'Toutes les informations de ce candidat seront supprimées.'),
      h('p', { className: 'sous-texte' }, 'En cas d’erreur, la suppression s’annule dans l’Historique du document Grist.'),
      erreur, confirmer,
      h('button', { className: 'bouton', onClick: () => fermer() }, 'Annuler'),
    ])
  }

  return {
    afficher(donnees) {
      d = donnees
      rendre()
    },
    accueil() {
      recherche = ''
      rendre()
    },
  }
}
