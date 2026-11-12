// Écran « Communication » (admin) : onglets Communication générale / par site, tableau (titre, contenu…) avec recherche,
// fiche de communication (nouvelle ou modification) avec un fichier joint, suppression.
import { h, ouvrirPanneau, etiqueterLignes, fenetreSuppression, compte, menuPlus, zoneFichier, versGrist, depuisGrist, enFrancais, aujourdhui, dateAvecAlerte, choixEtiquettes } from './outils.js'
import { accesPage, enregistrerLigne, supprimerLignes, envoyerPhoto, lienPhotos, idsDeListe, peutModifier, chantiersCommunication } from './donnees.js'
import { ouvrirFicheCommunication } from './actualites.js'

const TABLE_COMMUNICATION = 'Communication'
const NIVEAU_GENERAL = 'Communication générale'
const NIVEAU_SITE = 'Communication par site'
const NIVEAUX_COMMUNICATION = [NIVEAU_GENERAL, NIVEAU_SITE]
const TYPE_TEMPORAIRE = 'Temporaire'
const TYPES_COMMUNICATION = ['Permanente', TYPE_TEMPORAIRE]
const CLASSES_TYPE_COMMUNICATION = { 'Permanente': 'badge-resolu', 'Temporaire': 'badge-en_cours' }
const apercuContenu = (texte) => (texte && texte.length > 120 ? `${texte.slice(0, 120)}…` : texte || '—')

