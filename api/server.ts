/**
 * local server entry file, for local development
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables before importing other modules
// Specify the path to .env file in the project root
const envPath = path.join(__dirname, '..', '.env');
console.log('Loading .env from:', envPath);
dotenv.config({ path: envPath });

// Debug: Check if environment variables are loaded
console.log('Environment variables loaded:');
console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? 'Set' : 'Not set');
console.log('SUPABASE_ANON_KEY:', process.env.SUPABASE_ANON_KEY ? 'Set' : 'Not set');
console.log('Current working directory:', process.cwd());
console.log('__dirname:', __dirname);

// Additional debug: try to read .env file directly
import fs from 'fs';
try {
  const envContent = fs.readFileSync(envPath, 'utf8');
  console.log('.env file exists and contains', envContent.split('\n').length, 'lines');
} catch (error) {
  console.error('Error reading .env file:', error);
}

import app from './app.js';

/**
 * start server with port
 */
const PORT = process.env.PORT || 3001;

const server = app.listen(PORT, () => {
  console.log(`Server ready on port ${PORT}`);
});

/**
 * close server
 */
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

export default app;