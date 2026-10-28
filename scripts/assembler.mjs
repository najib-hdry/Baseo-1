// Assemble chaque widget pour le « Custom widget builder » de Grist :
// un bloc HTML (CSS intégré + conteneur) et un bloc JavaScript sans import/export.
// Usage : npm run assembler  →  builder/<widget>.html et builder/<widget>.js (minifiés)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { transformSync } from 'esbuild'

const MODULES_COMMUNS = ['outils', 'donnees', 'plan3d', 'navigation', 'casiers', 'incidents', 'rapports', 'chantier', 'admin', 'annuaire', 'postes', 'candidats', 'taches', 'emargements', 'acomptes', 'conges', 'stocks', 'tableau_bord', 'utilisateurs'] // ordre des dépendances
const WIDGETS = ['app']

const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8')

// Retire les lignes d'import et le mot-clé export (tout est assemblé dans une même portée)
const sansModules = (code) =>
  code
    .replace(/^import .*$\n?/gm, '')
    .replace(/^export (?=(async )?function|const|let)/gm, '')

mkdirSync(new URL('../builder/', import.meta.url), { recursive: true })
const minifier = (code, loader) => transformSync(code, { loader, minify: true, target: 'es2020', charset: 'utf8' }).code
const css = minifier(lire('css/style.css'), 'css')

for (const widget of WIDGETS) {
  const html = `<style>${css}</style>\n<main id="app" class="widget"><p class="attente">Chargement des données Grist…</p></main>\n`
  const parties = [...MODULES_COMMUNS, widget].map((m) => sansModules(lire(`js/${m}.js`)))
  // Images du projet ('img/xxx.png' dans le code) intégrées en data URL : le widget reste autonome dans Grist
  const avecImages = parties.join('\n').replace(/'img\/([\w-]+\.png)'/g, (_, nom) =>
    `'data:image/png;base64,${readFileSync(new URL(`../img/${nom}`, import.meta.url)).toString('base64')}'`)
  const js = minifier(`(() => {\n${avecImages}\n})()\n`, 'js')
  writeFileSync(new URL(`../builder/${widget}.html`, import.meta.url), html)
  writeFileSync(new URL(`../builder/${widget}.js`, import.meta.url), js)
  console.log(`${widget} : html ${html.length} car., js ${js.length} car.`)
}
