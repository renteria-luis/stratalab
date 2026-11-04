import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Icon from '@cloudscape-design/components/icon';
import Link from '@cloudscape-design/components/link';
import ToggleButton from '@cloudscape-design/components/toggle-button';
import type { Service } from '@sim/catalog';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import { useT } from '../i18n/useT';
import { serviceHref, servicesById } from '../routes/appRoutes';
import { useUi } from '../state/uiStore';
import {
  CATEGORY_ICONS,
  FALLBACK_CATEGORY_ICON,
  VIEW_ICONS,
  listedServices,
  menuCategoryGroups,
  menuViews,
  type MenuGroup,
} from './menuData';

interface ServicesMenuProps {
  /** Element under the top bar that the panel is rendered into. */
  readonly anchor: HTMLElement | null;
}

/**
 * The services menu: views and categories from the catalog on the left, the selected
 * group's services on the right. A non-modal dialog: Escape or a click outside closes it,
 * and focus returns to the trigger.
 */
export function ServicesMenu({ anchor }: ServicesMenuProps) {
  const { t } = useT();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string>(menuViews[0]?.name ?? '');
  const triggerWrapperRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const headingId = useId();

  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) triggerWrapperRef.current?.querySelector('button')?.focus();
  };

  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>('[aria-current="true"]')?.focus();
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || triggerWrapperRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && open) {
      event.stopPropagation();
      close(true);
    }
  };

  const openService = (service: Service) => {
    setOpen(false);
    void navigate(serviceHref(service));
  };

  const groups: readonly MenuGroup[] = [...menuViews, ...menuCategoryGroups];
  const current = groups.find((group) => group.name === selected) ?? groups[0];

  const panel = (
    <div
      ref={panelRef}
      id={panelId}
      className="sim-services-panel"
      role="dialog"
      aria-label={t('menu.dialogLabel')}
      onKeyDown={onKeyDown}
    >
      <div className="sim-services-groups">
        <GroupList
          label={t('menu.viewsLabel')}
          groups={menuViews}
          selected={current?.name}
          onSelect={setSelected}
        />
        <hr />
        <GroupList
          label={t('menu.categoriesLabel')}
          groups={menuCategoryGroups}
          selected={current?.name}
          onSelect={setSelected}
        />
      </div>
      <section className="sim-services-content" aria-labelledby={headingId}>
        <div className="sim-services-content__header">
          <div id={headingId}>
            <Box variant="h2" margin="n">
              {current?.name}
            </Box>
          </div>
          <Button
            variant="icon"
            iconName="close"
            ariaLabel={t('menu.close')}
            onClick={() => {
              close(true);
            }}
          />
        </div>
        {current && <GroupContent group={current} onOpen={openService} />}
      </section>
    </div>
  );

  return (
    <>
      <span ref={triggerWrapperRef} onKeyDown={onKeyDown}>
        <Button
          variant="normal"
          iconName={open ? 'caret-up-filled' : 'caret-down-filled'}
          iconAlign="right"
          ariaExpanded={open}
          ariaControls={open ? panelId : undefined}
          onClick={() => {
            setOpen((value) => !value);
          }}
        >
          {t('menu.button')}
        </Button>
      </span>
      {open && anchor !== null && createPortal(panel, anchor)}
    </>
  );
}

interface GroupListProps {
  readonly label: string;
  readonly groups: readonly MenuGroup[];
  readonly selected: string | undefined;
  readonly onSelect: (name: string) => void;
}

function GroupList({ label, groups, selected, onSelect }: GroupListProps) {
  return (
    <ul aria-label={label}>
      {groups.map((group) => (
        <li key={`${group.kind}:${group.name}`}>
          <button
            type="button"
            className="sim-services-group-button"
            aria-current={group.name === selected ? 'true' : undefined}
            onClick={() => {
              onSelect(group.name);
            }}
          >
            <Icon
              name={
                group.kind === 'view'
                  ? VIEW_ICONS[group.behavior]
                  : (CATEGORY_ICONS[group.name] ?? FALLBACK_CATEGORY_ICON)
              }
            />
            <span>{group.name}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

const byIds = (ids: readonly string[]): Service[] =>
  ids.flatMap((id) => {
    const service = servicesById.get(id);
    return service && service.retired !== true ? [service] : [];
  });

function GroupContent({ group, onOpen }: { group: MenuGroup; onOpen: (service: Service) => void }) {
  const { t } = useT();
  const recent = useUi((state) => state.recentServiceIds);
  const favorites = useUi((state) => state.favoriteServiceIds);

  if (group.kind === 'category') return <ServiceList services={group.services} onOpen={onOpen} />;
  switch (group.behavior) {
    case 'recent':
      return recent.length === 0 ? (
        <EmptyGroup title={t('menu.recent.empty')} hint={t('menu.recent.emptyHint')} />
      ) : (
        <ServiceList services={byIds(recent)} onOpen={onOpen} />
      );
    case 'favorites':
      return favorites.length === 0 ? (
        <EmptyGroup title={t('menu.favorites.empty')} hint={t('menu.favorites.emptyHint')} />
      ) : (
        <ServiceList services={byIds(favorites)} onOpen={onOpen} />
      );
    case 'applications':
      return (
        <EmptyGroup title={t('menu.applications.empty')} hint={t('menu.applications.emptyHint')} />
      );
    case 'all':
      return <ServiceList services={listedServices} onOpen={onOpen} />;
  }
}

function EmptyGroup({ title, hint }: { title: string; hint: string }) {
  return (
    <Box textAlign="center" padding={{ vertical: 'l' }} color="text-body-secondary">
      <Box variant="strong" color="inherit">
        {title}
      </Box>
      <Box variant="p" color="inherit">
        {hint}
      </Box>
    </Box>
  );
}

function ServiceList({
  services,
  onOpen,
}: {
  services: readonly Service[];
  onOpen: (service: Service) => void;
}) {
  const { t } = useT();
  const favorites = useUi((state) => state.favoriteServiceIds);
  const toggleFavorite = useUi((state) => state.toggleFavorite);
  return (
    <ul className="sim-services-list">
      {services.map((service) => (
        <li key={service.id} className="sim-services-item">
          <ToggleButton
            variant="icon"
            iconName="star"
            pressedIconName="star-filled"
            pressed={favorites.includes(service.id)}
            ariaLabel={t('menu.favorite', { name: service.name })}
            onChange={() => {
              toggleFavorite(service.id);
            }}
          />
          <div>
            <Link
              href={serviceHref(service)}
              onFollow={(event) => {
                event.preventDefault();
                onOpen(service);
              }}
            >
              {service.name}
            </Link>
            {service.menuDescription !== undefined && (
              <Box variant="small" display="block" color="text-body-secondary">
                {service.menuDescription}
              </Box>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
