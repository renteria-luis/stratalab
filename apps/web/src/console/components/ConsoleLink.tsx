import Link, { type LinkProps } from '@cloudscape-design/components/link';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';

/** A link inside the app that navigates without reloading, as the console's resource links. */
export function ConsoleLink({
  href,
  children,
  variant,
}: {
  href: string;
  children: ReactNode;
  variant?: LinkProps.Variant;
}) {
  const navigate = useNavigate();
  return (
    <Link
      href={href}
      variant={variant}
      onFollow={(event) => {
        event.preventDefault();
        void navigate(href);
      }}
    >
      {children}
    </Link>
  );
}
