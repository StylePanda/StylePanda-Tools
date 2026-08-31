'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const pages = [
  'index.html',
  '404.html',
  'datenschutz.html',
  'tools/text/index.html',
  'tools/text/zaehler/index.html',
  'tools/text/bereinigen/index.html',
  'tools/text/gross-klein/index.html',
  'tools/text/sortieren/index.html',
  'tools/text/duplikate/index.html',
  'tools/text/suchen-ersetzen/index.html',
  'tools/pdf/index.html',
  'tools/pdf/zusammenfuegen/index.html',
  'tools/pdf/teilen/index.html',
  'tools/pdf/extrahieren/index.html',
  'tools/pdf/loeschen/index.html',
  'tools/pdf/drehen/index.html',
  'tools/pdf/anordnen/index.html',
  'tools/pdf/metadaten/index.html',
  'tools/pdf/komprimieren/index.html',
  'tools/pdf/bilder-extrahieren/index.html',
  'tools/pdf/bilder-zu-pdf/index.html',
  'tools/pdf/seitengroesse/index.html',
  'tools/pdf/pdf-zu-bilder/index.html'
];
const allowedHosts = new Set([
  'stylepanda.me',
  'brickmissing.stylepanda.me',
  'tools.stylepanda.me',
  'dsb.gv.at'
]);
const errors = [];
let localReferences = 0;
const titles = new Map();
const descriptions = new Map();

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
  const title = source.match(/<title>([^<]+)<\/title>/i)?.[1];
  const description = source.match(/<meta\s+name="description"\s+content="([^"]+)"/i)?.[1];
  if (title && titles.has(title)) errors.push(`${page}: Title ist nicht eindeutig (${titles.get(title)})`);
  if (description && descriptions.has(description)) errors.push(`${page}: Meta-Description ist nicht eindeutig (${descriptions.get(description)})`);
  if (title) titles.set(title, page);
  if (description) descriptions.set(description, page);
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
  if (/tools\/text\/(?:zaehler|bereinigen|gross-klein|sortieren|duplikate|suchen-ersetzen)\/index\.html$/.test(page)) {
    if (!source.includes('Lokale Verarbeitung:')) errors.push(`${page}: Hinweis zur lokalen Verarbeitung fehlt`);
    if (/<form[^>]+action=/i.test(source)) errors.push(`${page}: Formularziel gefunden`);
    if (!source.includes('text-tools.js')) errors.push(`${page}: gemeinsame Text-Tool-Logik fehlt`);
  }
  if (/tools\/pdf\/(?:zusammenfuegen|teilen|extrahieren|loeschen|drehen|anordnen|metadaten|komprimieren|bilder-extrahieren|bilder-zu-pdf|seitengroesse|pdf-zu-bilder)\/index\.html$/.test(page)) {
    if (!source.includes('Lokale Verarbeitung:')) errors.push(`${page}: PDF-Hinweis zur lokalen Verarbeitung fehlt`);
    if (!source.includes('data-pdf-tool=')) errors.push(`${page}: PDF-Tool-Konfiguration fehlt`);
    for (const asset of ['pdf-lib.min.js', 'jszip.min.js', 'pdf-tools-core.js', 'pdf-tools-app.js']) {
      if (!source.includes(asset)) errors.push(`${page}: lokale PDF-Abhängigkeit fehlt: ${asset}`);
    }
    if (!source.includes('pdf-app-fallback')) errors.push(`${page}: statischer PDF-Fehlerzustand fehlt`);
    if (/\.\.\/\.\.\/\.\.\/assets\//.test(source)) errors.push(`${page}: verschachtelter relativer Runtime-Pfad gefunden`);
    if (/\.(?:mjs)(?:["'])/i.test(source)) errors.push(`${page}: .mjs-Runtime-Asset ist nicht MIME-portabel`);
    if (/<form[^>]+action=/i.test(source)) errors.push(`${page}: Formularziel gefunden`);
  }

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
    if (entry.name === '.git' || entry.name === 'tests' || (entry.name === 'vendor' && path.basename(directory) === 'assets') || /^STYLEPANDA_TOOLS_.*_REPORT\.txt$/.test(entry.name)) return [];
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? projectFiles(filename) : [filename];
  });
}

const projectText = projectFiles(root).map((file) => fs.readFileSync(file, 'utf8')).join('\n');
const forbidden = [
  ['Netzwerkrequest per fetch', /\bfetch\s*\(/i],
  ['Netzwerkrequest per XHR', /new\s+XMLHttpRequest/i],
  ['WebSocket', /new\s+WebSocket\s*\(/i],
  ['EventSource', /new\s+EventSource\s*\(/i],
  ['Beacon', /sendBeacon\s*\(/i],
  ['Lokale Speicherung', /localStorage|sessionStorage|indexedDB|document\.cookie/i],
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
const textToolRoutes = ['/tools/text/zaehler/', '/tools/text/bereinigen/', '/tools/text/gross-klein/', '/tools/text/sortieren/', '/tools/text/duplikate/', '/tools/text/suchen-ersetzen/'];
for (const route of ['/', '/tools/text/', ...textToolRoutes, '/tools/pdf/', '/datenschutz.html']) {
  if (!sitemap.includes(`https://tools.stylepanda.me${route}`)) errors.push(`Sitemap-Eintrag fehlt: ${route}`);
}
const textOverview = fs.readFileSync(path.join(root, 'tools/text/index.html'), 'utf8');
for (const route of textToolRoutes) {
  if (!textOverview.includes(`href="${route}"`)) errors.push(`Text-Übersicht verlinkt Tool nicht: ${route}`);
}
if (textOverview.includes('In Vorbereitung')) errors.push('Text-Übersicht enthält noch einen In-Vorbereitung-Platzhalter');
const pdfToolRoutes = ['/tools/pdf/zusammenfuegen/', '/tools/pdf/teilen/', '/tools/pdf/extrahieren/', '/tools/pdf/loeschen/', '/tools/pdf/drehen/', '/tools/pdf/anordnen/', '/tools/pdf/metadaten/', '/tools/pdf/komprimieren/', '/tools/pdf/bilder-extrahieren/', '/tools/pdf/bilder-zu-pdf/', '/tools/pdf/seitengroesse/', '/tools/pdf/pdf-zu-bilder/'];
const pdfOverview = fs.readFileSync(path.join(root, 'tools/pdf/index.html'), 'utf8');
for (const route of pdfToolRoutes) {
  if (!sitemap.includes(`https://tools.stylepanda.me${route}`)) errors.push(`Sitemap-Eintrag fehlt: ${route}`);
  if (!pdfOverview.includes(`href="${route}"`)) errors.push(`PDF-Übersicht verlinkt Tool nicht: ${route}`);
}
if (pdfOverview.includes('In Vorbereitung')) errors.push('PDF-Übersicht enthält noch einen In-Vorbereitung-Platzhalter');

const requiredVendorFiles = [
  'assets/vendor/pdf-lib/pdf-lib.min.js', 'assets/vendor/pdf-lib/LICENSE.md',
  'assets/vendor/pdfjs/pdf.min.js', 'assets/vendor/pdfjs/pdf.worker.min.js', 'assets/vendor/pdfjs/pdf.image_decoders.min.js', 'assets/vendor/pdfjs/LICENSE',
  'assets/vendor/jszip/jszip.min.js', 'assets/vendor/jszip/LICENSE.markdown'
];
for (const file of requiredVendorFiles) {
  if (!fs.existsSync(path.join(root, file))) errors.push(`Vendorte Produktionsdatei fehlt: ${file}`);
}
const pdfApplication = ['assets/js/pdf-tools-core.js', 'assets/js/pdf-tools-app.js'].map((file) => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
const unsafePdfPatterns = [
  ['Nutzerdokument-Netzwerkrequest', /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon/i],
  ['Dokumentpersistenz', /localStorage|sessionStorage|indexedDB|document\.cookie|caches\.(?:open|match)/i],
  ['Unsichere HTML-Ausgabe', /\.innerHTML\s*=|document\.write/i],
  ['Dynamische Codeausführung', /\beval\s*\(|new\s+Function\s*\(/i],
  ['Dokumentdaten in URL', /location\.(?:search|hash)\s*=|history\.(?:pushState|replaceState)/i],
  ['Externer Endpunkt', /https?:\/\//i]
];
for (const [label, pattern] of unsafePdfPatterns) {
  if (pattern.test(pdfApplication)) errors.push(`PDF-Anwendung enthält verbotenes Muster: ${label}`);
}
if (!pdfApplication.includes('URL.revokeObjectURL')) errors.push('PDF-Anwendung widerruft Objekt-URLs nicht');
if (!pdfApplication.includes('isEvalSupported: false')) errors.push('PDF.js-Auswertung ist nicht explizit deaktiviert');
if (!pdfApplication.includes("getDocument(Object.assign({ data")) errors.push('PDF.js wird nicht explizit mit lokalen Dokumentdaten geladen');
if (!pdfApplication.includes('showInitializationError')) errors.push('PDF-Anwendung besitzt keine Initialisierungs-Fehlergrenze');
if (!pdfApplication.includes("document.addEventListener('DOMContentLoaded'")) errors.push('PDF-Anwendung wartet nicht robust auf DOMContentLoaded');
if (/\.mjs(?:["'])/.test(pdfApplication)) errors.push('PDF-Anwendung referenziert ein nicht MIME-portables .mjs-Runtime-Asset');

const privacy = fs.readFileSync(path.join(root, 'datenschutz.html'), 'utf8');
const privacyMarkers = [
  'Simon Weiss',
  'Wien, Österreich',
  'mailto:simonweiss05@outlook.com',
  'https://brickmissing.stylepanda.me/impressum/',
  'Living-Bots',
  'Nach Angaben des Hostinganbieters',
  'Frankfurt am Main, Deutschland',
  'access_log off',
  'Protokollstufe <code>warn</code>',
  'einschließlich einer IP-Adresse',
  'ausschließlich durch JavaScript im Browser',
  'keine Analysewerkzeuge, kein Tracking und keine externe Telemetrie',
  'keine Werbung und kein Affiliate-Marketing',
  'Österreichische Datenschutzbehörde'
];
for (const marker of privacyMarkers) {
  if (!privacy.includes(marker)) errors.push(`Datenschutz-Marker fehlt: ${marker}`);
}
const controllerSection = privacy.match(/<article id="verantwortlicher"[\s\S]*?<\/article>/i)?.[0] || '';
if (/Straße|Strasse|Gasse|Hausnummer|Telefon|USt|Handelsregister/i.test(controllerSection)) {
  errors.push('Nicht zulässige Adress-, Telefon- oder Unternehmensangabe im Verantwortlichen-Abschnitt');
}
if (/Art\.\s*28|\bAVV\b/i.test(privacy)) errors.push('Nicht verifizierte Art.-28-/AVV-Angabe in der Datenschutzerklärung');
if (/TODO[\s\S]{0,200}(Verantwort|Impressum)|(?:Verantwort|Impressum)[\s\S]{0,200}TODO/i.test(privacy)) {
  errors.push('Obsoleter Verantwortlichen-/Impressums-TODO vorhanden');
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
console.log('Keine Inline-Handler, Tracker, externen Laufzeitabhängigkeiten oder Dokument-Netzwerkrequests gefunden.');
