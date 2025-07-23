import path from 'path';
import { fileURLToPath } from 'url';

import dotenv from 'dotenv';

// Get the directory name and load environment variables first
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env') });

// Now import and start the main application
import('./index.js');