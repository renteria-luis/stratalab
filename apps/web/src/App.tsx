import { I18nProvider } from '@cloudscape-design/components/i18n';
import cloudscapeEn from '@cloudscape-design/components/i18n/messages/all.en';
import cloudscapeEs from '@cloudscape-design/components/i18n/messages/all.es';
import { useEffect, type ReactNode } from 'react';
import { useUi } from './state/uiStore';

const CLOUDSCAPE_MESSAGES = [cloudscapeEn, cloudscapeEs];

/** Cloudscape's own strings follow the UI locale, and so does `<html lang>`. */
export function AppProviders({ children }: { children: ReactNode }) {
  const locale = useUi((state) => state.locale);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return (
    <I18nProvider locale={locale} messages={CLOUDSCAPE_MESSAGES}>
      {children}
    </I18nProvider>
  );
}
