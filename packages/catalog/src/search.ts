import type { Service, ServicesFile } from './schema';

/**
 * Services menu grouping and global search (CAT-03, CAT-07, CAT-08 in the catalog skill's
 * data model). Pure and deterministic: the same services and query give the same order.
 */

/** Lowercase, no accents or punctuation, "&" read as "and", single spaces. */
export function normalizeSearchText(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** The normalized name without a leading "Amazon" or "AWS": "Amazon Macie" -> "macie". */
export function shortForm(text: string): string {
  return normalizeSearchText(text).replace(/^(?:amazon|aws) /, '');
}

interface IndexEntry {
  readonly service: Service;
  /** Normalized name and short name. */
  readonly names: readonly string[];
  /** Normalized aliases and their short forms. */
  readonly aliases: readonly string[];
  readonly sortKey: string;
}

export interface SearchIndex {
  readonly entries: readonly IndexEntry[];
}

const forms = (text: string) => [...new Set([normalizeSearchText(text), shortForm(text)])];

/** Builds the index once; retired services are left out (CAT-07). */
export function buildSearchIndex(services: readonly Service[]): SearchIndex {
  return {
    entries: services
      .filter((service) => service.retired !== true)
      .map((service) => ({
        service,
        names: forms(service.name),
        aliases: [...new Set(service.aliases.flatMap(forms))],
        sortKey: normalizeSearchText(service.name),
      })),
  };
}

const startsWithWord = (term: string, query: string) => ` ${term}`.includes(` ${query}`);

/**
 * Lower is better: exact name 0, exact alias 1, name prefix 2, alias prefix 3,
 * word prefix 4, substring 5. Undefined means no match.
 */
function score(entry: IndexEntry, queries: readonly string[]): number | undefined {
  const all = [...entry.names, ...entry.aliases];
  const tiers: ((query: string) => boolean)[] = [
    (q) => entry.names.includes(q),
    (q) => entry.aliases.includes(q),
    (q) => entry.names.some((term) => term.startsWith(q)),
    (q) => entry.aliases.some((term) => term.startsWith(q)),
    (q) => all.some((term) => startsWithWord(term, q)),
    (q) => all.some((term) => term.includes(q)),
  ];
  const tier = tiers.findIndex((matches) => queries.some(matches));
  return tier === -1 ? undefined : tier;
}

const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Ranked matches for a query typed in the search bar. */
export function searchServices(index: SearchIndex, query: string, limit?: number): Service[] {
  const queries = [...new Set([normalizeSearchText(query), shortForm(query)])].filter(
    (q) => q.length > 0,
  );
  if (queries.length === 0) return [];

  const hits: { entry: IndexEntry; score: number }[] = [];
  for (const entry of index.entries) {
    const s = score(entry, queries);
    if (s !== undefined) hits.push({ entry, score: s });
  }
  hits.sort(
    (a, b) =>
      a.score - b.score ||
      compareText(a.entry.sortKey, b.entry.sortKey) ||
      compareText(a.entry.service.id, b.entry.service.id),
  );
  const ranked = hits.map((hit) => hit.entry.service);
  return limit === undefined ? ranked : ranked.slice(0, limit);
}

export interface MenuCategory {
  readonly category: string;
  readonly services: readonly Service[];
}

/**
 * Services menu: categories in captured menu order, each with its services in the order of
 * the "All services" page. Retired services are left out (CAT-07); a category left empty
 * by that is dropped.
 */
export function menuCategories(file: Pick<ServicesFile, 'menu' | 'services'>): MenuCategory[] {
  return file.menu.categories
    .map((category) => ({
      category,
      services: file.services.filter(
        (service) => service.category === category && service.retired !== true,
      ),
    }))
    .filter((group) => group.services.length > 0);
}
