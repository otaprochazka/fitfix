/**
 * Drop a non-FIT/non-TCX file → app should reject it gracefully.
 *
 * DropZone only accepts .fit / .tcx extensions, so a .txt drop is
 * silently ignored. We assert the user stays on the home page (no
 * routing to editor) and no JS error escapes to the page.
 */

import { test, expect } from '@playwright/test'

test('non-FIT/TCX file is silently rejected, app stays on home', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))

  await page.goto('/')

  const input = page.getByTestId('dropzone-input')
  await input.setInputFiles({
    name: 'random.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('not a fit file'),
  })

  // Editor should NOT mount (DropZone filtered the file out by extension)
  await expect(page.getByTestId('editor-root')).toHaveCount(0, { timeout: 2_000 })

  // Drop zone is still on the page
  await expect(page.getByTestId('dropzone')).toBeVisible()

  // No uncaught exceptions
  expect(errors, `pageerror events: ${errors.join('\n')}`).toEqual([])
})

test('drop a FIT named with bogus content → editor surfaces the parse error', async ({ page }) => {
  await page.goto('/')

  // .fit extension passes the DropZone filter, then the parser will fail
  // — exercises the error-handling path inside the editor.
  await page.getByTestId('dropzone-input').setInputFiles({
    name: 'broken.fit',
    mimeType: 'application/octet-stream',
    buffer: Buffer.alloc(64), // zeros — definitely not a valid FIT header
  })

  const editor = page.getByTestId('editor-root')
  await expect(editor).toBeVisible({ timeout: 10_000 })
  await expect(page.getByTestId('editor-error')).toBeVisible({ timeout: 10_000 })
})
