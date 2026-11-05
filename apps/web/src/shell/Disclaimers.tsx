import Icon from '@cloudscape-design/components/icon';
import { useT } from '../i18n/useT';
import { PRODUCT_NAME } from '../product';

/** Always visible above the top bar (AGENTS.md, security and branding). Not dismissible. */
export function DisclaimerBanner() {
  const { t, locale } = useT();
  return (
    <p className="sim-banner" lang={locale}>
      <Icon name="status-info" variant="inverted" />
      <span>{t('banner.text')}</span>
    </p>
  );
}

/** Trademark attribution and the not-affiliated statement (AGENTS.md). */
export function AppFooter({ id }: { id: string }) {
  const { t, locale } = useT();
  return (
    <footer id={id} className="sim-footer" lang={locale}>
      <p>{t('footer.disclaimer', { product: PRODUCT_NAME })}</p>
      <p>{t('footer.trademark')}</p>
    </footer>
  );
}
