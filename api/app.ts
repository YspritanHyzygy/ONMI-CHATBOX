/**
 * This is a API server
 */

// Load environment variables first, before any other imports
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from project root
const envPath = path.join(__dirname, '..', '.env');
// Automated tests provide their own explicit environment and isolated DB.
// Never let a developer's real .env keys or data path leak into test/e2e runs.
if (!['test', 'e2e'].includes(process.env.NODE_ENV || '')) {
  dotenv.config({ path: envPath });
}

import express, { type Request, type Response, type NextFunction }  from 'express';
import cors from 'cors';
import chatRoutes from './routes/chat.js';
import providersRoutes from './routes/providers.js';
import authRoutes from './routes/auth.js';
import dataRoutes from './routes/data.js';
import businessRoutes from './routes/business.js';
import modelLimitsRoutes from './routes/model-limits.js';
import { requireAuth } from './middleware/auth.js';
import { ensureDatabaseInitialized } from './services/database-init.js';
import { sanitizeErrorMessage } from './services/error-utils.js';


const app: express.Application = express();

const configuredOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowedOrigins = configuredOrigins.length > 0
  ? configuredOrigins
  : ['http://localhost:5173', 'http://127.0.0.1:5173'];

app.use(cors({
  origin(origin, callback) {
    const allowed = !origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin);
    callback(null, allowed);
  }
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

/**
 * API Routes
 * - /api/auth 不需要认证（登录、注册等）
 * - 其他路由需要认证
 */
app.use('/api/auth', authRoutes);
app.use('/api/chat', requireAuth, chatRoutes);
app.use('/api/providers', requireAuth, providersRoutes);
app.use('/api/data', requireAuth, dataRoutes);
app.use('/api/business', requireAuth, businessRoutes);
app.use('/api/model-limits', requireAuth, modelLimitsRoutes);

/**
 * health
 */
app.get('/api/health', async (_req: Request, res: Response): Promise<void> => {
  try {
    const db = await ensureDatabaseInitialized();
    res.status(200).json({
      success: true,
      message: 'ok',
      database: {
        ready: true,
        version: db.getDatabaseVersion()
      }
    });
  } catch {
    res.status(503).json({
      success: false,
      error: 'Database unavailable'
    });
  }
});

/**
 * error handler middleware
 */
app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
  const safeMessage = sanitizeErrorMessage(error.message || 'Unknown error');
  const safeStack = error.stack ? sanitizeErrorMessage(error.stack) : undefined;
  console.error('[Global Error Handler] 错误详情:', {
    name: error.name,
    message: safeMessage,
    stack: safeStack
  });
  
  // 检查是否是AIServiceError类型的错误
  if (error.name === 'AIServiceError') {
    res.status(400).json({
      success: false,
      error: safeMessage || '服务错误'
    });
  } else {
    res.status(500).json({
      success: false,
      error: 'Server internal error'
    });
  }
});

/**
 * 404 handler
 */
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'API not found'
  });
});

export default app;
