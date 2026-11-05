import Button from '@cloudscape-design/components/button';
import Form from '@cloudscape-design/components/form';
import SpaceBetween from '@cloudscape-design/components/space-between';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { ChangeErrors } from './ChangeErrors';
import { ConsolePageLayout } from './ConsolePageLayout';
import type { ChangeFailure } from './failure';

/**
 * A console create or edit page: title, sections, the change errors and the
 * Cancel / submit buttons. Enter submits, as in the console.
 */
export function FormPage({
  title,
  description,
  cancelHref,
  submitLabel,
  onSubmit,
  failure,
  extraActions,
  children,
}: {
  title: string;
  description?: string;
  cancelHref: string;
  submitLabel: string;
  onSubmit: () => void;
  failure: ChangeFailure | null;
  extraActions?: ReactNode;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <ConsolePageLayout title={title} description={description}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <Form
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button
                variant="link"
                formAction="none"
                onClick={() => {
                  void navigate(cancelHref);
                }}
              >
                Cancel
              </Button>
              {extraActions}
              <Button variant="primary">{submitLabel}</Button>
            </SpaceBetween>
          }
        >
          <SpaceBetween size="l">
            <ChangeErrors failure={failure} />
            {children}
          </SpaceBetween>
        </Form>
      </form>
    </ConsolePageLayout>
  );
}
