import Box from '@cloudscape-design/components/box';
import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
import Header from '@cloudscape-design/components/header';
import Link from '@cloudscape-design/components/link';
import { useNavigate } from 'react-router';
import { useT } from '../i18n/useT';

export function NotFoundPage() {
  const { t } = useT();
  const navigate = useNavigate();
  return (
    <ContentLayout header={<Header variant="h1">{t('notFound.title')}</Header>}>
      <Container>
        <Box variant="p">{t('notFound.hint')}</Box>
        <Link
          href="/"
          onFollow={(event) => {
            event.preventDefault();
            void navigate('/');
          }}
        >
          {t('notFound.home')}
        </Link>
      </Container>
    </ContentLayout>
  );
}
