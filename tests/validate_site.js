'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const pages = [
  'index.html',
  '404.html',
  'datenschutz.html',
  'tools/text/index.html',
  'tools/pdf/index.html'
];
const allowedHosts = new Set([
  'stylepanda.me',
  'brickmissing.stylepanda.me',
  'tools.stylepanda.me',
  'dsb.gv.at'
]);
const errors = [];
let localReferences = 0;

function resolveLocal(page, reference) {
  const clean = reference.split(/[?#]/, 1)[0];
  if (!clean || clean.startsWith('#') || /^[a-z]+:/i.test(clean)) return null;
  let target = clean.startsWith('/')
    ? path.join(root, clean.replace(/^\/+/, ''))
    : path.resolve(root, path.dirname(page), clean);
  if (clean.endsWith('/')) target = path.join(target, 'index.html');
  return target;
}

for (const page of pages) {
  const filename = path.join(root, page);
  if (!fs.existsSync(filename)) {
    errors.push(`Fehlende Seite: ${page}`);
    continue;
  }
  const source = fs.readFileSync(filename, 'utf8');
  const h1Count = (source.match(/<h1(?:\s|>)/gi) || []).length;
  if (h1Count !== 1) errors.push(`${page}: ${h1Count} H1 statt genau 1`);
  if (!/<title>[^<]+<\/title>/i.test(source)) errors.push(`${page}: title fehlt`);
  if (!/<meta\s+name="description"\s+content="[^"]+"/i.test(source)) errors.push(`${page}: Meta-Description fehlt`);
  if (!/<link\s+rel="canonical"\s+href="https:\/\/tools\.stylepanda\.me\//i.test(source)) errors.push(`${page}: Canonical URL fehlt`);
  for (const property of ['og:title', 'og:description', 'og:url']) {
    if (!source.includes(`property="${property}"`)) errors.push(`${page}: ${property} fehlt`);
  }
  for (const name of ['twitter:card', 'twitter:title', 'twitter:description']) {
    if (!source.includes(`name="${name}"`)) errors.push(`${page}: ${name} fehlt`);
  }
  if (!/<meta\s+name="viewport"/i.test(source)) errors.push(`${page}: Viewport-Metadaten fehlen`);
  if (!/<main(?:\s|>)/i.test(source)) errors.push(`${page}: main-Element fehlt`);
  if (/\son[a-z]+\s*=/i.test(source)) errors.push(`${page}: Inline-Event-Handler gefunden`);
  if (/\beval\s*\(/.test(source)) errors.push(`${page}: eval() gefunden`);

  const references = source.matchAll(/\b(?:href|src)=["']([^"']+)["']/gi);
  for (const match of references) {
    const reference = match[1];
    if (/^https?:\/\//i.test(reference)) {
      const host = new URL(reference).host;
      if (!allowedHosts.has(host)) errors.push(`${page}: unerwarteter externer Host ${host}`);
      continue;
    }
    const target = resolveLocal(page, reference);
    if (target) {
      localReferences += 1;
      if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
        errors.push(`${page}: fehlendes lokales Ziel ${reference}`);
      }
    }
  }
}

function projectFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === '.git' || entry.name === 'tests' || /^STYLEPANDA_TOOLS_.*_REPORT\.txt$/.test(entry.name)) return [];
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? projectFiles(filename) : [filename];
  });
}

const projectText = projectFiles(root).map((file) => fs.readFileSync(file, 'utf8')).join('\n');
const forbidden = [
  ['Upload-Feldelement', /<input[^>]+type=["']file["']/i],
  ['Netzwerkrequest per fetch', /\bfetch\s*\(/i],
  ['Netzwerkrequest per XHR', /new\s+XMLHttpRequest/i],
  ['WebSocket', /new\s+WebSocket\s*\(/i],
  ['Tracking-Muster', /google-analytics|googletagmanager|matomo|plausible\.io|segment\.com/i]
];
for (const [label, pattern] of forbidden) {
  if (pattern.test(projectText)) errors.push(`Verbotenes Muster gefunden: ${label}`);
}

const css = fs.readFileSync(path.join(root, 'assets/css/main.css'), 'utf8');
for (const width of ['900px', '720px', '420px']) {
  if (!css.includes(`max-width: ${width}`)) errors.push(`Responsive Breakpoint ${width} fehlt`);
}
if (!css.includes('prefers-reduced-motion')) errors.push('prefers-reduced-motion fehlt');
if (!css.includes(':focus-visible')) errors.push('Sichtbarer Fokuszustand fehlt');

const sitemap = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
for (const route of ['/', '/tools/text/', '/tools/pdf/', '/datenschutz.html']) {
  if (!sitemap.includes(`https://tools.stylepanda.me${route}`)) errors.push(`Sitemap-Eintrag fehlt: ${route}`);
}

const deploy = fs.readFileSync(path.join(root, 'scripts/deploy.sh'), 'utf8');
const deploymentMarkers = [
  'set -Eeuo pipefail',
  'flock -n 9',
  'git@github-stylepanda-tools:StylePanda/StylePanda-Tools.git',
  'GIT_SSH_COMMAND=',
  'git -C "${REPO_DIR}" archive "${target_commit}"',
  'mv -Tf -- "${temporary_link}" "${link_path}"',
  'Content-Security-Policy',
  'Missing URL returned',
  'rollback',
  'KEEP_RELEASES=5'
];
for (const marker of deploymentMarkers) {
  if (!deploy.includes(marker)) errors.push(`Deployment-Marker fehlt: ${marker}`);
}
const unsafeDeploymentPatterns = [
  ['StrictHostKeyChecking deaktiviert', /StrictHostKeyChecking\s*=\s*no/i],
  ['Root-SSH-Konfiguration', /\/root\/\.ssh/],
  ['nginx-Neuladen', /(?:systemctl|service)\s+(?:reload\s+)?nginx|nginx\s+-s/i]
];
for (const [label, pattern] of unsafeDeploymentPatterns) {
  if (pattern.test(deploy)) errors.push(`Unsicheres Deployment-Muster: ${label}`);
}

if (errors.length) {
  console.error('VALIDIERUNG FEHLGESCHLAGEN');
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log(`VALIDIERUNG ERFOLGREICH: ${pages.length} HTML-Seiten, ${localReferences} lokale Referenzen`);
console.log('Je Seite genau ein H1; interne Ziele und lokale Assets vorhanden.');
console.log('Keine Inline-Handler, Upload-Felder, Tracker oder Netzwerkrequests gefunden.');
