import TopNavigation from '@cloudscape-design/components/top-navigation';
import { useNavigate } from 'react-router';
import { LOCALES, LOCALE_NAMES, type Locale } from '../i18n/locales';
import { useT } from '../i18n/useT';
import { FAKE_ACCOUNT_ID, FAKE_USER_NAME, PRODUCT_LOGO_URL, PRODUCT_NAME } from '../product';
import { useUi } from '../state/uiStore';
import { GlobalSearch } from './GlobalSearch';
import { ServicesMenu } from './ServicesMenu';

const isLocale = (value: string): value is Locale => LOCALES.some((locale) => locale === value);

/**
 * Top bar with our product name and placeholder logo, never AWS branding (AGENTS.md,
 * branding rules). The account is an obvious fake.
 */
export function TopBar({ servicesMenuAnchor }: { servicesMenuAnchor: HTMLElement | null }) {
  const { t, locale } = useT();
  const navigate = useNavigate();
  const setLocale = useUi((state) => state.setLocale);

  return (
    <TopNavigation
      identity={{
        href: '/',
        title: PRODUCT_NAME,
        logo: { src: PRODUCT_LOGO_URL, alt: t('top.logoAlt', { product: PRODUCT_NAME }) },
        onFollow: (event) => {
          event.preventDefault();
          void navigate('/');
        },
      }}
      search={
        <div className="sim-search-area">
          <ServicesMenu anchor={servicesMenuAnchor} />
          <div className="sim-search-area__input">
            <GlobalSearch />
          </div>
        </div>
      }
      utilities={[
        {
          type: 'menu-dropdown',
          iconName: 'globe',
          text: LOCALE_NAMES[locale],
          title: t('top.language'),
          ariaLabel: `${t('top.language')}: ${LOCALE_NAMES[locale]}`,
          items: LOCALES.map((option) => ({
            id: option,
            text: LOCALE_NAMES[option],
            lang: option,
          })),
          onItemClick: ({ detail }) => {
            if (isLocale(detail.id)) setLocale(detail.id);
          },
        },
        {
          type: 'menu-dropdown',
          iconName: 'user-profile',
          text: FAKE_USER_NAME,
          description: t('top.accountId', { id: FAKE_ACCOUNT_ID }),
          items: [{ id: 'account-id', text: t('top.accountId', { id: FAKE_ACCOUNT_ID }) }],
        },
      ]}
      i18nStrings={{
        overflowMenuTriggerText: t('top.overflowMenuTrigger'),
        overflowMenuTitleText: t('top.overflowMenuTitle'),
        searchIconAriaLabel: t('top.searchIconAriaLabel'),
        searchDismissIconAriaLabel: t('top.searchDismissIconAriaLabel'),
      }}
    />
  );
}
