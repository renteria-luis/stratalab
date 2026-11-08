import { topologySchema } from '@sim/engine';
import { findScenario, lab1Topology } from '@sim/engine/golden';
import { describe, expect, it } from 'vitest';
import { lab01 } from '../src/index';

describe('golden scenarios built on lab 1 (docs/specs/p9-golden.md D3)', () => {
  it('TRC-06: the golden copy of the lab 1 topologies equals lab01', () => {
    expect(topologySchema.parse(lab1Topology(true))).toEqual(lab01.solutionTopology);
    expect(topologySchema.parse(lab1Topology(false))).toEqual(lab01.initialTopology);
  });

  it('TRC-06: golden S1 and S2 use the lab 1 solution topology and S5 the initial one', () => {
    expect(findScenario('s1-f1-internet-to-web')?.topology).toEqual(lab01.solutionTopology);
    expect(findScenario('s2-f2-web-to-internet')?.topology).toEqual(lab01.solutionTopology);
    expect(findScenario('s5-lab1-initial')?.topology).toEqual(lab01.initialTopology);
  });
});
