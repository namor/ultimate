import { fauxAssistantMessage } from '@earendil-works/pi-ai/providers/faux'
import type { ConversationId } from '@earendil-works/pi-durable'
import { writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { chromium } from 'playwright-core'
import { afterEach, expect, it } from 'vitest'
import { browserBinary } from '../../extensions/browser/server.ts'
import { context } from '../../server/harness.ts'
import { fauxServer, post, removeTemp, temp } from '../helpers.ts'

const cleanup: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const close of cleanup.splice(0).toReversed()) await close()
})

it('opens a local Markdown chat link only through the chooser and renders the selected file in place', async () => {
  const home = await temp('ultimate-markdown-viewer-')
  cleanup.push(() => removeTemp(home))
  const file = join(home, 'report.md')
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
      '[Inert link](https://viewer-probe.invalid/link)',
      '',
      '![Image](https://viewer-probe.invalid/image.png)',
      '',
      '<img src="https://viewer-probe.invalid/raw.png">',
    ].join('\n'),
  )
  const server = await fauxServer({
    ultimateRoot: resolve('.'),
    projectRoot: resolve('.'),
    userHome: home,
    home: join(home, 'state'),
    port: 0,
  })
  cleanup.push(() => server.close())
  server.host.faux!.setResponses([
    fauxAssistantMessage(
      '[Open report](file:///not-a-real-directory/report.md)\n\n[Other file](file:///tmp/plain.txt) · [Remote file](file://elsewhere/report.md)',
    ),
  ])
  const id = (await post(server, '/api/conversations', {})).data.id as ConversationId
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
    if (new URL(request.url()).hostname === 'viewer-probe.invalid') requests.push(request.url())
  })
  await page.goto(`${server.url}/?conversation=${id}`)
  const chatLink = page.getByRole('button', { name: 'Open report', exact: true })
  await chatLink.click()
  expect(await page.getByText('Other file [blocked]', { exact: false }).count()).toBeGreaterThan(0)
  expect(await page.getByText('Remote file [blocked]', { exact: false }).count()).toBeGreaterThan(0)
  const dialog = page.getByRole('dialog')
  expect(await dialog.innerText()).toContain('cannot read it from the link alone')
  const chooser = page.waitForEvent('filechooser')
  await dialog.getByRole('button', { name: 'Choose file' }).click()
  await (await chooser).setFiles(file)
  await dialog.getByRole('heading', { name: 'Synthetic report' }).waitFor()
  expect(await dialog.locator('figure').first().innerText()).toMatch(
    /Mermaid diagram.*Start.*▶.*Done/s,
  )
  expect(await dialog.locator('figure').last().innerText()).toMatch(
    /Diagram unavailable.*Missing bracket/s,
  )
  expect(await dialog.locator('a,img,iframe,script').count()).toBe(0)
  expect(requests).toEqual([])
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'hidden' })
  await chatLink.click()
  expect(await dialog.innerText()).not.toContain('Synthetic report')
})
