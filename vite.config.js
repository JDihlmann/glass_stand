import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

// base './' so the built page works from any folder; the dev-only /__save endpoint lets the page
// hand the exported room to the Blender light bake (see bake/bake.py).
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 2000 },
  plugins: [{
    name: 'save-export',
    configureServer(server) {
      server.middlewares.use('/__save', (req, res) => {
        const name = (new URL(req.url, 'http://x').searchParams.get('name') || 'out.bin').replace(/[^\w.\-]/g, '');
        const chunks = []; req.on('data', (c) => chunks.push(c));
        req.on('end', () => { fs.mkdirSync('bake', { recursive: true }); fs.writeFileSync(path.join('bake', name), Buffer.concat(chunks)); res.end('ok'); });
      });
    },
  }],
});
