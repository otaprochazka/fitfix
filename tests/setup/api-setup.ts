/**
 * Vitest setup for the `api` project.
 *
 * Mocks `src/i18n` globally so detector modules (which import it for
 * Suggestion title/body strings) can run in plain Node without dragging
 * in i18next-browser-languagedetector or react-i18next.
 */

import { vi } from 'vitest'
import stub from '../stubs/i18n'

vi.mock('../../src/i18n', () => ({ default: stub }))
