import { describe, expect, it } from 'vitest';
import { GOLDEN_SCENARIOS, findLeaks, scenarioAllowList } from '../golden/index';

function s3() {
  const scenario = GOLDEN_SCENARIOS.find((candidate) => candidate.id === 's3-q1-return-route');
  if (scenario === undefined) throw new Error('s3 is missing');
  return scenario;
}

describe('golden leak check (docs/specs/p9-golden.md section 5.2)', () => {
  const allowed = scenarioAllowList(s3());

  it('TRC-06: scenario IDs, addresses and CIDRs are allowed', () => {
    const clean = {
      scenarioId: 's3-q1-return-route',
      capturedAt: '2026-11-05',
      region: 'us-east-1',
      analyses: [
        {
          component: { id: 'eni-0000000b', type: 'network-interface' },
          vpc: 'vpc-0a1b2c3d',
          addresses: ['198.51.100.7', '198.51.100.7/32', '203.0.113.26', '10.0.2.10'],
          cidrs: ['0.0.0.0/0', '10.0.0.0/16', '10.0.2.0/24'],
          portRanges: [{ from: 32768, to: 32768 }],
          ruleNumber: 100,
        },
      ],
    };
    expect(findLeaks(clean, allowed)).toEqual([]);
  });

  it('TRC-06: the leak check flags ARNs, 12-digit numbers, unknown AWS IDs and unknown addresses', () => {
    const leaky = {
      analyses: [
        {
          arn: 'arn:aws:ec2:us-east-1:123456789012:vpc/vpc-0123456789abcdef0',
          account: '123456789012',
          accountNumber: 123456789012,
          component: 'subnet-0123456789abcdef0',
          nested: { addresses: ['54.12.3.4', '3.5.0.0/16'] },
          path: 'nip-0123456789abcdef0',
        },
      ],
    };
    expect(findLeaks(leaky, allowed)).toEqual([
      '$.analyses[0].arn',
      '$.analyses[0].account',
      '$.analyses[0].accountNumber',
      '$.analyses[0].component',
      '$.analyses[0].nested.addresses[0]',
      '$.analyses[0].nested.addresses[1]',
      '$.analyses[0].path',
    ]);
  });

  it('TRC-06: an ID inside a longer word is not mistaken for another ID', () => {
    expect(findLeaks({ a: 'eni-0000000a' }, scenarioAllowList(s3()))).toEqual([]);
  });
});
