#!/usr/bin/env node
/**
 * Lokale bridge: ontvangt ZPL via POST /print en stuurt naar Zebra met lpr -o raw.
 * Elk label (^XA...^XZ) wordt apart verstuurd om CUPS form-feed problemen te vermijden.
 * Start met: node scripts/print-zebra-bridge.js
 * Of: ZEBRA_PRINTER="MijnZebra" node scripts/print-zebra-bridge.js
 */
const http = require('http');
const { spawn } = require('child_process');

const PORT = parseInt(process.env.PORT || '9333', 10);
const PRINTER = process.env.ZEBRA_PRINTER || 'Zebra_Technologies_ZTC_ZD421_203dpi_ZPL';
const BRIDGE_SECRET = process.env.ZPL_BRIDGE_SECRET || '';

function printOneLabel(zpl) {
  return new Promise((resolve, reject) => {
    const proc = spawn('/usr/bin/lpr', ['-P', PRINTER, '-o', 'raw'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    proc.stdin.write(zpl, 'utf8');
    proc.stdin.end();

    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d; });
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `lpr exit code ${code}`));
      } else {
        resolve();
      }
    });
  });
}

function splitLabels(zpl) {
  const labels = [];
  const regex = /\^XA[\s\S]*?\^XZ/g;
  let match;
  while ((match = regex.exec(zpl)) !== null) {
    labels.push(match[0]);
  }
  return labels;
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-ZPL-Secret',
    });
    res.end();
    return;
  }

  if (req.method !== 'POST' || req.url !== '/print') {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found. POST /print with ZPL body.');
    return;
  }

  if (BRIDGE_SECRET) {
    const given = req.headers['x-zpl-secret'];
    if (given !== BRIDGE_SECRET) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized. Set X-ZPL-Secret.' }));
      return;
    }
  }

  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', async () => {
    const zpl = Buffer.concat(chunks).toString('utf8');
    if (!zpl.trim()) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Empty ZPL' }));
      return;
    }

    const labels = splitLabels(zpl);
    if (labels.length === 0) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No valid ZPL labels found (missing ^XA/^XZ)' }));
      return;
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    try {
      for (const label of labels) {
        await printOneLabel(label);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, labels: labels.length }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'lpr failed', details: err.message }));
    }
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Zebra ZPL bridge: http://127.0.0.1:${PORT}/print (printer: ${PRINTER})${BRIDGE_SECRET ? ', secret required' : ''}`);
});
