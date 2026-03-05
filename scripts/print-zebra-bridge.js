#!/usr/bin/env node
/**
 * Lokale bridge: ontvangt ZPL via POST /print en stuurt naar Zebra met lpr -o raw.
 * Start met: node scripts/print-zebra-bridge.js
 * Of: ZEBRA_PRINTER="MijnZebra" node scripts/print-zebra-bridge.js
 */
const http = require('http');
const { spawn } = require('child_process');

const PORT = parseInt(process.env.PORT || '9333', 10);
const PRINTER = process.env.ZEBRA_PRINTER || 'Zebra_Technologies_ZTC_ZD421_203dpi_ZPL';

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  if (req.method !== 'POST' || req.url !== '/print') {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found. POST /print with ZPL body.');
    return;
  }

  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    const zpl = Buffer.concat(chunks).toString('utf8');
    if (!zpl.trim()) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Empty ZPL' }));
      return;
    }

    const proc = spawn('lpr', ['-P', PRINTER, '-o', 'raw'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    proc.stdin.write(zpl, 'utf8');
    proc.stdin.end();

    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d; });
    proc.on('close', (code) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      if (code !== 0) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'lpr failed', code, stderr: stderr.trim() }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, labels: (zpl.match(/\^XA/g) || []).length }));
    });
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Zebra ZPL bridge: http://127.0.0.1:${PORT}/print (printer: ${PRINTER})`);
});
