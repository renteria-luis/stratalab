import type { ConsolePage } from './appRoutes';

/** A page under a console page: a create, edit or attach form. */
export interface ConsoleSubPage {
  /** Breadcrumb and title, as the console names the page (for example "Edit routes"). */
  readonly label: string;
}

/** Route `handle`: tells the shell what kind of page is open. */
export type PageHandle =
  | { readonly page: 'home' }
  | {
      readonly page: 'console';
      readonly consolePage: ConsolePage;
      readonly subPage?: ConsoleSubPage;
    }
  | { readonly page: 'reference' }
  | { readonly page: 'not-found' };

export function isPageHandle(value: unknown): value is PageHandle {
  return typeof value === 'object' && value !== null && 'page' in value;
}
