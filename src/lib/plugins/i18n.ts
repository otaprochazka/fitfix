/**
 * Helper for phase modules to register their own translation keys without
 * editing the central locale JSONs. Each phase puts its strings under
 * `editor.<phaseId>.*` to keep the keyspace tidy.
 *
 * Example:
 *   addEditorBundle('elevation', enStrings, csStrings)
 *   // makes t('editor.elevation.title') resolve in both languages.
 */

import i18n from '../../i18n'

type Bundle = Record<string, unknown>

export function addEditorBundle(phaseId: string, en: Bundle, cs?: Bundle): void {
  i18n.addResourceBundle('en', 'translation', { editor: { [phaseId]: en } }, true, true)
  if (cs) {
    i18n.addResourceBundle('cs', 'translation', { editor: { [phaseId]: cs } }, true, true)
  }
}