export function creerEcranCommunication(racine, recharger) {
  let d = null
  let lien = null // adresse temporaire des fichiers joints (demandée une seule fois)
  let recherche = ''
  let onglet = NIVEAU_GENERAL
  let redessinerLignes = null // lignes du tableau seules, quand l'adresse des fichiers arrive

  // Colonne Chantier : liste de chantiers (une communication par site peut en viser plusieurs)
  const nomChantier = (c) => chantiersCommunication(c).map((id) => d.parId.Chantiers.get(id)?.Nom).filter(Boolean).join(', ')
  const fichierDe = (c) => idsDeListe(c.Fichier)[0] ?? null

  function rendre() {
    if (!d) return
    redessinerLignes = null // un message remplace le tableau : rien à redessiner
    if (!accesPage(d, 'communication')) {
      racine.replaceChildren(h('p', { className: 'message' }, 'Cette page n’est pas disponible pour ton profil.'))
      return
    }
    if (d.absentes.has(TABLE_COMMUNICATION)) {
      racine.replaceChildren(h('p', { className: 'message' }, 'Ce document n’a pas de table Communication.'))
      return
    }
    const tous = d[TABLE_COMMUNICATION]
    const parSite = onglet === NIVEAU_SITE
    const titres = ['Titre', 'Contenu', 'Type', ...(parSite ? ['Chantier'] : []), 'Date', 'Expire le', 'Fichier', '']
    const corps = h('tbody')
    const compteur = h('p', { className: 'sous-texte' })
    // Ne redessine que les lignes : le champ de recherche garde le curseur
    const dessinerLignes = () => {
      const filtre = recherche.trim().toLowerCase()
      const deLOnglet = tous.filter((c) => (c.Niveau || NIVEAU_GENERAL) === onglet)
      const liste = deLOnglet
        .filter((c) => !filtre || [c.Titre, c.Contenu, c.Type, nomChantier(c), enFrancais(depuisGrist(c.Date))].some((v) => String(v ?? '').toLowerCase().includes(filtre)))
        .sort((a, b) => (b.Date ?? 0) - (a.Date ?? 0))
      compteur.textContent = compte(liste.length, deLOnglet.length, 'communication')
      corps.replaceChildren(...(liste.length === 0
        ? [h('tr', null, h('td', { className: 'tableau-vide', colSpan: titres.length }, filtre ? 'Aucun résultat.' : 'Aucune communication dans cet onglet.'))]
        : liste.map((c) => {
          const fichier = fichierDe(c)
          // Lecture (CIP) : la même fiche que la page Communication du terrain ; gestion : le formulaire
          return h('tr', { className: 'tableau-ligne', onClick: () => (peutModifier(d, 'communication') ? ouvrirFiche(c) : ouvrirFicheCommunication(c, lien, nomChantier(c))) },
            h('td', { className: 'tableau-nom' }, c.Titre || 'Sans titre'),
            h('td', null, apercuContenu(c.Contenu)),
            h('td', null, c.Type ? h('span', { className: `badge ${CLASSES_TYPE_COMMUNICATION[c.Type] ?? ''}` }, c.Type) : '—'),
            parSite && h('td', null, nomChantier(c) || '—'),
            h('td', null, enFrancais(depuisGrist(c.Date)) || '—'),
            h('td', null, c.Type === TYPE_TEMPORAIRE ? dateAvecAlerte(c.Date_expiration) : '—'),
            h('td', null, fichier && lien
              ? h('a', { href: lien(fichier), target: '_blank', rel: 'noreferrer', onClick: (ev) => ev.stopPropagation() }, 'Ouvrir')
              : fichier ? 'Oui' : '—'),
            h('td', { className: 'tableau-actions' },
              peutModifier(d, 'communication') && menuPlus([
                h('button', { className: 'bouton bouton-compact', role: 'menuitem', onClick: (ev) => { ev.stopPropagation(); ouvrirFiche(c) } }, 'Modifier'),
                h('button', { className: 'bouton bouton-compact bouton-danger', role: 'menuitem', onClick: (ev) => { ev.stopPropagation(); ouvrirSuppression(c) } }, 'Supprimer')])))
        })))
      etiqueterLignes(corps, titres)
    }
    dessinerLignes()
    redessinerLignes = dessinerLignes

    racine.replaceChildren(
      // Onglets, recherche et tableau dans une même carte blanche à bordure noire
      h('section', { className: 'carte-tableau' },
        h('div', { className: 'onglets onglets-statut onglets-candidats', role: 'tablist', 'aria-label': 'Niveau de communication' },
          NIVEAUX_COMMUNICATION.map((n) => h('button', { className: 'onglet', role: 'tab', 'aria-selected': String(n === onglet),
            onClick: () => { onglet = n; rendre() } },
          `${n} (${tous.filter((c) => (c.Niveau || NIVEAU_GENERAL) === n).length})`))),
        h('div', { className: 'barre-outils' },
          h('input', { className: 'champ champ-compact', type: 'search', placeholder: 'Rechercher (contenu, chantier, date…)', value: recherche,
            'aria-label': 'Rechercher une communication', onInput: (ev) => { recherche = ev.target.value; dessinerLignes() } }),
          peutModifier(d, 'communication') && h('button', { className: 'bouton bouton-principal bouton-compact', onClick: () => ouvrirFiche(null) }, '＋ Nouvelle communication')),
        compteur,
        h('div', { className: 'tableau-defilant' },
          h('table', { className: 'tableau' },
            h('thead', null, h('tr', null, titres.map((t) => h('th', null, t)))),
            corps))))
  }

  // ---- Fiche : nouvelle communication (`c` null, au niveau de l'onglet ouvert) ou modification ----

  function ouvrirFiche(c) {
    const champs = {
      Titre: c?.Titre ?? '',
      Niveau: c?.Niveau || onglet,
      Type: c?.Type || 'Permanente',
      Date: depuisGrist(c?.Date) ?? aujourdhui(),
      Date_expiration: depuisGrist(c?.Date_expiration) ?? '',
      Contenu: c?.Contenu ?? '',
    }
    let nouveauFichier = null
    let fichierEnvoye = null // identifiant de la pièce jointe déjà envoyée pour `nouveauFichier`
    const ancienFichier = c ? fichierDe(c) : null
    const chantiers = [...d.Chantiers].sort((a, b) => String(a.Nom).localeCompare(String(b.Nom)))
    const erreur = h('p', { className: 'erreur', hidden: true })
    const libelleValider = c ? 'Enregistrer' : 'Publier la communication'
    const valider = h('button', { className: 'bouton bouton-principal', type: 'submit' }, libelleValider)

    // Le chantier n'a de sens que par site, la date d'expiration que pour une communication temporaire
    // Un ou plusieurs chantiers ; un chantier supprimé n'est pas repris
    const choixChantiers = choixEtiquettes({
      elements: () => chantiers.map((ch) => ({ id: ch.id, libelle: ch.Nom || 'Sans nom' })),
      choisis: c ? chantiersCommunication(c).filter((id) => d.parId.Chantiers.has(id)) : [],
      textes: { aucun: 'Aucun chantier choisi.', choisir: 'Ajouter un chantier…', tous: 'Tous les chantiers sont ajoutés', vide: 'Aucun chantier' },
    })
    const groupeChantier = h('div', { className: 'champ-groupe', hidden: champs.Niveau !== NIVEAU_SITE }, 'Chantiers *', choixChantiers.element)
    const groupeExpiration = h('label', { className: 'champ-groupe', hidden: champs.Type !== TYPE_TEMPORAIRE }, 'Date d’expiration *',
      h('input', { className: 'champ', type: 'date', value: champs.Date_expiration, onInput: (ev) => { champs.Date_expiration = ev.target.value } }))

    const formulaire = h('form', { className: 'formulaire', onSubmit: async (ev) => {
      ev.preventDefault()
      erreur.hidden = true
      const site = champs.Niveau === NIVEAU_SITE
      const temporaire = champs.Type === TYPE_TEMPORAIRE
      const probleme = !champs.Titre.trim() ? 'Donne un titre à la communication.'
        : !champs.Contenu.trim() ? 'Écris le contenu de la communication.'
        : site && choixChantiers.ids().length === 0 ? 'Choisis au moins un chantier concerné.'
          : !champs.Date ? 'Indique la date.'
            : temporaire && !champs.Date_expiration ? 'Indique la date d’expiration d’une communication temporaire.'
              : temporaire && champs.Date_expiration < champs.Date ? 'La date d’expiration ne peut pas être avant la date de la communication.'
                : null
      if (probleme) {
        erreur.textContent = probleme
        erreur.hidden = false
        return
      }
      valider.disabled = true
      valider.textContent = 'Enregistrement…'
      try {
        const colonnes = {
          Titre: champs.Titre.trim(),
          Niveau: champs.Niveau,
          Chantier: site && choixChantiers.ids().length ? ['L', ...choixChantiers.ids()] : null,
          Type: champs.Type,
          Date: versGrist(champs.Date),
          Date_expiration: temporaire ? versGrist(champs.Date_expiration) : null,
          Contenu: champs.Contenu.trim(),
        }
        // Un nouveau fichier remplace l'ancien ; sans nouveau fichier, l'ancien reste.
        // Envoyé tel quel avec son nom (affiche, PDF…) : une image n'est pas réduite en JPEG comme les photos
        if (nouveauFichier) {
          const f = nouveauFichier
          fichierEnvoye ??= await envoyerPhoto(f, f.name)
          colonnes.Fichier = ['L', fichierEnvoye]
        }
        await enregistrerLigne(TABLE_COMMUNICATION, c?.id ?? null, colonnes)
        onglet = champs.Niveau // la communication enregistrée reste visible
        fermer()
        await recharger()
      } catch (err) {
        erreur.textContent = err.message || 'L’enregistrement a échoué.'
        erreur.hidden = false
        valider.disabled = false
        valider.textContent = libelleValider
      }
    } },
    h('label', { className: 'champ-groupe' }, 'Titre *',
      h('input', { className: 'champ', type: 'text', autocomplete: 'off', maxLength: 150, value: champs.Titre, onInput: (ev) => { champs.Titre = ev.target.value } })),
    h('div', { className: 'grille-2' },
      h('label', { className: 'champ-groupe' }, 'Niveau de communication',
        h('select', { className: 'champ', onChange: (ev) => { champs.Niveau = ev.target.value; groupeChantier.hidden = champs.Niveau !== NIVEAU_SITE } },
          NIVEAUX_COMMUNICATION.map((n) => h('option', { value: n, selected: n === champs.Niveau }, n)))),
      groupeChantier,
      h('label', { className: 'champ-groupe' }, 'Type',
        h('select', { className: 'champ', onChange: (ev) => { champs.Type = ev.target.value; groupeExpiration.hidden = champs.Type !== TYPE_TEMPORAIRE } },
          TYPES_COMMUNICATION.map((t) => h('option', { value: t, selected: t === champs.Type }, t)))),
      h('label', { className: 'champ-groupe' }, 'Date *',
        h('input', { className: 'champ', type: 'date', value: champs.Date, onInput: (ev) => { champs.Date = ev.target.value } })),
      groupeExpiration),
    h('label', { className: 'champ-groupe' }, 'Contenu *',
      h('textarea', { className: 'champ champ-texte', value: champs.Contenu, onInput: (ev) => { champs.Contenu = ev.target.value } })),
    h('div', { className: 'champ-groupe' }, 'Fichier',
      zoneFichier((f) => { nouveauFichier = f; fichierEnvoye = null }, { deja: Boolean(ancienFichier), lien: ancienFichier && lien ? lien(ancienFichier) : null })),
    erreur, valider,
    c && h('button', { className: 'bouton bouton-danger', type: 'button', onClick: () => ouvrirDepuis(() => ouvrirSuppression(c)) }, 'Supprimer cette communication'))

    // Lecture (CIP) : la fiche se consulte seulement
    const { fermer, ouvrirDepuis } = ouvrirPanneau(c ? `Communication · ${c.Titre || 'Sans titre'}` : 'Nouvelle communication', formulaire)
  }

  // ---- Suppression ----

  function ouvrirSuppression(c) {
    fenetreSuppression(`Supprimer la communication « ${c.Titre || 'Sans titre'} » ?`, [
      h('p', null, `${c.Niveau || NIVEAU_GENERAL}${nomChantier(c) ? ` · ${nomChantier(c)}` : ''} · ${enFrancais(depuisGrist(c.Date)) || 'sans date'}.`),
      h('p', { className: 'sous-texte' }, apercuContenu(c.Contenu)),
    ], [['Supprimer définitivement', 'bouton-danger', () => supprimerLignes(TABLE_COMMUNICATION, [c.id])]], recharger)
  }

  return {
    afficher(donnees) {
      d = donnees
      rendre()
      if (!lien && redessinerLignes) lienPhotos().then((f) => { lien = f; redessinerLignes?.() }).catch(() => {})
    },
    accueil() {
      recherche = ''
      onglet = NIVEAU_GENERAL
      rendre()
    },
  }
}
