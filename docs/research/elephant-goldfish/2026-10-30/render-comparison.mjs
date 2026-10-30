import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const skill = process.argv[2]
assert(skill, 'Usage: node render-comparison.mjs <pinned-visual-explainer-skill-directory>')
const here = dirname(fileURLToPath(import.meta.url))
const { renderPage, prepareRenderedHtml, reportLine } = await import(
  pathToFileURL(resolve(skill, 'kit/render.mjs')).href
)
const source = await readFile(resolve(here, 'comparison.src.html'), 'utf8')
const license = await readFile(resolve(here, 'VISUAL-EXPLAINER-LICENSE.txt'), 'utf8')
const result = renderPage(source, { sendBack: false })
assert(result.kit, 'Expected the canonical kit marker')
assert.equal(result.errors.length, 0, result.errors.join('\n'))
assert.equal(result.report.uncaptioned, 0, 'Every figure needs a caption')

// The pinned renderer injects exactly these three Google font links. Keep other links intact.
let stripped = 0
let html = prepareRenderedHtml(result.html).replace(
  /<link\b[^>]*\bhref="https:\/\/(?:fonts\.googleapis\.com(?:\/css2\?[^"<>]*)?|fonts\.gstatic\.com)"[^>]*>\n?/g,
  () => {
    stripped++
    return ''
  },
)
assert.equal(stripped, 3, 'Pinned font injection changed; inspect before adapting')
html = html.replace('<head>', `<head>\n<!-- Visual Explainer kit license\n${license}-->`)
assert(!/<script\b[^>]*\bdata-send-back\b/i.test(html), 'Host send-back must remain disabled')
assert(
  !/<(?:script|img|iframe|audio|video|source)\b[^>]*\bsrc\s*=/i.test(html),
  'No external content sources',
)
assert(!/<link\b[^>]*href=["'](?!data:)/i.test(html), 'No external link dependencies')
assert(!/@import\b|@font-face\b|url\(\s*["']?https?:/i.test(html), 'No CSS network dependencies')
assert(!/\/(?:Users|home)\/|file:\/\/\//.test(html), 'No private absolute paths')
await writeFile(resolve(here, 'comparison.html'), html)
console.log(
  `Rendered comparison.html (${Buffer.byteLength(html)} bytes); stripped ${stripped} stock font links`,
)
console.log(reportLine(result.report))
for (const warning of result.warnings) console.log(`Warning: ${warning}`)
console.log(
  'Static checks: offline asset references, no send-back, no private paths, all figure captions — PASS',
)
