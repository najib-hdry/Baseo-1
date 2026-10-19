// Écran « Gestion des entreprises » (admin) : tableau de toutes les entreprises avec recherche,
// fiche de création / modification, suppression avec confirmation.
import { h, ouvrirPanneau, etiqueterLignes } from './outils.js'
import { creerEntreprise, modifierEntreprise, supprimerEntreprise } from './donnees.js'

const TITRES_ENTREPRISES = ['Entreprise', 'Responsable', 'Téléphone', 'Email', 'Intervenants', '']

// Champs de la fiche : colonne Grist, libellé, attributs du champ
const CHAMPS_ENTREPRISE = [
  ['Nom', 'Nom de l’entreprise', { required: true }],
  ['Adresse', 'Adresse', { multiligne: true }],
  ['Responsable_prenom', 'Prénom du responsable', {}],
  ['Responsable_nom', 'Nom du responsable', {}],
  ['Telephone', 'Téléphone', { type: 'tel' }],
  ['Email', 'Email', { type: 'email' }],
]

// Écran affiché dans `racine` ; `recharger()` relit les données après une écriture
export function creerEcranEntreprises(racine, recharger) {
  let d = null
  let recherche = ''

  const intervenantsDe = (e) => d.Intervenants.filter((i) => i.Entreprise === e.id).length
  const responsable = (e) => [e.Responsable_prenom, e.Responsable_nom].filter(Boolean).join(' ')

  function rendre() {
    if (!d) return
    if (d.moi?.profil !== 'Admin') {
      racine.replaceChildren(h('h1', null, 'Gestion des entreprises'), h('p', { className: 'message' }, 'Page réservée aux administrateurs.'))
      return
    }
    const corps = h('tbody')
    const compteur = h('p', { className: 'sous-texte' })
    // Ne redessine que les lignes : le champ de recherche garde le curseur
    const dessinerLignes = () => {
      const filtre = recherche.trim().toLowerCase()
      const liste = [...d.Entreprises]
        .filter((e) => !filtre || [e.Nom, responsable(e), e.Telephone, e.Email, e.Adresse].some((v) => String(v ?? '').toLowerCase().includes(filtre)))
        .sort((a, b) => String(a.Nom).localeCompare(String(b.Nom)))
      compteur.textContent = `${liste.length} entreprise${liste.length > 1 ? 's' : ''}${filtre ? ` sur ${d.Entreprises.length}` : ''}`
      corps.replaceChildren(...(liste.length === 0
        ? [h('tr', null, h('td', { className: 'tableau-vide', colSpan: 6 }, filtre ? 'Aucune entreprise ne correspond.' : 'Aucune entreprise.'))]
        : liste.map((e) => h('tr', { className: 'tableau-ligne', onClick: () => ouvrirFiche(e) },
          h('td', { className: 'tableau-nom' }, e.Nom || 'Sans nom'),
          h('td', null, responsable(e)),
          h('td', null, e.Telephone ? h('a', { href: `tel:${e.Telephone}`, onClick: (ev) => ev.stopPropagation() }, e.Telephone) : ''),
          h('td', null, e.Email ? h('a', { href: `mailto:${e.Email}`, onClick: (ev) => ev.stopPropagation() }, e.Email) : ''),
          h('td', { className: 'tableau-nombre' }, intervenantsDe(e)),
          h('td', { className: 'tableau-actions' },
            h('button', { className: 'bouton bouton-compact', onClick: (ev) => { ev.stopPropagation(); ouvrirFiche(e) } }, 'Modifier'),
            h('button', { className: 'bouton bouton-compact bouton-danger', onClick: (ev) => { ev.stopPropagation(); ouvrirSuppression(e) } }, 'Supprimer'))))))
      etiqueterLignes(corps, TITRES_ENTREPRISES)
    }
    dessinerLignes()
    racine.replaceChildren(
      h('h1', null, 'Gestion des entreprises'),
      h('div', { className: 'barre-outils' },
        h('input', { className: 'champ champ-compact', type: 'search', placeholder: 'Rechercher (nom, responsable, téléphone, email…)', value: recherche,
          'aria-label': 'Rechercher une entreprise', onInput: (e) => { recherche = e.target.value; dessinerLignes() } }),
        h('button', { className: 'bouton bouton-principal bouton-compact', onClick: () => ouvrirFiche(null) }, '＋ Nouvelle entreprise')),
      compteur,
      h('div', { className: 'tableau-defilant' },
        h('table', { className: 'tableau' },
          h('thead', null, h('tr', null, TITRES_ENTREPRISES.map((t) => h('th', null, t)))),
          corps)))
  }

  // ---- Fiche : création (`e` null) ou modification ----

  function ouvrirFiche(e) {
    const champs = Object.fromEntries(CHAMPS_ENTREPRISE.map(([col]) => [col, e?.[col] ?? '']))
    const erreur = h('p', { className: 'erreur', hidden: true })
    const valider = h('button', { className: 'bouton bouton-principal', type: 'submit' }, e ? 'Enregistrer' : 'Créer l’entreprise')

    const formulaire = h('form', { className: 'formulaire', onSubmit: async (ev) => {
      ev.preventDefault()
      erreur.hidden = true
      valider.disabled = true
      try {
        const propres = Object.fromEntries(Object.entries(champs).map(([col, v]) => [col, String(v).trim()]))
        if (e) await modifierEntreprise(d, e.id, propres)
        else await creerEntreprise(d, propres)
        fermer()
        await recharger()
      } catch (err) {
        erreur.textContent = err.message || 'L’enregistrement a échoué.'
        erreur.hidden = false
        valider.disabled = false
      }
    } },
    CHAMPS_ENTREPRISE.map(([col, libelle, { multiligne, ...attributs }]) => h('label', { className: 'champ-groupe' }, libelle,
      multiligne
        ? h('textarea', { className: 'champ champ-texte', value: champs[col], onInput: (ev) => { champs[col] = ev.target.value } })
        : h('input', { className: 'champ', autocomplete: 'off', value: champs[col], ...attributs, onInput: (ev) => { champs[col] = ev.target.value } }))),
    e && h('p', { className: 'sous-texte' }, `${intervenantsDe(e)} intervenant(s) rattaché(s).`),
    erreur, valider,
    e && h('button', { className: 'bouton bouton-danger', type: 'button', onClick: () => { fermer(); ouvrirSuppression(e) } }, 'Supprimer cette entreprise'))

    const { fermer } = ouvrirPanneau(e ? e.Nom || 'Entreprise' : 'Nouvelle entreprise', formulaire)
  }

  // ---- Suppression ----

  function ouvrirSuppression(e) {
    const n = intervenantsDe(e)
    const erreur = h('p', { className: 'erreur', hidden: true })
    const confirmer = h('button', { className: 'bouton bouton-danger' }, 'Supprimer définitivement')
    confirmer.addEventListener('click', async () => {
      confirmer.disabled = true
      try {
        await supprimerEntreprise(e.id)
        fermer()
        await recharger()
      } catch (err) {
        erreur.textContent = err.message || 'La suppression a échoué.'
        erreur.hidden = false
        confirmer.disabled = false
      }
    })
    const { fermer } = ouvrirPanneau(`Supprimer ${e.Nom || 'cette entreprise'} ?`, [
      h('p', null, n > 0
        ? `${n} intervenant(s) y sont rattachés : ils resteront dans l’application, mais sans entreprise.`
        : 'Aucun intervenant n’est rattaché à cette entreprise.'),
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
