import Badge from '@cloudscape-design/components/badge';
import FormField from '@cloudscape-design/components/form-field';
import Select, { type SelectProps } from '@cloudscape-design/components/select';
import SideNavigation, {
  type SideNavigationProps,
} from '@cloudscape-design/components/side-navigation';
import type { ConsoleNav, NavItem } from '@sim/catalog';
import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { ct } from '../console/text';
import { navItemHref } from '../routes/appRoutes';
import { useTopology } from '../state/topologyStore';
import { useUi } from '../state/uiStore';

/**
 * Side navigation of a reproduced console, exactly as its nav file says: section titles,
 * dividers, "New" badges and external-link marks. Labels stay as captured. `activeHref` is
 * the nav page a create or edit page belongs to.
 */
export function ConsoleSideNav({ nav, activeHref }: { nav: ConsoleNav; activeHref: string }) {
  const navigate = useNavigate();
  const items = useMemo(() => toSideNavItems(nav), [nav]);

  return (
    <SideNavigation
      header={{ text: nav.header.label, href: navItemHref(nav.header) }}
      activeHref={activeHref}
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

/** "Filter by VPC": the VPCs of the active topology; the choice lasts for the session. */
function NavFilter({ filter }: { filter: NonNullable<ConsoleNav['filter']> }) {
  const topology = useTopology();
  const vpcFilter = useUi((state) => state.vpcFilter);
  const setVpcFilter = useUi((state) => state.setVpcFilter);
  const options: SelectProps.Option[] = topology.vpcs.map((vpc) => ({
    value: vpc.id,
    label: vpc.id,
    description: vpc.name,
  }));
  const selected = options.find((option) => option.value === vpcFilter) ?? null;

  return (
    <FormField label={filter.label}>
      <Select
        selectedOption={selected}
        options={options}
        placeholder={filter.placeholder}
        empty={ct('nav.filterNoOptions')}
        filteringType={options.length > 5 ? 'auto' : 'none'}
        onChange={({ detail }) => {
          const value = detail.selectedOption.value;
          setVpcFilter(value === undefined || value === vpcFilter ? null : value);
        }}
      />
    </FormField>
  );
}

function toLink(item: NavItem): SideNavigationProps.Link {
  return {
    type: 'link',
    text: item.label,
    href: navItemHref(item),
    external: item.external,
    externalIconAriaLabel: item.external ? ct('nav.opensInNewTab') : undefined,
    info: item.badge === 'New' ? <Badge color="green">{ct('nav.badgeNew')}</Badge> : undefined,
  };
}

function toSideNavItems(nav: ConsoleNav): SideNavigationProps.Item[] {
  const items: SideNavigationProps.Item[] = [];
  for (const section of nav.sections) {
    if (section.dividerBefore) items.push({ type: 'divider' });
    const links = section.items.map(toLink);
    if (section.title === undefined) items.push(...links);
    else items.push({ type: 'section', text: section.title, items: links });
  }
  return items;
}
