/**
 * One-off helper: capture marketing screenshots from the live dev/preview
 * server and write them to /public. Run against http://127.0.0.1:5180
 * (or set FITFIX_URL). The PNGs are referenced by AppPreviewCarousel.
 *
 *   npx tsx scripts/capture-screenshots.ts
 */
import { chromium } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const BASE = process.env.FITFIX_URL ?? 'http://127.0.0.1:5180'
const OUT_DIR = resolve(process.cwd(), 'public')

const W = 1280
const H = 1024

async function ensureDir(file: string) {
  await mkdir(dirname(file), { recursive: true })
}

async function main() {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 2,
    locale: 'en-US',
  })
  const page = await ctx.newPage()

  // 1. Open the cycling sample to enter the editor.
  await page.goto(`${BASE}/?lang=en`, { waitUntil: 'networkidle' })
  await page.waitForSelector('text=Fix, merge')
  await ensureDir(`${OUT_DIR}/.placeholder`)
  await page.click('button:has-text("Cycling")')
  await page.waitForURL(/.*/, { waitUntil: 'networkidle' })
  await page.waitForSelector('text=What we found', { timeout: 15000 })
  await page.waitForTimeout(1500) // let leaflet tiles settle
  const editor = `${OUT_DIR}/screenshot-editor.png`
  await page.screenshot({ path: editor, clip: { x: 0, y: 0, width: W, height: H } })

  // 3. GPS jitter sub-tool — open the first advisor card.
  const jitter = page.locator('text=GPS jitter').first()
  if (await jitter.count()) {
    await jitter.click()
    await page.waitForTimeout(1500)
    const tool = `${OUT_DIR}/screenshot-jitter.png`
    await page.screenshot({ path: tool, clip: { x: 0, y: 0, width: W, height: H } })
    console.log('wrote', tool)
  }

  console.log('wrote', editor)

  await browser.close()
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
