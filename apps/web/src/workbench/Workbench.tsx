import SplitPanel from '@cloudscape-design/components/split-panel';
import Tabs from '@cloudscape-design/components/tabs';
import { Diagram } from '../canvas/Diagram';
import { useT } from '../i18n/useT';
import { useActiveLab } from '../labs/useActiveLab';
import { useUi, type WorkbenchTab } from '../state/uiStore';
import { BrowserTab } from './BrowserTab';
import { TraceTab } from './TraceTab';
import { YamlTab } from './YamlTab';
import './workbench.css';

/**
 * The simulator's own tools, in the AppLayout split panel: the diagram, the trace, the
 * virtual browser and the YAML editor. Simulator text, translated; not an AWS console page.
 */
export function Workbench() {
  const { t, locale } = useT();
  const tab = useUi((state) => state.workbenchTab);
  const setWorkbench = useUi((state) => state.setWorkbench);
  const lab = useActiveLab();
  return (
    <SplitPanel header={t('workbench.title')} hidePreferencesButton>
      <div lang={locale}>
        <Tabs
          activeTabId={tab}
          onChange={({ detail }) => {
            setWorkbench(true, detail.activeTabId as WorkbenchTab);
          }}
          tabs={[
            { id: 'diagram', label: t('workbench.tab.diagram'), content: <Diagram /> },
            { id: 'trace', label: t('workbench.tab.trace'), content: <TraceTab /> },
            {
              id: 'browser',
              label: t('workbench.tab.browser'),
              content: <BrowserTab initialUrl={lab?.browserUrl ?? ''} />,
            },
            { id: 'yaml', label: t('workbench.tab.yaml'), content: <YamlTab /> },
          ]}
        />
      </div>
    </SplitPanel>
  );
}
