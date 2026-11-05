export const packageName = '@sim/labs';

export { checkLab, type LabCheck, type LabQueryResult } from './check';
export { lab01 } from './labs/lab-01';
export {
  expectedResultSchema,
  labQuerySchema,
  labSchema,
  localizedTextSchema,
  traceQuerySchema,
  type ExpectedResult,
  type Lab,
  type LabQuery,
  type LocalizedText,
} from './schema';

import { lab01 } from './labs/lab-01';
import type { Lab } from './schema';

/** Every lab, in the order the Labs page lists them. */
export const LABS: readonly Lab[] = [lab01];
