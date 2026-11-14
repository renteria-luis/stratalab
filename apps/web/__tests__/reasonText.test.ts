import { trace, type Hop } from '@sim/engine';
import { findScenario } from '@sim/engine/golden';
import { describe, expect, it } from 'vitest';
import { reasonMessage } from '../src/i18n/engineText';
import type { Locale } from '../src/i18n/locales';
import { translate, translatePlural } from '../src/i18n/translate';
import type { Translator } from '../src/i18n/useT';

const translator = (locale: Locale): Translator => ({
  locale,
  t: (key, params) => translate(locale, key, params),
  tPlural: (key, count, params) => translatePlural(locale, key, count, params),
});

/** The failing hop of a golden S6 query (docs/specs/p9-golden.md section 15). */
function failingHop(queryId: string): Hop {
  const scenario = findScenario('s6-f3-nat');
  const query = scenario?.queries.find((candidate) => candidate.id === queryId);
  if (scenario === undefined || query === undefined) throw new Error('s6 is missing');
  const result = trace(scenario.topology, query.query);
  if (result.status !== 'evaluated' || result.failure === undefined) throw new Error('no failure');
  const { direction, hopIndex } = result.failure;
  const hop = result.hops.find(
    (candidate) => candidate.direction === direction && candidate.index === hopIndex,
  );
  if (hop === undefined) throw new Error('failing hop is missing');
  return hop;
}

describe('trace reason text', () => {
  it('NAT-02: a reply routed to a NAT gateway names the NAT gateway and the internet gateway (Q15)', () => {
    const hop = failingHop('igw-to-web-2-80');
    expect(hop.reasonCodes).toEqual(['NO_ROUTE_TO_DESTINATION']);
    const en = reasonMessage('NO_ROUTE_TO_DESTINATION', translator('en'), hop);
    expect(en).toContain('nat-0000000a');
    expect(en).toContain('internet gateway');
    const es = reasonMessage('NO_ROUTE_TO_DESTINATION', translator('es'), hop);
    expect(es).toContain('nat-0000000a');
    expect(es).toContain('internet gateway');
    expect(es).not.toBe(en);
  });

  it('RT-04: without a NAT gateway route the generic text stays', () => {
    expect(reasonMessage('NO_ROUTE_TO_DESTINATION', translator('en'))).toBe(
      'The route table has no route to the destination.',
    );
  });
});
