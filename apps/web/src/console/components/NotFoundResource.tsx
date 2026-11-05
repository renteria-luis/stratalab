import Alert from '@cloudscape-design/components/alert';
import { ConsoleLink } from './ConsoleLink';

/** An edit page whose resource doesn't exist (any more) in the topology. */
export function NotFoundResource({
  id,
  backHref,
  backLabel,
}: {
  id: string;
  backHref: string;
  backLabel: string;
}) {
  return (
    <Alert type="error" header={`${id} does not exist`}>
      <ConsoleLink href={backHref}>{backLabel}</ConsoleLink>
    </Alert>
  );
}
