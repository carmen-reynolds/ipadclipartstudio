import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

const EAGLE_LIB_PATH = '/Users/carmenreynolds/Library/Mobile Documents/com~apple~CloudDocs/Digital Illustrations + Widgets.library';

function eagleLibraryPlugin() {
  return {
    name: 'eagle-library-api',
    configureServer(server) {
      // 1. List library items sorted by newest mtime
      server.middlewares.use('/api/eagle-library', (req, res) => {
        try {
          const url = new URL(req.url, 'http://localhost');
          const offset = parseInt(url.searchParams.get('offset') || '0', 10);
          const limit = parseInt(url.searchParams.get('limit') || '100', 10);

          const mtimePath = path.join(EAGLE_LIB_PATH, 'mtime.json');
          if (!fs.existsSync(mtimePath)) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Library not found' }));
          }

          const mtimes = JSON.parse(fs.readFileSync(mtimePath, 'utf8'));
          delete mtimes['all'];

          const sorted = Object.entries(mtimes)
            .sort((a, b) => b[1] - a[1])
            .slice(offset, offset + limit);

          const items = [];
          for (const [id, mtime] of sorted) {
            const metaFile = path.join(EAGLE_LIB_PATH, 'images', `${id}.info`, 'metadata.json');
            if (fs.existsSync(metaFile)) {
              try {
                const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
                items.push({
                  id,
                  name: meta.name,
                  ext: meta.ext,
                  width: meta.width,
                  height: meta.height,
                  mtime,
                  thumbnailUrl: `/api/eagle-file?id=${id}&thumb=1`,
                  originalUrl: `/api/eagle-file?id=${id}&thumb=0`
                });
              } catch (_) {}
            }
          }

          res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ total: Object.keys(mtimes).length, offset, limit, items }));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });

      // 2. Serve eagle thumbnail or original file
      server.middlewares.use('/api/eagle-file', (req, res) => {
        try {
          const url = new URL(req.url, 'http://localhost');
          const id = url.searchParams.get('id');
          const isThumb = url.searchParams.get('thumb') === '1';

          if (!id) {
            res.writeHead(400);
            return res.end('Missing id');
          }

          const infoDir = path.join(EAGLE_LIB_PATH, 'images', `${id}.info`);
          if (!fs.existsSync(infoDir)) {
            res.writeHead(404);
            return res.end('Not found');
          }

          const metaFile = path.join(infoDir, 'metadata.json');
          const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));

          let filePath = '';
          if (isThumb) {
            const thumbName = `${meta.name}_thumbnail.png`;
            filePath = path.join(infoDir, thumbName);
            if (!fs.existsSync(filePath)) {
              filePath = path.join(infoDir, `${meta.name}.${meta.ext}`);
            }
          } else {
            filePath = path.join(infoDir, `${meta.name}.${meta.ext}`);
          }

          if (!fs.existsSync(filePath)) {
            res.writeHead(404);
            return res.end('File not found');
          }

          const stat = fs.statSync(filePath);
          const ext = path.extname(filePath).toLowerCase();
          const contentType = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.webp' ? 'image/webp' : 'application/octet-stream';

          res.writeHead(200, {
            'Content-Type': contentType,
            'Content-Length': stat.size,
            'Access-Control-Allow-Origin': '*'
          });
          fs.createReadStream(filePath).pipe(res);
        } catch (err) {
          res.writeHead(500);
          res.end(err.message);
        }
      });
    }
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  plugins: [react(), eagleLibraryPlugin()],
  server: {
    host: '0.0.0.0',
    port: 5174,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    },
    proxy: {
      '/immich-api': {
        target: 'http://100.90.218.76:2283',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/immich-api/, '/api')
      }
    }
  },
  build: {
    target: 'esnext'
  }
});
