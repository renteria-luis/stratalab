export const LOCALES = ['en', 'es'] as const;
export type Locale = (typeof LOCALES)[number];

/** Language names in their own language, so each option is readable in any UI locale. */
export const LOCALE_NAMES: Readonly<Record<Locale, string>> = { en: 'English', es: 'Español' };

/** First supported language in the browser's preference list; English otherwise. */
export function detectLocale(languages: readonly string[]): Locale {
  for (const language of languages) {
    const base = language.toLowerCase().split('-')[0];
    const match = LOCALES.find((locale) => locale === base);
    if (match) return match;
  }
  return 'en';
}
