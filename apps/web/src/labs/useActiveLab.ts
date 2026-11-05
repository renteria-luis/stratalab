import { LABS, type Lab, type LocalizedText } from '@sim/labs';
import type { Locale } from '../i18n/locales';
import { useLabs } from '../state/labStore';

export function labById(labId: string | null): Lab | undefined {
  return LABS.find((lab) => lab.id === labId);
}

/** The open lab, or undefined in the sandbox. */
export function useActiveLab(): Lab | undefined {
  return labById(useLabs((state) => state.activeLabId));
}

/** Lab text in the UI language. */
export function local(text: LocalizedText, locale: Locale): string {
  return text[locale];
}
