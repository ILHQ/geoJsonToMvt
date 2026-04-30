import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const defaultPort = 8080;
const defaultHost = '127.0.0.1';
const port = Number.parseInt(process.env.PORT ?? '', 10) || defaultPort;
const host = process.env.HOST || defaultHost;

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'application/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.mjs', 'application/javascript; charset=utf-8'],
  ['.pbf', 'application/x-protobuf'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8']
]);

function sendText(response, statusCode, message) {
  response.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  response.end(message);
}

function resolveRequestPath(requestUrl) {
  const rawPathname = (requestUrl ?? '/').split('?')[0] || '/';
  const pathname = decodeURIComponent(rawPathname);

  if (pathname === '/') {
    return path.join(projectRoot, 'preview.html');
  }

  const pathSegments = pathname.split('/').filter(Boolean);

  if (pathSegments.includes('..')) {
    return null;
  }

  const relativePath = pathname.replace(/^\/+/, '');
  const absolutePath = path.resolve(projectRoot, relativePath);

  if (!absolutePath.startsWith(projectRoot + path.sep)) {
    return null;
  }

  return absolutePath;
}

const server = createServer(async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.setHeader('Allow', 'GET, HEAD');
    sendText(response, 405, 'Method Not Allowed');
    return;
  }

  const targetPath = resolveRequestPath(request.url ?? '/');

  if (!targetPath) {
    sendText(response, 403, 'Forbidden');
    return;
  }

  try {
    const fileStat = await stat(targetPath);

    if (!fileStat.isFile()) {
      sendText(response, 404, 'Not Found');
      return;
    }

    const extension = path.extname(targetPath).toLowerCase();
    const contentType = contentTypes.get(extension) ?? 'application/octet-stream';

    response.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': fileStat.size,
      'Cache-Control': 'no-store'
    });

    if (request.method === 'HEAD') {
      response.end();
      return;
    }

    createReadStream(targetPath).pipe(response);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      sendText(response, 404, 'Not Found');
      return;
    }

    console.error('Failed to serve preview asset:', error);
    sendText(response, 500, 'Internal Server Error');
  }
});

server.listen(port, host, () => {
  console.log(`Preview server is running at http://${host}:${port}`);
});
