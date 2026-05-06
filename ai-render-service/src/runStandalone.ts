/**
 * AI Render Service — local/process entry (listen on PORT).
 * Not named index.* so Vercel does not map GET / to this file as static JavaScript.
 */

import 'dotenv/config';
import { startServer } from './server.js';

startServer();
console.log('AI Render Service running');
