import { describe, expect, it } from 'vitest';
import { detectLocale } from '../src/i18n/locales';
import { en } from '../src/i18n/messages/en';
import { es } from '../src/i18n/messages/es';
import { format, translate, translatePlural } from '../src/i18n/translate';

describe('i18n', () => {
  it('I18N: en and es define the same keys, none empty', () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
    for (const [key, value] of [...Object.entries(en), ...Object.entries(es)]) {
      expect(value.trim(), key).not.toBe('');
    }
  });

  it('I18N: both locales use the same placeholders for each key', () => {
    const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(placeholders(es[key]), key).toEqual(placeholders(en[key]));
    }
  });

  it('I18N: formats placeholders and keeps unknown ones as written', () => {
    expect(format('{a} and {b}', { a: 1 })).toBe('1 and {b}');
    expect(translate('es', 'reference.openConsole', { name: 'VPC' })).toBe(
      es['reference.openConsole'].replace('{name}', 'VPC'),
    );
  });

  it('I18N: picks the plural form with Intl.PluralRules', () => {
    expect(translatePlural('en', 'home.health.issues', 1)).toBe('1 issue found');
    expect(translatePlural('en', 'home.health.issues', 3)).toBe('3 issues found');
    expect(translatePlural('es', 'home.health.issues', 0)).toBe('0 problemas encontrados');
  });

  it('I18N: detects the first supported browser language, English otherwise', () => {
    expect(detectLocale(['es-MX', 'en'])).toBe('es');
    expect(detectLocale(['fr-FR', 'es'])).toBe('es');
    expect(detectLocale(['fr-FR'])).toBe('en');
    expect(detectLocale([])).toBe('en');
  });
});
