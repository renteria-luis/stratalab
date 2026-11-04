import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { PRODUCT_NAME } from '../src/product';

describe('App', () => {
  it('SMOKE: renders the product name heading', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: PRODUCT_NAME })).toBeDefined();
  });
});
