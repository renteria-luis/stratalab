import Badge from '@cloudscape-design/components/badge';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Cards from '@cloudscape-design/components/cards';
import ContentLayout from '@cloudscape-design/components/content-layout';
import Header from '@cloudscape-design/components/header';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { LABS, type Lab } from '@sim/labs';
import { useNavigate } from 'react-router';
import { useT } from '../i18n/useT';
import { useLabs } from '../state/labStore';
import { uiStore } from '../state/uiStore';
import { openLab } from './labActions';

/** Our own page (not an AWS console page): the labs and their local progress. */
export function LabsPage() {
  const { t, locale } = useT();
  const navigate = useNavigate();
  const progress = useLabs((state) => state.progress);

  const start = (lab: Lab, restart: boolean) => {
    openLab(lab, restart);
    uiStore.getState().setWorkbench(true, 'browser');
    void navigate('/');
  };

  return (
    <div lang={locale}>
      <ContentLayout
        header={
          <Header variant="h1" description={t('labs.description')}>
            {t('labs.title')}
          </Header>
        }
      >
        <Cards<Lab>
          items={[...LABS]}
          trackBy="id"
          cardDefinition={{
            header: (lab) => lab.title[locale],
            sections: [
              { id: 'summary', content: (lab) => lab.summary[locale] },
              {
                id: 'status',
                content: (lab) => {
                  const status = progress[lab.id]?.status;
                  return (
                    <Badge color={status === 'completed' ? 'blue' : 'grey'}>
                      {status === 'completed'
                        ? t('labs.status.completed')
                        : status === 'in-progress'
                          ? t('labs.status.inProgress')
                          : t('labs.status.notStarted')}
                    </Badge>
                  );
                },
              },
              {
                id: 'actions',
                content: (lab) => (
                  <SpaceBetween direction="horizontal" size="xs">
                    <Button
                      variant="primary"
                      onClick={() => {
                        start(lab, false);
                      }}
                    >
                      {progress[lab.id] === undefined ? t('labs.start') : t('labs.resume')}
                    </Button>
                    {progress[lab.id] !== undefined && (
                      <Button
                        onClick={() => {
                          start(lab, true);
                        }}
                      >
                        {t('labs.restart')}
                      </Button>
                    )}
                  </SpaceBetween>
                ),
              },
            ],
          }}
          empty={<Box>{t('labs.title')}</Box>}
        />
      </ContentLayout>
    </div>
  );
}
