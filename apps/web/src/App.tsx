import { I18nProvider } from '@cloudscape-design/components/i18n';
import cloudscapeEn from '@cloudscape-design/components/i18n/messages/all.en';
import { useEffect, type ReactNode } from 'react';

const CLOUDSCAPE_MESSAGES = [cloudscapeEn];

/**
 * The console is English only (AGENTS.md, "Language"), so Cloudscape's own strings and
 * `<html lang>` stay English. Simulator text carries `lang` with the UI locale where it
 * appears (WCAG 3.1.2, language of parts).
 */
export function AppProviders({ children }: { children: ReactNode }) {
  useEffect(() => {
    document.documentElement.lang = 'en';
  }, []);
  return (
    <I18nProvider locale="en" messages={CLOUDSCAPE_MESSAGES}>
      {children}
    </I18nProvider>
  );
}
