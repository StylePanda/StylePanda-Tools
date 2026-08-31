'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const port = Number(process.argv[2] || 8010);
const mimeTypes = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.mjs': 'application/octet-stream',
  '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8', '.wasm': 'application/wasm',
  '.bcmap': 'application/octet-stream', '.pfb': 'application/octet-stream',
  '.ttf': 'font/ttf', '.otf': 'font/otf'
};

http.createServer((request, response) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); }
  catch (error) { response.writeHead(400).end('Bad Request'); return; }
  if (pathname.endsWith('/')) pathname += 'index.html';
  const filename = path.resolve(root, '.' + pathname);
  if (filename !== root && !filename.startsWith(root + path.sep)) { response.writeHead(403).end('Forbidden'); return; }
  fs.readFile(filename, (error, content) => {
    if (error) { response.writeHead(error.code === 'ENOENT' ? 404 : 500).end('Not Found'); return; }
    response.setHeader('Content-Type', mimeTypes[path.extname(filename).toLowerCase()] || 'application/octet-stream');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
    response.end(content);
  });
}).listen(port, '127.0.0.1', () => console.log(`PRODUCTION-LIKE SERVER READY ${port}`));
