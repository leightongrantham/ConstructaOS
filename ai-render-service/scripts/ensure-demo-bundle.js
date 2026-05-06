/**
 * Vercel deploys only ai-render-service/; ../site-lookup-component may be absent there.
 * The demo expects public/site-lookup-demo.js (build with: npm run build:demo from monorepo).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const bundle = path.join(root, 'public', 'site-lookup-demo.js');

if (!fs.existsSync(bundle)) {
  console.error(
    '[build] Missing public/site-lookup-demo.js. From repo root (with site-lookup-component):\n' +
      '  cd ai-render-service && npm run build:demo\n' +
      'Then commit ai-render-service/public/site-lookup-demo.js'
  );
  process.exit(1);
}
