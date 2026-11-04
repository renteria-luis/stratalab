import Badge from '@cloudscape-design/components/badge';
import FormField from '@cloudscape-design/components/form-field';
import Select from '@cloudscape-design/components/select';
import SideNavigation, {
  type SideNavigationProps,
} from '@cloudscape-design/components/side-navigation';
import type { ConsoleNav, NavItem } from '@sim/catalog';
import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router';
import type { Translator } from '../i18n/useT';
import { useT } from '../i18n/useT';
import { navItemHref } from '../routes/appRoutes';

/**
 * Side navigation of a reproduced console, exactly as its nav file says: section titles,
 * dividers, "New" badges and external-link marks. Labels stay as captured.
 */
export function ConsoleSideNav({ nav }: { nav: ConsoleNav }) {
  const translator = useT();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const items = useMemo(() => toSideNavItems(nav, translator), [nav, translator]);

  return (
    <SideNavigation
      header={{ text: nav.header.label, href: navItemHref(nav.header) }}
      activeHref={pathname}
      items={items}
      itemsControl={nav.filter && <NavFilter filter={nav.filter} />}
      onFollow={(event) => {
        // External items open a new tab, as in the real console.
        if (event.detail.external === true) return;
        event.preventDefault();
        void navigate(event.detail.href);
      }}
    />
  );
}

/** "Filter by VPC": no options until the topology has VPCs (P7). */
function NavFilter({ filter }: { filter: NonNullable<ConsoleNav['filter']> }) {
  const { t } = useT();
  return (
    <FormField label={filter.label}>
      <Select
        selectedOption={null}
        options={[]}
        placeholder={filter.placeholder}
        empty={t('nav.filterNoOptions')}
        onChange={() => undefined}
      />
    </FormField>
  );
}

function toLink(item: NavItem, { t }: Translator): SideNavigationProps.Link {
  return {
    type: 'link',
    text: item.label,
    href: navItemHref(item),
    external: item.external,
    externalIconAriaLabel: item.external ? t('nav.opensInNewTab') : undefined,
    info: item.badge === 'New' ? <Badge color="green">{t('nav.badgeNew')}</Badge> : undefined,
  };
}

function toSideNavItems(nav: ConsoleNav, translator: Translator): SideNavigationProps.Item[] {
  const items: SideNavigationProps.Item[] = [];
  for (const section of nav.sections) {
    if (section.dividerBefore) items.push({ type: 'divider' });
    const links = section.items.map((item) => toLink(item, translator));
    if (section.title === undefined) items.push(...links);
    else items.push({ type: 'section', text: section.title, items: links });
  }
  return items;
}
