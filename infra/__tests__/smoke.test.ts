import { describe, expect, it } from 'vitest';
import { packageName } from '../src/index';

describe('@sim/infra', () => {
  it('SMOKE: the package entry point loads', () => {
    expect(packageName).toBe('@sim/infra');
  });
});
