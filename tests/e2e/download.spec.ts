/**
 * Drop a FIT, click each export button, assert the download fires and
 * produces a non-zero file. Catches export-button regressions and the
 * fitToGpx / fitToTcx wiring through the UI.
 */

import { test, expect } from '@playwright/test'
import { resolve } from 'node:path'
import { statSync } from 'node:fs'

const FIXTURE = resolve(
  import.meta.dirname,
  '..',
  '..',
  'public',
  'samples',
  'garmin-edge-500-cycling.fit',
)

test('export buttons download non-zero FIT / GPX / TCX', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('dropzone-input').setInputFiles(FIXTURE)
  await expect(page.getByTestId('editor-root')).toBeVisible({ timeout: 15_000 })

  for (const id of ['export-fit', 'export-gpx', 'export-tcx'] as const) {
    const button = page.getByTestId(id)
    await expect(button).toBeVisible()

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      button.click(),
    ])

    const path = await download.path()
    expect(path).toBeTruthy()
    const size = statSync(path!).size
    expect(size, `${id} produced an empty file`).toBeGreaterThan(0)

    // Filename has the expected extension. Exporting the original FIT
    // keeps `.fit`; GPX → `.gpx`; TCX → `.tcx`.
    const expectedExt = id.split('-')[1]
    expect(download.suggestedFilename()).toMatch(new RegExp(`\\.${expectedExt}$`, 'i'))
  }
})
