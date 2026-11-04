import { useMemo } from 'react';
import { useUi } from '../state/uiStore';
import type { Locale } from './locales';
import {
  translate,
  translatePlural,
  type MessageKey,
  type MessageParams,
  type PluralKey,
} from './translate';

export interface Translator {
  readonly locale: Locale;
  readonly t: (key: MessageKey, params?: MessageParams) => string;
  readonly tPlural: (key: PluralKey, count: number, params?: MessageParams) => string;
}

/** Translator for the current UI locale. Every user-facing string goes through it. */
export function useT(): Translator {
  const locale = useUi((state) => state.locale);
  return useMemo(
    () => ({
      locale,
      t: (key, params) => translate(locale, key, params),
      tPlural: (key, count, params) => translatePlural(locale, key, count, params),
    }),
    [locale],
  );
}
