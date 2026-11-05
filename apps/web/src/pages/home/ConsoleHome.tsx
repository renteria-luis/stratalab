import Board, { type BoardProps } from '@cloudscape-design/board-components/board';
import BoardItem from '@cloudscape-design/board-components/board-item';
import ContentLayout from '@cloudscape-design/components/content-layout';
import Header from '@cloudscape-design/components/header';
import { useMemo } from 'react';
import { useT, type Translator } from '../../i18n/useT';
import { ct } from '../../console/text';
import { useUi, type HomeLayoutItem } from '../../state/uiStore';
import { applyLayout, toLayout, type WidgetId } from './layout';
import {
  EstimatedCostWidget,
  LabsInProgressWidget,
  RecentlyVisitedWidget,
  TopologyHealthWidget,
} from './widgets';

/** "Recently visited" is console text (English only); the other widgets are the simulator's. */
function widgetTitle(id: WidgetId, { t }: Translator): string {
  switch (id) {
    case 'recently-visited':
      return ct('home.recent.title');
    case 'labs-in-progress':
      return t('home.labs.title');
    case 'topology-health':
      return t('home.health.title');
    case 'estimated-cost':
      return t('home.cost.title');
  }
}

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
  const storedLayout = useUi((state) => state.homeLayout);
  const setHomeLayout = useUi((state) => state.setHomeLayout);
  const items = useMemo(() => applyLayout(storedLayout), [storedLayout]);
  const boardStrings = useMemo(() => boardI18n(translator), [translator]);
  const itemStrings = useMemo(
    () => ({
      dragHandleAriaLabel: ct('home.board.dragHandle'),
      dragHandleAriaDescription: ct('home.board.handleDescription'),
      resizeHandleAriaLabel: ct('home.board.resizeHandle'),
      resizeHandleAriaDescription: ct('home.board.handleDescription'),
    }),
    [],
  );

  return (
    <ContentLayout header={<Header variant="h1">{ct('home.title')}</Header>}>
      <Board<WidgetId>
        items={items}
        renderItem={(item) => (
          <BoardItem
            header={<Header variant="h2">{widgetTitle(item.data, translator)}</Header>}
            i18nStrings={itemStrings}
          >
            <WidgetContent id={item.data} />
          </BoardItem>
        )}
        onItemsChange={({ detail }) => {
          setHomeLayout(detail.items.map(toLayout) satisfies HomeLayoutItem[]);
        }}
        empty={ct('home.board.empty')}
        i18nStrings={boardStrings}
      />
    </ContentLayout>
  );
}

function boardI18n(translator: Translator): BoardProps.I18nStrings<WidgetId> {
  const started = {
    reorder: ct('home.board.started.reorder'),
    resize: ct('home.board.started.resize'),
    insert: ct('home.board.started.insert'),
  } as const;
  const position = (placement: { x: number; y: number }) => ({
    column: placement.x + 1,
    row: placement.y + 1,
  });
  return {
    liveAnnouncementDndStarted: (operation) => started[operation],
    liveAnnouncementDndItemReordered: ({ placement }) =>
      ct('home.board.reordered', position(placement)),
    liveAnnouncementDndItemResized: ({ placement }) =>
      ct('home.board.resized', { width: placement.width, height: placement.height }),
    liveAnnouncementDndItemInserted: ({ placement }) =>
      ct('home.board.inserted', position(placement)),
    liveAnnouncementDndCommitted: () => ct('home.board.committed'),
    liveAnnouncementDndDiscarded: () => ct('home.board.discarded'),
    liveAnnouncementItemRemoved: () => ct('home.board.removed'),
    // Deprecated by board-components ("has no effect") but still required by its type.
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    navigationAriaLabel: ct('home.board.navigation'),
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    navigationItemAriaLabel: (item) =>
      item === null ? ct('home.board.emptySlot') : widgetTitle(item.data, translator),
  };
}
