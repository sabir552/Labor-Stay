import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './locales/en.json';
import ar from './locales/ar.json';
import ur from './locales/ur.json';

const RTL_LANGS = new Set(['ar', 'ur']);

export function applyLangToDocument(lang) {
  const html = document.documentElement;
  html.setAttribute('lang', lang);
  html.setAttribute('dir', RTL_LANGS.has(lang) ? 'rtl' : 'ltr');
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      ar: { translation: ar },
      ur: { translation: ur },
    },
    fallbackLng: 'en',
    supportedLngs: ['en', 'ar', 'ur'],
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'laborstay_lang',
    },
  });

applyLangToDocument(i18n.language || 'en');
i18n.on('languageChanged', (lng) => applyLangToDocument(lng));

export default i18n;
