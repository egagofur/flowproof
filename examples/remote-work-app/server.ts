import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, 'public');

export function createRemoteWorkServer(port = 3344): Promise<{ server: http.Server; url: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = http.createServer(async (req, res) => {
      let reqPath = req.url?.split('?')[0] || '/';
      if (reqPath === '/' || reqPath === '/login' || reqPath === '/remote-requests') {
        reqPath = '/index.html';
      }

      const filePath = path.join(publicDir, reqPath);
      try {
        const content = await fs.readFile(filePath);
        const ext = path.extname(filePath);
        const contentType =
          ext === '.html'
            ? 'text/html'
            : ext === '.css'
              ? 'text/css'
              : ext === '.js'
                ? 'application/javascript'
                : 'text/plain';

        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
      } catch {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      }
    });

    server.listen(port, () => {
      const url = `http://localhost:${port}`;
      resolve({
        server,
        url,
        close: () => new Promise((res) => server.close(() => res())),
      });
    });
  });
}

if (process.argv[1] === __filename) {
  const port = parseInt(process.env.PORT || '3344', 10);
  createRemoteWorkServer(port).then(({ url }) => {
    console.log(`Remote Work Portal running at ${url}`);
  });
}
