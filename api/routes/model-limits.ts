import express from 'express';
import { StaticDataManager } from '../../src/lib/model-parameters/static-manager.js';
import { DynamicDataManager } from '../../src/lib/model-parameters/dynamic-manager.js';
import { getSafeErrorMessage } from '../services/error-utils.js';

const router = express.Router();

function routeParam(params: Record<string, string | string[]>, name: string): string | undefined {
  const value = params[name];
  return Array.isArray(value) ? value[0] : value;
}

// Static routes must be registered before the parameterized provider/model route.
router.get('/providers', async (_req, res) => {
  try {
    const manager = new StaticDataManager();
    await manager.initialize();
    res.json({ success: true, providers: await manager.getAllProviders() });
  } catch (error: unknown) {
    const message = getSafeErrorMessage(error);
    console.error('[ModelLimits] Failed to list providers', message);
    res.status(500).json({ success: false, error: `Failed to list providers: ${message}` });
  }
});

router.get('/:provider/models', async (req, res) => {
  try {
    const provider = routeParam(req.params as Record<string, string | string[]>, 'provider') || '';
    let models: string[] = [];

    if (provider === 'gemini') {
      try {
        const manager = new DynamicDataManager();
        await manager.initialize();
        models = (await manager.getProviderModels(provider)).map(entry => entry.modelId);
      } catch (error: unknown) {
        const message = getSafeErrorMessage(error);
        console.warn('[ModelLimits] Dynamic Gemini model lookup failed; using static data', message);
      }
    }

    if (models.length === 0) {
      const manager = new StaticDataManager();
      await manager.initialize();
      models = (await manager.getProviderModels(provider)).map(entry => entry.modelId);
    }

    res.json({ success: true, models });
  } catch (error: unknown) {
    const message = getSafeErrorMessage(error);
    console.error('[ModelLimits] Failed to list models', message);
    res.status(500).json({ success: false, error: `Failed to list models: ${message}` });
  }
});

router.get('/:provider/:model?', async (req, res) => {
  try {
    const params = req.params as Record<string, string | string[]>;
    const provider = routeParam(params, 'provider') || '';
    const model = routeParam(params, 'model') || routeParam(params, 'model?');
    let limits = null;

    if (provider === 'gemini') {
      try {
        const manager = new DynamicDataManager();
        await manager.initialize();
        limits = await manager.getModelParameters(provider, model || 'gemini-1.5-pro');
      } catch (error: unknown) {
        const message = getSafeErrorMessage(error);
        console.warn('[ModelLimits] Dynamic Gemini limits lookup failed; using static data', message);
      }
    }

    if (!limits) {
      const manager = new StaticDataManager();
      await manager.initialize();
      limits = await manager.getModelParameters(provider, model || 'default');
    }

    if (!limits) {
      res.status(404).json({
        success: false,
        error: `No model limits found for ${provider}${model ? `/${model}` : ''}`
      });
      return;
    }

    res.json(limits);
  } catch (error: unknown) {
    const message = getSafeErrorMessage(error);
    console.error('[ModelLimits] Failed to load model limits', message);
    res.status(500).json({ success: false, error: `Failed to load model limits: ${message}` });
  }
});

export default router;
