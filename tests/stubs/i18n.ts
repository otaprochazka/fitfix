/**
 * Test-only stub for `src/i18n.ts`. The real module pulls in
 * `i18next-browser-languagedetector` (window/navigator/localStorage) and
 * `react-i18next` — neither of which we want in node API tests.
 *
 * The stub's `t()` returns the key (plus serialised vars) so detector
 * body assertions can check templating logic without depending on the
 * en/cs JSON.
 */

const t = (key: string, vars?: Record<string, unknown>): string =>
  vars ? `${key}::${JSON.stringify(vars)}` : key

export default {
  t,
  on: () => {},
  off: () => {},
  changeLanguage: async () => {},
  language: 'en',
  // Plugin register modules push detector/tool i18n bundles at import time;
  // make this a no-op so importing them in tests doesn't crash.
  addResourceBundle: () => {},
}
