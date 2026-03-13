#!/usr/bin/env node
/**
 * Folder watcher: bewaakt een map (standaard ~/Downloads) op nieuwe bestanden met ZPL-inhoud
 * (^XA ... ^XZ) en stuurt ze automatisch naar de Zebra printer via lpr -o raw.
 *
 * Handig wanneer Odoo (of een ander systeem) ZPL als tekstbestand downloadt.
 *
 * Start met:  node scripts/zpl-folder-watcher.js
 * Of:         WATCH_DIR=~/Desktop node scripts/zpl-folder-watcher.js
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');

const WATCH_DIR = process.env.WATCH_DIR
  ? process.env.WATCH_DIR.replace(/^~/, os.homedir())
  : path.join(os.homedir(), 'Downloads');
const PRINTER = process.env.ZEBRA_PRINTER || 'Zebra_Technologies_ZTC_ZD421_203dpi_ZPL';
const DELETE_AFTER_PRINT = process.env.DELETE_AFTER_PRINT !== '0';
const EXTENSIONS = new Set((process.env.WATCH_EXTENSIONS || '.txt,.zpl,.raw').split(',').map(e => e.trim().toLowerCase()));
const DEBOUNCE_MS = 1500;

const recentlySeen = new Map();

function isZpl(content) {
  return /\^XA[\s\S]*?\^XZ/i.test(content);
}

function printZpl(filePath, content) {
  return new Promise((resolve, reject) => {
    const labels = (content.match(/\^XA/gi) || []).length;
    const proc = spawn('lpr', ['-P', PRINTER, '-o', 'raw'], { stdio: ['pipe', 'pipe', 'pipe'] });

    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d; });
    proc.stdin.write(content, 'utf8');
    proc.stdin.end();

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`lpr exit ${code}: ${stderr.trim()}`));
      } else {
        resolve(labels);
      }
    });
  });
}

function handleFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (!EXTENSIONS.has(ext)) return;

  const now = Date.now();
  const prev = recentlySeen.get(filePath);
  if (prev && now - prev < DEBOUNCE_MS) return;
  recentlySeen.set(filePath, now);

  setTimeout(async () => {
    try {
      if (!fs.existsSync(filePath)) return;
      const stat = fs.statSync(filePath);
      if (stat.size === 0 || stat.size > 1_000_000) return;

      const content = fs.readFileSync(filePath, 'utf8');
      if (!isZpl(content)) return;

      const labels = await printZpl(filePath, content);
      const name = path.basename(filePath);
      console.log(`[${new Date().toLocaleTimeString()}] ✓ ${name} → Zebra (${labels} label${labels !== 1 ? 's' : ''})`);

      if (DELETE_AFTER_PRINT) {
        fs.unlinkSync(filePath);
        console.log(`[${new Date().toLocaleTimeString()}]   Bestand verwijderd: ${name}`);
      }
    } catch (err) {
      console.error(`[${new Date().toLocaleTimeString()}] ✗ ${path.basename(filePath)}: ${err.message}`);
    }
  }, DEBOUNCE_MS);
}

function cleanRecentlySeen() {
  const cutoff = Date.now() - 60_000;
  for (const [key, ts] of recentlySeen) {
    if (ts < cutoff) recentlySeen.delete(key);
  }
}

if (!fs.existsSync(WATCH_DIR)) {
  console.error(`Map bestaat niet: ${WATCH_DIR}`);
  process.exit(1);
}

const watcher = fs.watch(WATCH_DIR, (eventType, filename) => {
  if (!filename || eventType !== 'rename') return;
  handleFile(path.join(WATCH_DIR, filename));
});

setInterval(cleanRecentlySeen, 60_000);

console.log(`ZPL folder watcher gestart`);
console.log(`  Map:        ${WATCH_DIR}`);
console.log(`  Extensies:  ${[...EXTENSIONS].join(', ')}`);
console.log(`  Printer:    ${PRINTER}`);
console.log(`  Verwijderen na print: ${DELETE_AFTER_PRINT ? 'ja' : 'nee'}`);
console.log(`  Wacht op ZPL-bestanden...`);
