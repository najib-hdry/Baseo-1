# Casiers chantier — widget Grist

Le widget personnalisé des documents Grist « Casiers chantier » / « Baseo » : en-tête, menu « Mes pages »,
gestion des casiers (plan 3D, attribution, libération, hors service), gestion des incidents
(signalement avec photo, suivi), contrôle nettoyage et maintenance (formulaires avec photos).

Le widget lit et écrit directement dans le document Grist ; il ne contient aucune donnée ni aucune clé.

## Document Grist

- Page « Application », widget « Custom widget builder ».
- Pour un lien public en écriture, ajouter `/m/default` à l'adresse du document : sans lui,
  `embed=true` ouvre le document **en lecture seule** et le widget reçoit « No write access ».
  Ne pas publier ce lien : toute personne qui l'a peut modifier les données.
- Règles d'accès conseillées pour tout non-propriétaire : table `Gestionnaires` masquée, colonne
  `Intervenants.Telephone` masquée, pas de suppression de lignes, pas de changement de structure.

## Construire

```
npm install
npm run assembler
```

Produit `builder/app.html` (HTML + CSS intégré) et `builder/app.js` (JavaScript minifié).

## Mettre en ligne dans Grist

1. Ouvrir le document, page « Application », puis la configuration du widget (⋮ → Configuration du widget).
2. Coller `builder/app.html` dans l'onglet **HTML** et `builder/app.js` dans l'onglet **JavaScript**, puis enregistrer.
3. Accès du widget : **Accès complet au document**.

Le code est stocké dans le document Grist : aucun hébergement n'est nécessaire.
En cas d'erreur, l'ancienne version se récupère dans **Historique du document**.

## Développer

`app.html` charge directement les modules de `js/` (sans assemblage).

- `js/donnees.js` — lecture des tables, écritures Grist (attributions, intervenants, incidents, photos)
- `js/navigation.js` — cartes de chantier, onglets (zones, bases vie, étages), grille de casiers
- `js/plan3d.js` — plan 3D en CSS
- `js/casiers.js`, `js/incidents.js` — écrans casiers et incidents
- `js/rapports.js` — écrans Contrôle nettoyage et Maintenance (un même formulaire, deux réglages)
- `js/app.js` — en-tête, menu « Mes pages » et chargement des données
- `js/outils.js` — petits outils d'affichage
- `css/style.css` — styles
- `scripts/assembler.mjs` — assemble le tout pour le Custom widget builder

## Tables attendues

`Chantiers`, `Bases_vie`, `Etages`, `Vestiaires`, `Pieces`, `Casiers`, `Entreprises`,
`Intervenants`, `Attributions`, `Incidents`.

Facultatives (la page ou le niveau correspondant est ignoré si la table manque) :
`Zones` (entre `Chantiers` et `Bases_vie`), `Controles_nettoyage`, `Maintenance`.

## Limites connues (offre Grist gratuite)

- L'API REST est limitée à 3 000 appels par mois. Le widget n'en utilise pas, **sauf l'envoi de
  photos** (incidents, nettoyage, maintenance), qui échoue quand le quota est épuisé.
- Un visiteur éditeur peut ouvrir la configuration du widget et modifier son code : la protection
  de la structure ne couvre pas le code des widgets.
