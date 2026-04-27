import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'

import en from './locales/en.json'
import cs from './locales/cs.json'

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      cs: { translation: cs },
    },
    fallbackLng: 'en',
    supportedLngs: ['en', 'cs'],
    nonExplicitSupportedLngs: true,  // 'cs-CZ' → 'cs'
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
    interpolation: { escapeValue: false },
  })

export default i18n
