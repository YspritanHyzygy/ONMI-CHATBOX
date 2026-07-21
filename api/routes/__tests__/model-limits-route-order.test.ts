import { describe, expect, it } from 'vitest';
import modelLimitsRouter from '../model-limits.js';

interface RouterLayer {
  route?: { path: string };
}

describe('model limits route order', () => {
  it('registers provider and model-list routes before the catch-all model route', () => {
    const paths = (modelLimitsRouter as unknown as { stack: RouterLayer[] }).stack
      .map(layer => layer.route?.path)
      .filter((path): path is string => typeof path === 'string');

    expect(paths).toEqual([
      '/providers',
      '/:provider/models',
      '/:provider/:model?'
    ]);
  });
});
