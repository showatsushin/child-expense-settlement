import { createReadStream, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve, extname, normalize } from 'node:path';

const [directory = '.', port = '8080'] = process.argv.slice(2);
const root = resolve(directory); const types = { '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.wasm':'application/wasm','.gz':'application/gzip','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg' };
createServer((request, response) => { const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); const target = resolve(root, `.${normalize(pathname === '/' ? '/index.html' : pathname)}`); if (!target.startsWith(root) || !existsSync(target)) { response.writeHead(404); response.end('Not found'); return; } response.writeHead(200, { 'Content-Type': types[extname(target)] || 'application/octet-stream', 'Cache-Control':'no-store' }); createReadStream(target).pipe(response); }).listen(Number(port), () => console.log(`Serving ${root} at http://localhost:${port}`));
