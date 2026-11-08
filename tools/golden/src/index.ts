export const packageName = '@sim/golden';

export { pathRequest } from './analyses';
export { runCapture, type CaptureDeps, type CaptureOptions } from './capture';
export { planStages, type Stage, type StagePlan } from './cdk/stages';
export {
  buildStack,
  logicalIdOf,
  synthesize,
  translationErrors,
  type TranslateError,
} from './cdk/translate';
export { runCleanup, type CleanupDeps, type CleanupOptions } from './cleanup';
export { buildIdMap, routeStateProblems, type IdMap } from './id-map';
export { finalizeFixture, normalizeAnalysis } from './normalize';
export { formatPlan, planCapture, type CapturePlan } from './plan';
