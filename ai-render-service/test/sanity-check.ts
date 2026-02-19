/**
 * Minimal sanity check - verifies core modules load and server responds.
 * Run with: npx tsx test/sanity-check.ts
 *
 * Does NOT require OpenAI keys or external services.
 */

import 'dotenv/config';
import http from 'http';
import { createServer } from '../src/server.js';

const app = createServer();
const server = http.createServer(app);

server.listen(0, '127.0.0.1', () => {
  const port = (server.address() as { port: number }).port;
  const req = http.get(`http://127.0.0.1:${port}/health`, (res) => {
    const chunks: Buffer[] = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => {
      server.close();
      const body = Buffer.concat(chunks).toString();
      try {
        if (res.statusCode !== 200) {
          throw new Error(`Expected 200, got ${res.statusCode}`);
        }
        const parsed = JSON.parse(body);
        if (parsed.status !== 'ok') {
          throw new Error(`Expected status ok, got ${JSON.stringify(parsed)}`);
        }
        console.log('✅ Sanity check passed');
      } catch (e) {
        console.error('❌ Sanity check failed:', (e as Error).message);
        process.exit(1);
      }
    });
  });
  req.on('error', (e) => {
    server.close();
    console.error('❌ Sanity check failed:', e.message);
    process.exit(1);
  });
});
