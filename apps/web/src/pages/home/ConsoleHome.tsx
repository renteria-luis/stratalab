import Board, { type BoardProps } from '@cloudscape-design/board-components/board';
import BoardItem from '@cloudscape-design/board-components/board-item';
import ContentLayout from '@cloudscape-design/components/content-layout';
import Header from '@cloudscape-design/components/header';
import { useMemo } from 'react';
import { useT, type Translator } from '../../i18n/useT';
import type { MessageKey } from '../../i18n/translate';
import { useUi, type HomeLayoutItem } from '../../state/uiStore';
import { applyLayout, toLayout, type WidgetId } from './layout';
import {
  EstimatedCostWidget,
  LabsInProgressWidget,
  RecentlyVisitedWidget,
  TopologyHealthWidget,
} from './widgets';

const WIDGET_TITLES: Readonly<Record<WidgetId, MessageKey>> = {
  'recently-visited': 'home.recent.title',
  'labs-in-progress': 'home.labs.title',
  'topology-health': 'home.health.title',
  'estimated-cost': 'home.cost.title',
};

function WidgetContent({ id }: { id: WidgetId }) {
  switch (id) {
    case 'recently-visited':
      return <RecentlyVisitedWidget />;
    case 'labs-in-progress':
      return <LabsInProgressWidget />;
    case 'topology-health':
      return <TopologyHealthWidget />;
    case 'estimated-cost':
      return <EstimatedCostWidget />;
  }
}

/**
 * Console Home: a widget board with simulator data only (catalog skill, branding limits).
 * No imitation AWS Health, Trusted Advisor or billing widgets, and no invented numbers.
 */
export function ConsoleHome() {
  const translator = useT();
  const { t } = translator;
  const storedLayout = useUi((state) => state.homeLayout);
  const setHomeLayout = useUi((state) => state.setHomeLayout);
  const items = useMemo(() => applyLayout(storedLayout), [storedLayout]);
  const boardStrings = useMemo(() => boardI18n(translator), [translator]);
  const itemStrings = useMemo(
    () => ({
      dragHandleAriaLabel: t('home.board.dragHandle'),
      dragHandleAriaDescription: t('home.board.handleDescription'),
      resizeHandleAriaLabel: t('home.board.resizeHandle'),
      resizeHandleAriaDescription: t('home.board.handleDescription'),
    }),
    [t],
  );

  return (
    <ContentLayout header={<Header variant="h1">{t('home.title')}</Header>}>
      <Board<WidgetId>
        items={items}
        renderItem={(item) => (
          <BoardItem
            header={<Header variant="h2">{t(WIDGET_TITLES[item.data])}</Header>}
            i18nStrings={itemStrings}
          >
            <WidgetContent id={item.data} />
          </BoardItem>
        )}
        onItemsChange={({ detail }) => {
          setHomeLayout(detail.items.map(toLayout) satisfies HomeLayoutItem[]);
        }}
        empty={t('home.board.empty')}
        i18nStrings={boardStrings}
      />
    </ContentLayout>
  );
}

function boardI18n({ t }: Translator): BoardProps.I18nStrings<WidgetId> {
  const started = {
    reorder: t('home.board.started.reorder'),
    resize: t('home.board.started.resize'),
    insert: t('home.board.started.insert'),
  } as const;
  const position = (placement: { x: number; y: number }) => ({
    column: placement.x + 1,
    row: placement.y + 1,
  });
  return {
    liveAnnouncementDndStarted: (operation) => started[operation],
    liveAnnouncementDndItemReordered: ({ placement }) =>
      t('home.board.reordered', position(placement)),
    liveAnnouncementDndItemResized: ({ placement }) =>
      t('home.board.resized', { width: placement.width, height: placement.height }),
    liveAnnouncementDndItemInserted: ({ placement }) =>
      t('home.board.inserted', position(placement)),
    liveAnnouncementDndCommitted: () => t('home.board.committed'),
    liveAnnouncementDndDiscarded: () => t('home.board.discarded'),
    liveAnnouncementItemRemoved: () => t('home.board.removed'),
    // Deprecated by board-components ("has no effect") but still required by its type.
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    navigationAriaLabel: t('home.board.navigation'),
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    navigationItemAriaLabel: (item) =>
      item === null ? t('home.board.emptySlot') : t(WIDGET_TITLES[item.data]),
  };
}
