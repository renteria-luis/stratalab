export const packageName = '@sim/catalog';

export { cards, consoleNavs, examScope, servicesFile } from './data';
export {
  buildSearchIndex,
  menuCategories,
  normalizeSearchText,
  searchServices,
  shortForm,
  type MenuCategory,
  type SearchIndex,
} from './search';
export {
  cardSchema,
  consoleNavSchema,
  examScopeSchema,
  serviceSchema,
  servicesFileSchema,
  type Card,
  type ConsoleNav,
  type ExamEntry,
  type ExamScope,
  type NavItem,
  type NavSection,
  type Service,
  type ServicesFile,
} from './schema';
