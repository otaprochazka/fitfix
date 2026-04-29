/**
 * Smoke: drop a real FIT file → editor renders → summary card appears.
 *
 * Cross-checks the parser by computing the API result on the same bytes
 * in node and asserting the rendered distance matches.
 */

import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { parseActivity } from '../../src/lib/activity'

const FIXTURE = resolve(
  import.meta.dirname,
  '..',
  '..',
  'public',
  'samples',
  'garmin-edge-500-cycling.fit',
)

test('drop a FIT file → editor renders with summary', async ({ page }) => {
  await page.goto('/')

  // Hidden input is mounted from the start (DropZone uses ref + click)
  const input = page.getByTestId('dropzone-input')
  await input.setInputFiles(FIXTURE)

  // The editor mounts when a single FIT is loaded (HomeView auto-routes)
  const editor = page.getByTestId('editor-root')
  await expect(editor).toBeVisible({ timeout: 15_000 })

  // Cross-check: parser sees a non-trivial activity. The editor's summary
  // card displays the distance in km — we confirm it appears in the DOM.
  const bytes = new Uint8Array(readFileSync(FIXTURE))
  const activity = parseActivity(bytes, 'edge-500.fit')
  const expectedKm = (activity.meta.totalDistanceM! / 1000).toFixed(2)

  await expect(editor).toContainText(`${expectedKm} km`)
})
