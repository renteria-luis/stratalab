import type { Locale } from './locales';
import { en, type MessageKey, type Messages } from './messages/en';
import { es } from './messages/es';

export type { MessageKey } from './messages/en';

export type MessageParams = Readonly<Record<string, string | number>>;

/** Keys that have `_one` / `_other` forms, without the suffix. */
export type PluralKey = {
  [K in MessageKey]: K extends `${infer Base}_other` ? Base : never;
}[MessageKey];

const MESSAGES: Readonly<Record<Locale, Messages>> = { en, es };

/** Replaces `{name}` placeholders; unknown placeholders are left as written. */
export function format(template: string, params: MessageParams = {}): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = params[name];
    return value === undefined ? whole : String(value);
  });
}

export function translate(locale: Locale, key: MessageKey, params?: MessageParams): string {
  return format(MESSAGES[locale][key], params);
}

/** Picks `_one` or `_other` with `Intl.PluralRules`; `count` is also a placeholder. */
export function translatePlural(
  locale: Locale,
  key: PluralKey,
  count: number,
  params: MessageParams = {},
): string {
  const one = `${key}_one` as const;
  const other = `${key}_other` as const;
  const rule = new Intl.PluralRules(locale).select(count);
  const messageKey: MessageKey = rule === 'one' && one in MESSAGES[locale] ? one : other;
  return translate(locale, messageKey, { ...params, count });
}
