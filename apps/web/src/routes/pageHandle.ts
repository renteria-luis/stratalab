import type { ConsolePage } from './appRoutes';

/** Route `handle`: tells the shell what kind of page is open. */
export type PageHandle =
  | { readonly page: 'home' }
  | { readonly page: 'console'; readonly consolePage: ConsolePage }
  | { readonly page: 'reference' }
  | { readonly page: 'not-found' };

export function isPageHandle(value: unknown): value is PageHandle {
  return typeof value === 'object' && value !== null && 'page' in value;
}
