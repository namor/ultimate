import { fauxAssistantMessage } from '@earendil-works/pi-ai/providers/faux'
import type { ConversationId } from '@earendil-works/pi-durable'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium, type Locator } from 'playwright-core'
import { afterEach, expect, it } from 'vitest'
import { browserBinary } from '../../extensions/browser/server.ts'
import { context } from '../../server/harness.ts'
import { post, prebuiltServer, removeTemp, temp } from '../helpers.ts'

const cleanup: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const close of cleanup.splice(0).toReversed()) await close()
})

it('opens a local Markdown chat link only through the chooser and renders the selected file in place', async () => {
  const home = await temp('ultimate-markdown-viewer-')
  cleanup.push(() => removeTemp(home))
  const file = join(home, 'report.md')
  const otherFile = join(home, 'private-second-fixture.md')
  const longText = (label: string) =>
    [
      ...Array.from(
        { length: 90 },
        (_, n) => `## ${label} passage ${n + 1}\n\nReading text for this synthetic section.`,
      ),
      Array.from({ length: 90 }, (_, n) =>
        n === 48
          ? `- ${label} list marker`
          : `- ${label} list entry ${n + 1}${n < 48 ? ' with uneven wrapping words' : ''}`,
      ).join('\n'),
      ['| Entry |', '| --- |', ...Array.from({ length: 90 }, (_, n) => `| Row ${n + 1} |`)].join(
        '\n',
      ),
      `${label} after the table`,
      ...Array.from({ length: 22 }, (_, n) => `${label} closing paragraph ${n + 1}`),
      `${label} final line`,
    ].join('\n\n')
  await writeFile(otherFile, longText('Other'))
  await writeFile(
    file,
    [
      '# Synthetic report',
      '',
      '```mermaid',
      'flowchart LR',
      '  A[Start] --> B[Done]',
      '```',
      '',
      '```mermaid',
      'flowchart LR',
      '  A[Missing bracket --> B',
      '```',
      '',
      '```mermaid',
      'timeline',
      '  title Example timeline',
      '  2026 : Review',
      '```',
      '',
      '[Inert link](https://viewer-probe.invalid/link)',
      '',
      '![Image](https://viewer-probe.invalid/image.png)',
      '',
      '<img src="https://viewer-probe.invalid/raw.png">',
      '',
      '```text',
      'wide code '.repeat(100),
      '```',
      '',
      longText('Report'),
    ].join('\n'),
  )
  const server = await prebuiltServer({
    userHome: home,
    localSetup: false,
    home: join(home, 'state'),
    port: 0,
  })
  cleanup.push(() => server.close())
  server.host.faux!.setResponses([
    fauxAssistantMessage(
      '[Open report](file:///not-a-real-directory/report.md) · [Open reference][report]\n\n[report]: file:///not-a-real-directory/report.md\n\n[Other file](file:///tmp/plain.txt) · [Remote file](file://elsewhere/report.md)',
    ),
  ])
  const id = (
    await post(server, '/api/extensions/subagents/actions/standing', {
      args: { name: 'ultimate' },
    })
  ).data.result as ConversationId
  const conversation = await server.harness.conversation(id, context)
  await (
    await conversation!.submit({ type: 'input', content: 'Show the report link.' }, context)
  ).wait(context)

  const browser = await chromium.launch({
    executablePath: await browserBinary(),
    headless: true,
    env: { ...process.env, TMPDIR: undefined },
  })
  cleanup.push(() => browser.close())
  const page = await browser.newPage()
  const requests: string[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (
      url.hostname === 'viewer-probe.invalid' ||
      url.pathname === '/api/extensions/attachments/actions/upload'
    ) {
      requests.push(request.url())
    }
  })
  await page.goto(`${server.url}/?conversation=${id}`)
  const chat = page.locator('#app')
  const chatLink = chat.getByRole('button', { name: 'Open report', exact: true })
  const reference = chat.getByRole('button', { name: 'Open reference', exact: true })
  await page
    .locator('[data-ui="composer"] label[aria-label="Attach files"] input:enabled')
    .waitFor({ state: 'attached' })
  await page.getByText('Show the report link.', { exact: true }).waitFor()
  await chatLink.click()
  expect(await page.getByText('Other file [blocked]', { exact: false }).count()).toBeGreaterThan(0)
  expect(await page.getByText('Remote file [blocked]', { exact: false }).count()).toBeGreaterThan(0)
  const dialog = page.getByRole('dialog')
  expect(await dialog.innerText()).toContain('cannot read it from the link alone')
  async function select(path: string) {
    const chooser = page.waitForEvent('filechooser')
    await dialog.getByRole('button', { name: 'Choose file' }).click()
    await (await chooser).setFiles(path)
  }
  await select(file)
  await dialog.getByRole('heading', { name: 'Synthetic report' }).waitFor()
  expect(await dialog.locator('figure').first().innerText()).toMatch(
    /Mermaid diagram.*Start.*▶.*Done/s,
  )
  expect(await dialog.locator('figure').nth(1).innerText()).toMatch(
    /Diagram unavailable.*Missing bracket/s,
  )
  expect(await dialog.locator('figure').last().innerText()).toMatch(
    /Diagram unavailable.*timeline.*Example timeline/s,
  )
  await dialog.locator('summary').click()
  expect(await dialog.locator('details').innerText()).toContain('A[Start] --> B[Done]')
  expect(await dialog.locator('a,img,iframe,script').count()).toBe(0)
  const canceled = await page.evaluate(() => {
    const transfer = new DataTransfer()
    transfer.items.add(new File(['synthetic only'], 'drop.md', { type: 'text/markdown' }))
    return ['[data-markdown-viewer]', '[data-slot="dialog-backdrop"]'].map((selector) => {
      const event = new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        dataTransfer: transfer,
      })
      return !document.querySelector(selector)!.dispatchEvent(event)
    })
  })
  expect(canceled).toEqual([true, true])

  const scroll = dialog.getByRole('region', { name: 'Markdown document' })
  const visible = async (text: string) => {
    const pane = (await scroll.boundingBox())!
    const line = (await dialog.getByText(text, { exact: true }).boundingBox())!
    return pane.y - 1 <= line.y && line.y + line.height <= pane.y + pane.height + 1
  }
  const scrollIntoView = (target: Locator) =>
    target.evaluate((line) => {
      line.scrollIntoView({ block: 'start', behavior: 'instant' })
      const pane = line.closest('[data-markdown-scroll]')!.getBoundingClientRect()
      const rect = line.getBoundingClientRect()
      return pane.top - 1 <= rect.top && rect.bottom <= pane.bottom + 1
    })
  const wideCode = dialog.getByText('wide code '.repeat(100).trim(), { exact: true })
  expect(
    await wideCode.evaluate((line) => {
      const block = line.closest('pre')!
      block.scrollLeft = block.scrollWidth
      return block.scrollLeft > 0
    }),
  ).toBe(true)
  const top = () => scroll.evaluate((el) => el.scrollTop)
  await scroll.evaluate((el) => {
    el.scrollTop = el.scrollHeight
  })
  expect(await visible('Report final line')).toBe(true)
  const expand = dialog.getByRole('button', { name: 'Expand Markdown viewer' })
  const restore = dialog.getByRole('button', { name: 'Restore Markdown viewer' })
  await expand.click()
  expect(await dialog.evaluate((element) => (element as HTMLElement).offsetWidth)).toBe(
    page.viewportSize()?.width,
  )
  expect(await visible('Report final line')).toBe(true)
  await restore.click()
  expect(await visible('Report final line')).toBe(true)
  expect(await top()).toBeGreaterThan(1000)
  const passage = dialog.getByRole('heading', { name: 'Report passage 35', exact: true })
  expect(await scrollIntoView(passage), 'Report passage 35 is visible before expand').toBe(true)
  await expand.click()
  expect(await visible('Report passage 35')).toBe(true)
  await restore.click()
  expect(await visible('Report passage 35')).toBe(true)
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
  expect(await page.locator('[data-ui="composer"] [data-ui="file-chip"]').count()).toBe(0)
  await reference.click()
  expect(await dialog.innerText()).not.toContain('Synthetic report')
  await select(otherFile)
  await dialog.getByRole('heading', { name: 'Other passage 1', exact: true }).waitFor()
  expect(await top()).toBe(0)
  await select(file)
  await dialog.getByRole('heading', { name: 'Synthetic report' }).waitFor()
  expect(await visible('Report passage 35')).toBe(true)
  await page.setViewportSize({ width: 390, height: 820 })
  await dialog
    .getByText('Report list marker', { exact: true })
    .evaluate((element) => element.scrollIntoView({ block: 'start' }))
  await expand.click()
  expect(await visible('Report list marker')).toBe(true)
  await restore.click()
  expect(await visible('Report list marker')).toBe(true)
  expect(
    await dialog.locator('table').evaluate((table) => {
      const pane = table.parentElement!
      pane.scrollTop = 150
      return pane.scrollTop > 0
    }),
  ).toBe(true)
  expect(
    await scrollIntoView(dialog.getByText('Report after the table', { exact: true })),
    'Report after the table is visible before expand',
  ).toBe(true)
  await expand.click()
  expect(await visible('Report after the table')).toBe(true)
  await select(otherFile)
  await dialog.getByRole('heading', { name: 'Other passage 1', exact: true }).waitFor()
  await page.addInitScript(() => {
    const saved = sessionStorage.getItem('ultimate.resume') ?? ''
    new MutationObserver(() => {
      const cover = document.querySelector('#resume')
      if (!cover) return
      document.documentElement.dataset.snapshotProbe = JSON.stringify({
        captured: saved.includes('Open report'),
        leaked: /private-second-fixture|Other passage 1/.test(saved + cover.textContent),
      })
    }).observe(document, { subtree: true, childList: true })
  })
  await page.reload()
  expect(await page.locator('html').getAttribute('data-snapshot-probe')).toBe(
    '{"captured":true,"leaked":false}',
  )
  await dialog.waitFor({ state: 'hidden' })
  const persisted = await page.evaluate(() =>
    Object.entries(localStorage).filter(([key]) => key.startsWith('ultimate.markdown-viewer.')),
  )
  expect(JSON.stringify(persisted)).not.toMatch(
    /report\.md|private-second-fixture|synthetic section|not-a-real-directory/,
  )
  expect(persisted.find(([key]) => key.endsWith('.positions'))?.[1]).toMatch(/[a-f0-9]{64}/)
  await chatLink.click()
  expect(await restore.isVisible()).toBe(true)
  await select(file)
  await dialog.getByRole('heading', { name: 'Synthetic report' }).waitFor()
  expect(await visible('Report after the table')).toBe(true)
  expect(requests).toEqual([])
})
