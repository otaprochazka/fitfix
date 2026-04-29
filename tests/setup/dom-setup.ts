/**
 * Vitest setup for the `dom` (jsdom) project.
 *
 * Adds @testing-library/jest-dom matchers (toBeInTheDocument, etc.) and
 * stubs react-i18next + the i18n module so tests don't pull in the real
 * detector/loader chain. The stub returns the i18n key for non-namespaced
 * lookups so assertions can match against either label text or the key.
 */

import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import stub from '../stubs/i18n'

afterEach(() => cleanup())

vi.mock('../../src/i18n', () => ({ default: stub }))

vi.mock('react-i18next', () => {
  const t = (key: string, opts?: Record<string, unknown> & { defaultValue?: string }) => {
    if (opts && typeof opts.defaultValue === 'string') {
      // Substitute {{name}} etc. so defaultValues exercise the same path
      // the real i18next would when a key is missing.
      return opts.defaultValue.replace(/\{\{(\w+)\}\}/g, (_, k) =>
        opts[k] != null ? String(opts[k]) : `{{${k}}}`)
    }
    return key
  }
  return {
    useTranslation: () => ({ t, i18n: { language: 'en', changeLanguage: () => {} } }),
    Trans: ({ children }: { children?: unknown }) => children,
    initReactI18next: { type: '3rdParty', init: () => {} },
  }
})
