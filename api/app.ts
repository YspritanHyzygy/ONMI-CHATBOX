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
dotenv.config({ path: envPath });

import express, { type Request, type Response, type NextFunction }  from 'express';
import cors from 'cors';
import chatRoutes from './routes/chat.js';
import providersRoutes from './routes/providers.js';
import authRoutes from './routes/auth.js';
import dataRoutes from './routes/data.js';
import businessRoutes from './routes/business.js';
import modelLimitsRoutes from './routes/model-limits.js';


const app: express.Application = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

/**
 * API Routes
 */
app.use('/api/chat', chatRoutes);
app.use('/api/providers', providersRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/data', dataRoutes);
app.use('/api/business', businessRoutes);
app.use('/api/model-limits', modelLimitsRoutes);

/**
 * health
 */
app.use('/api/health', (_req: Request, res: Response): void => {
  res.status(200).json({
    success: true,
    message: 'ok'
  });
});

/**
 * error handler middleware
 */
app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Global Error Handler] 错误详情:', {
    name: error.name,
    message: error.message,
    stack: error.stack
  });
  
  // 检查是否是AIServiceError类型的错误
  if (error.name === 'AIServiceError') {
    res.status(400).json({
      success: false,
      error: error.message || '服务错误'
    });
  } else {
    res.status(500).json({
      success: false,
      error: `Server internal error: ${error.message}`
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