'use strict';

const assert = require('assert');

const pages = [
  ['zusammenfuegen', 'merge'], ['teilen', 'split'], ['extrahieren', 'extract'],
  ['loeschen', 'delete'], ['drehen', 'rotate'], ['anordnen', 'reorder'],
  ['metadaten', 'metadata'], ['komprimieren', 'compress'],
  ['bilder-extrahieren', 'extract-images'], ['bilder-zu-pdf', 'images-to-pdf'],
  ['seitengroesse', 'resize'], ['pdf-zu-bilder', 'pdf-to-images']
];

const port = Number(process.argv[2] || 9225);
const baseUrl = String(process.argv[3] || 'http://127.0.0.1:8010').replace(/\/$/, '');
const closeBrowser = process.argv.includes('--close');
const smokeOnly = process.argv.includes('--smoke-only');
const diagnostic = process.argv.includes('--diagnostic');

function delay(milliseconds) { return new Promise(resolve => setTimeout(resolve, milliseconds)); }

(async function run() {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const target = targets.find(item => item.type === 'page');
  if (!target) throw new Error('Keine Browser-Testseite gefunden.');

  const socket = new WebSocket(target.webSocketDebuggerUrl);
  const pending = new Map();
  const listeners = new Map();
  let nextId = 1;
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const handlers = pending.get(message.id); pending.delete(message.id);
      if (message.error || (message.result && message.result.exceptionDetails)) handlers.reject(new Error(JSON.stringify(message.error || message.result.exceptionDetails)));
      else handlers.resolve(message.result);
      return;
    }
    (listeners.get(message.method) || []).forEach(listener => listener(message.params));
  });
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve); socket.addEventListener('error', reject); });

  function command(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = nextId++; pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
  function once(method, timeout = 15000) {
    return new Promise((resolve, reject) => {
      const handler = params => { cleanup(); resolve(params); };
      const timer = setTimeout(() => { cleanup(); reject(new Error(`Browser-Ereignis ${method} blieb aus.`)); }, timeout);
      const cleanup = () => { clearTimeout(timer); listeners.set(method, (listeners.get(method) || []).filter(item => item !== handler)); };
      listeners.set(method, [...(listeners.get(method) || []), handler]);
    });
  }
  async function evaluate(expression, awaitPromise = false) {
    const result = await command('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
  async function waitFor(expression, timeout = 20000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      if (await evaluate(expression)) return;
      await delay(200);
    }
    throw new Error(`Browser-Wartezeit überschritten: ${expression}`);
  }

  await Promise.all([command('Page.enable'), command('Runtime.enable'), command('Network.enable'), command('Log.enable')]);
  const runtimeExceptions = [];
  const consoleErrors = [];
  const failedRequests = [];
  const assetResponses = new Map();
  listeners.set('Runtime.exceptionThrown', [params => runtimeExceptions.push(params.exceptionDetails.text || 'Unbekannte Ausnahme')]);
  listeners.set('Runtime.consoleAPICalled', [params => {
    if (params.type === 'error') consoleErrors.push(params.args.map(argument => argument.value || argument.description || argument.type).join(' '));
  }]);
  listeners.set('Log.entryAdded', [params => { if (params.entry.level === 'error') consoleErrors.push(params.entry.text); }]);
  listeners.set('Network.loadingFailed', [params => failedRequests.push(`${params.errorText}: ${params.blockedReason || ''}`)]);
  listeners.set('Network.responseReceived', [params => {
    const response = params.response;
    if (response.url.startsWith(baseUrl + '/assets/')) assetResponses.set(response.url, { status: response.status, mimeType: response.mimeType });
    if (response.status >= 400 && response.url.startsWith(baseUrl)) failedRequests.push(`${response.status}: ${response.url}`);
  }]);

  const results = [];
  for (const [slug, tool] of pages) {
    runtimeExceptions.length = 0; consoleErrors.length = 0; failedRequests.length = 0; assetResponses.clear();
    const loaded = once('Page.loadEventFired');
    await command('Page.navigate', { url: `${baseUrl}/tools/pdf/${slug}/` });
    await loaded;
    await waitFor(`(() => {
      const root = document.querySelector('[data-pdf-tool="${tool}"]');
      const heading = root && root.querySelector('.pdf-app-fallback h2');
      return Boolean(root && (root.dataset.pdfToolInitialized === 'true' || (heading && heading.textContent.includes('nicht verfügbar'))));
    })()`, 10000);
    const state = await evaluate(`(() => {
      const root = document.querySelector('[data-pdf-tool="${tool}"]');
      const picker = root && root.querySelector('input[type="file"]');
      const dropZone = root && root.querySelector('.file-drop-zone');
      const primary = root && root.querySelector('[data-action="process"]');
      const rectangle = root && root.getBoundingClientRect();
      return {
        path: location.pathname,
        root: Boolean(root),
        initialized: Boolean(root && root.dataset.pdfToolInitialized === 'true'),
        visible: Boolean(rectangle && rectangle.width > 0 && rectangle.height > 0 && getComputedStyle(root).display !== 'none' && getComputedStyle(root).visibility !== 'hidden'),
        picker: Boolean(picker), dropZone: Boolean(dropZone), primary: Boolean(primary),
        fallback: Boolean(root && root.querySelector('.pdf-app-fallback')),
        fallbackHeading: root && root.querySelector('.pdf-app-fallback h2') ? root.querySelector('.pdf-app-fallback h2').textContent : '',
        textLength: root ? root.textContent.trim().length : 0
      };
    })()`);
    state.exceptions = runtimeExceptions.slice();
    state.consoleErrors = consoleErrors.slice();
    state.failedRequests = failedRequests.slice();
    state.assets = Object.fromEntries(assetResponses);
    results.push(state);
  }

  if (diagnostic) console.log(JSON.stringify(results, null, 2));

  let renderedThumbnails = 0;
  if (!smokeOnly) {
    const extractLoaded = once('Page.loadEventFired');
    await command('Page.navigate', { url: `${baseUrl}/tools/pdf/extrahieren/` });
    await extractLoaded;
    await waitFor("Boolean(window.PDFLib && document.querySelector('.file-input'))");
    await evaluate(`(async () => {
    const pdf = await PDFLib.PDFDocument.create();
    pdf.addPage([300, 200]).drawText('Browser Seite 1', { x: 30, y: 100 });
    pdf.addPage([400, 250]).drawText('Browser Seite 2', { x: 30, y: 100 });
    const transfer = new DataTransfer();
    transfer.items.add(new File([await pdf.save()], 'nested-browser-test.pdf', { type: 'application/pdf' }));
    const input = document.querySelector('.file-input'); input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  })()`, true);
    await waitFor("document.querySelectorAll('.pdf-thumbnail').length === 2");
    await evaluate("document.querySelector('.pdf-thumbnail-grid').scrollIntoView(); true");
    await waitFor("document.querySelectorAll('.page-canvas[width]:not([width=\"0\"])').length === 2");
    renderedThumbnails = await evaluate("document.querySelectorAll('.page-canvas[width]:not([width=\"0\"])').length");
  }

  for (const result of results) {
    assert.strictEqual(result.path.endsWith('/'), true, `${result.path}: Produktionspfad ohne abschließenden Slash`);
    assert.ok(result.root && result.initialized && result.visible && result.picker && result.dropZone && result.primary, `${result.path}: PDF-App nicht vollständig sichtbar: ${JSON.stringify(result)}`);
    assert.strictEqual(result.fallback, false, `${result.path}: statischer Fehlerzustand blieb sichtbar`);
    assert.deepStrictEqual(result.exceptions, [], `${result.path}: unbehandelte JavaScript-Ausnahme`);
    assert.deepStrictEqual(result.failedRequests, [], `${result.path}: fehlgeschlagener lokaler Request`);
    assert.deepStrictEqual(result.consoleErrors, [], `${result.path}: Konsolenfehler`);
    for (const [url, response] of Object.entries(result.assets)) {
      if (/\.js$/.test(new URL(url).pathname)) assert.ok(/^application\/javascript\b/.test(response.mimeType), `${result.path}: falscher JavaScript-MIME-Typ für ${url}: ${response.mimeType}`);
    }
  }
  if (!smokeOnly) assert.strictEqual(renderedThumbnails, 2, 'Die echte verschachtelte Extrahieren-Seite renderte nicht beide Miniaturen.');
  console.log(`PDF-SEITEN-BROWSER ERFOLGREICH: ${results.length} verschachtelte Werkzeugseiten sichtbar${smokeOnly ? '.' : `; ${renderedThumbnails} echte Miniaturen.`}`);
  socket.close();

  if (closeBrowser) {
    const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
    const closeSocket = new WebSocket(version.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { closeSocket.addEventListener('open', resolve); closeSocket.addEventListener('error', reject); });
    closeSocket.send(JSON.stringify({ id: 99, method: 'Browser.close' }));
  }
}()).catch(error => { console.error(error); process.exit(1); });
