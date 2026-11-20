// Écran « Cahiers de charge » : Admin, RH (gestion) : tableau (chef d'équipe, période, fichier) avec recherche,
// fiche de cahier de charge (nouveau ou modification) avec le fichier joint, suppression ;
// chef d'équipe (lecture) : ses cahiers de charge seulement, une ligne ouvre le fichier.
import { h, ouvrirPanneau, etiqueterLignes, fenetreSuppression, compte, menuPlus, zoneFichier, versGrist, depuisGrist, enFrancais } from './outils.js'
import { accesPage, enregistrerLigne, supprimerLignes, envoyerPhoto, lienPhotos, idsDeListe, peutModifier, nomContact, ROLE_CHEF } from './donnees.js'

const TABLE_CAHIERS = 'Cahier_de_charge'
const TITRES_CAHIERS = ['Chef d’équipe', 'Date début', 'Date fin', 'Fichier', '']
const TITRES_CAHIERS_CHEF = ['Date début', 'Date fin', 'Cahier de charge']

export function creerEcranCahiersCharge(racine, recharger) {
  let d = null
  let lien = null // adresse temporaire des fichiers joints (demandée une seule fois)
  let recherche = ''
  let redessinerLignes = null // lignes du tableau seules, quand l'adresse des fichiers arrive

  const chefDe = (c) => {
    const u = d.parId.Utilisateurs?.get(c.Chef_equipe)
    return u ? nomContact(u) || u.Email || 'Sans nom' : ''
  }
  const fichierDe = (c) => idsDeListe(c.Fichier)[0] ?? null
  const periode = (c) => [enFrancais(depuisGrist(c.Date_debut)), enFrancais(depuisGrist(c.Date_fin))].filter(Boolean).join(' → ') || 'sans date'

  function rendre() {
    if (!d) return
    redessinerLignes = null
    if (!accesPage(d, 'cahiers_charge')) {
      racine.replaceChildren(h('p', { className: 'message' }, 'Cette page n’est pas disponible pour ton profil.'))
      return
    }
    const gestion = peutModifier(d, 'cahiers_charge')
    // Chef d'équipe : ses cahiers seulement (une table refusée par les règles d'accès = aucun cahier)
    const chef = d.moi.profil === ROLE_CHEF
    if (d.absentes.has(TABLE_CAHIERS) && !chef) {
      racine.replaceChildren(h('p', { className: 'message' }, 'Ce document n’a pas de table Cahier de charge.'))
      return
    }
    const tous = d[TABLE_CAHIERS].filter((c) => !chef || c.Chef_equipe === d.moi.id)
    const titres = chef ? TITRES_CAHIERS_CHEF : TITRES_CAHIERS
    const corps = h('tbody')
    const compteur = h('p', { className: 'sous-texte' })
    // Ne redessine que les lignes : le champ de recherche garde le curseur
    const dessinerLignes = () => {
      const filtre = recherche.trim().toLowerCase()
      const liste = tous
        .filter((c) => !filtre || [chefDe(c), periode(c)].some((v) => String(v ?? '').toLowerCase().includes(filtre)))
        .sort((a, b) => (b.Date_debut ?? 0) - (a.Date_debut ?? 0))
      compteur.textContent = compte(liste.length, tous.length, 'cahier de charge', 'cahiers de charge')
      corps.replaceChildren(...(liste.length === 0
        ? [h('tr', null, h('td', { className: 'tableau-vide', colSpan: titres.length },
          filtre ? 'Aucun résultat.' : chef ? 'Aucun cahier de charge pour toi pour l’instant.' : 'Aucun cahier de charge pour l’instant. Ajoute le premier avec « ＋ Nouveau cahier de charge ».'))]
        : liste.map((c) => {
          const fichier = fichierDe(c)
          const ouvrir = fichier && lien && h('a', { className: chef ? 'bouton bouton-compact bouton-principal' : '', href: lien(fichier), target: '_blank', rel: 'noreferrer',
            onClick: (ev) => ev.stopPropagation() }, chef ? 'Ouvrir le cahier de charge' : 'Ouvrir')
          if (chef) {
            return h('tr', { className: fichier && lien ? 'tableau-ligne' : '', onClick: () => fichier && lien && window.open(lien(fichier), '_blank', 'noreferrer') },
              h('td', { className: 'tableau-nom' }, enFrancais(depuisGrist(c.Date_debut)) || '—'),
              h('td', null, enFrancais(depuisGrist(c.Date_fin)) || '—'),
              h('td', null, ouvrir || (fichier ? 'Chargement…' : 'Pas de fichier')))
          }
          return h('tr', { className: 'tableau-ligne', onClick: () => gestion && ouvrirFiche(c) },
            h('td', { className: 'tableau-nom' }, chefDe(c) || '—'),
            h('td', null, enFrancais(depuisGrist(c.Date_debut)) || '—'),
            h('td', null, enFrancais(depuisGrist(c.Date_fin)) || '—'),
            h('td', null, ouvrir || (fichier ? 'Oui' : '—')),
            h('td', { className: 'tableau-actions' },
              gestion && menuPlus([
                h('button', { className: 'bouton bouton-compact', role: 'menuitem', onClick: (ev) => { ev.stopPropagation(); ouvrirFiche(c) } }, 'Modifier'),
                h('button', { className: 'bouton bouton-compact bouton-danger', role: 'menuitem', onClick: (ev) => { ev.stopPropagation(); ouvrirSuppression(c) } }, 'Supprimer')])))
        })))
      etiqueterLignes(corps, titres)
    }
    dessinerLignes()
    redessinerLignes = dessinerLignes

    racine.replaceChildren(
      h('section', { className: 'carte-tableau' },
        h('div', { className: 'barre-outils' },
          h('input', { className: 'champ champ-compact', type: 'search', placeholder: chef ? 'Rechercher (date…)' : 'Rechercher (chef d’équipe, date…)', value: recherche,
            'aria-label': 'Rechercher un cahier de charge', onInput: (ev) => { recherche = ev.target.value; dessinerLignes() } }),
          gestion && h('button', { className: 'bouton bouton-principal bouton-compact', onClick: () => ouvrirFiche(null) }, '＋ Nouveau cahier de charge')),
        compteur,
        h('div', { className: 'tableau-defilant' },
          h('table', { className: 'tableau' },
            h('thead', null, h('tr', null, titres.map((t) => h('th', null, t)))),
            corps))))
  }

  // ---- Fiche : nouveau cahier de charge (`c` null) ou modification ----

  function ouvrirFiche(c) {
    const champs = {
      Chef_equipe: c?.Chef_equipe || 0,
      Date_debut: depuisGrist(c?.Date_debut) ?? '',
      Date_fin: depuisGrist(c?.Date_fin) ?? '',
    }
    let nouveauFichier = null
    let fichierEnvoye = null // identifiant de la pièce jointe déjà envoyée pour `nouveauFichier`
    const ancienFichier = c ? fichierDe(c) : null
    // Chefs d'équipe actifs, plus celui déjà choisi s'il ne l'est plus
    const chefs = d.Utilisateurs.filter((u) => (u.Profil === ROLE_CHEF && u.Actif) || u.id === champs.Chef_equipe)
      .map((u) => [u.id, nomContact(u) || u.Email || 'Sans nom']).sort((a, b) => String(a[1]).localeCompare(String(b[1]), 'fr'))
    const erreur = h('p', { className: 'erreur', hidden: true })
    const libelleValider = c ? 'Enregistrer' : 'Ajouter le cahier de charge'
    const valider = h('button', { className: 'bouton bouton-principal', type: 'submit' }, libelleValider)
    const date = (libelle, col) => h('label', { className: 'champ-groupe' }, libelle,
      h('input', { className: 'champ', type: 'date', value: champs[col], onInput: (ev) => { champs[col] = ev.target.value } }))

    const formulaire = h('form', { className: 'formulaire', onSubmit: async (ev) => {
      ev.preventDefault()
      erreur.hidden = true
      const probleme = !champs.Chef_equipe ? 'Choisis le chef d’équipe.'
        : !champs.Date_debut ? 'Indique la date de début.'
          : champs.Date_fin && champs.Date_fin < champs.Date_debut ? 'La date de fin est avant la date de début.'
            : !c && !nouveauFichier ? 'Ajoute le fichier du cahier de charge.'
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
          Chef_equipe: Number(champs.Chef_equipe),
          Date_debut: versGrist(champs.Date_debut),
          Date_fin: champs.Date_fin ? versGrist(champs.Date_fin) : null,
        }
        // Un nouveau fichier remplace l'ancien ; sans nouveau fichier, l'ancien reste (envoyé tel quel, avec son nom)
        if (nouveauFichier) {
          const f = nouveauFichier
          fichierEnvoye ??= await envoyerPhoto(f, f.name)
          colonnes.Fichier = ['L', fichierEnvoye]
        }
        await enregistrerLigne(TABLE_CAHIERS, c?.id ?? null, colonnes)
        fermer()
        await recharger()
      } catch (err) {
        erreur.textContent = err.message || 'L’enregistrement a échoué.'
        erreur.hidden = false
        valider.disabled = false
        valider.textContent = libelleValider
      }
    } },
    h('label', { className: 'champ-groupe' }, 'Chef d’équipe *',
      h('select', { className: 'champ', onChange: (ev) => { champs.Chef_equipe = Number(ev.target.value) || 0 } },
        h('option', { value: '0', selected: !champs.Chef_equipe }, chefs.length ? '-- Choisissez --' : 'Aucun chef d’équipe actif'),
        chefs.map(([id, nom]) => h('option', { value: String(id), selected: id === champs.Chef_equipe }, nom)))),
    h('div', { className: 'grille-2' }, date('Date début *', 'Date_debut'), date('Date fin', 'Date_fin')),
    h('div', { className: 'champ-groupe' }, c ? 'Fichier cahier de charge' : 'Fichier cahier de charge *',
      zoneFichier((f) => { nouveauFichier = f; fichierEnvoye = null }, { deja: Boolean(ancienFichier), lien: ancienFichier && lien ? lien(ancienFichier) : null })),
    erreur, valider,
    c && h('button', { className: 'bouton bouton-danger', type: 'button', onClick: () => ouvrirDepuis(() => ouvrirSuppression(c)) }, 'Supprimer ce cahier de charge'))

    const { fermer, ouvrirDepuis, section } = ouvrirPanneau(c ? `Cahier de charge · ${chefDe(c) || 'sans chef d’équipe'}` : 'Nouveau cahier de charge', formulaire)
    section.classList.add('panneau-moyen')
  }

  // ---- Suppression ----

  function ouvrirSuppression(c) {
    fenetreSuppression('Supprimer ce cahier de charge ?', [
      h('p', null, `${chefDe(c) || 'Sans chef d’équipe'} · ${periode(c)}${fichierDe(c) ? ' · avec son fichier' : ''}.`),
    ], [['Supprimer définitivement', 'bouton-danger', () => supprimerLignes(TABLE_CAHIERS, [c.id])]], recharger)
  }

  return {
    afficher(donnees) {
      d = donnees
      rendre()
      if (!lien && redessinerLignes) lienPhotos().then((f) => { lien = f; redessinerLignes?.() }).catch(() => {})
    },
    accueil() {
      recherche = ''
      rendre()
    },
  }
}
