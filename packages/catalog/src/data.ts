import examScopeJson from '../data/exam-scope.json';
import ec2NavJson from '../data/nav/ec2.json';
import vpcNavJson from '../data/nav/vpc.json';
import servicesJson from '../data/services.json';
import {
  type Card,
  type ConsoleNav,
  type ExamScope,
  type ServicesFile,
  consoleNavSchema,
  examScopeSchema,
  servicesFileSchema,
} from './schema';

/**
 * Every catalog data file, parsed once at import. The JSON is static and CI checks it,
 * so a parse error here is a build bug, not user input. A test fails when a file in
 * data/nav or data/cards is not registered below under its file name.
 */

export const servicesFile: ServicesFile = servicesFileSchema.parse(servicesJson);

export const examScope: ExamScope = examScopeSchema.parse(examScopeJson);

/** Side navigation by service id (= file name in data/nav). */
export const consoleNavs: Readonly<Record<string, ConsoleNav>> = {
  ec2: consoleNavSchema.parse(ec2NavJson),
  vpc: consoleNavSchema.parse(vpcNavJson),
};

/** Reference cards (data/cards/<serviceId>.json). None written yet. */
export const cards: readonly Card[] = [];
