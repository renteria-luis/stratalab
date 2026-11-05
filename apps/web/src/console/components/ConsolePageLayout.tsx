import ContentLayout from '@cloudscape-design/components/content-layout';
import Header from '@cloudscape-design/components/header';
import SpaceBetween from '@cloudscape-design/components/space-between';
import type { ReactNode } from 'react';

/** A console form or detail page: an h1 with an optional description, then the content. */
export function ConsolePageLayout({
  title,
  description,
  info,
  children,
}: {
  title: string;
  description?: string;
  info?: ReactNode;
  children: ReactNode;
}) {
  return (
    <ContentLayout
      header={
        <Header variant="h1" description={description} info={info}>
          {title}
        </Header>
      }
    >
      <SpaceBetween size="l">{children}</SpaceBetween>
    </ContentLayout>
  );
}
