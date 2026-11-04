import { describe, expect, it } from 'vitest';
import { packageName } from '../src/index';

describe('@sim/labs', () => {
  it('SMOKE: the package entry point loads', () => {
    expect(packageName).toBe('@sim/labs');
  });
});
