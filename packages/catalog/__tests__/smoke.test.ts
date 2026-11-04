import { describe, expect, it } from 'vitest';
import { packageName } from '../src/index';

describe('@sim/catalog', () => {
  it('SMOKE: the package entry point loads', () => {
    expect(packageName).toBe('@sim/catalog');
  });
});
