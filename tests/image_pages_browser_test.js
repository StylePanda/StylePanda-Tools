'use strict';

const assert = require('assert');
const pages = [
  ['komprimieren','compress'], ['groesse-aendern','resize'], ['zuschneiden','crop'], ['drehen-spiegeln','rotate'], ['format-konvertieren','convert'],
  ['mehrere-konvertieren','batch'], ['metadaten-anzeigen','metadata'], ['metadaten-entfernen','remove-metadata'], ['farbe-auswaehlen','color'], ['favicon-erstellen','favicon']
];
const port = Number(process.argv[2] || 9227);
const baseUrl = String(process.argv[3] || 'http://127.0.0.1:8010').replace(/\/$/, '');
function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

(async function () {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const target = targets.find(item => item.type === 'page'); if (!target) throw new Error('Keine Browser-Testseite gefunden.');
  const socket = new WebSocket(target.webSocketDebuggerUrl); const pending = new Map(); const listeners = new Map(); let nextId = 1;
  socket.addEventListener('message', event => { const message = JSON.parse(event.data); if (message.id && pending.has(message.id)) { const handlers = pending.get(message.id); pending.delete(message.id); if (message.error || message.result?.exceptionDetails) handlers.reject(new Error(JSON.stringify(message.error || message.result.exceptionDetails))); else handlers.resolve(message.result); return; } (listeners.get(message.method) || []).forEach(listener => listener(message.params)); });
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve); socket.addEventListener('error', reject); });
  function command(method, params = {}) { return new Promise((resolve, reject) => { const id = nextId++; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); }); }
  function once(method, timeout = 15000) { return new Promise((resolve, reject) => { const handler = params => { cleanup(); resolve(params); }; const timer = setTimeout(() => { cleanup(); reject(new Error(`Browser-Ereignis ${method} blieb aus.`)); }, timeout); function cleanup() { clearTimeout(timer); listeners.set(method, (listeners.get(method) || []).filter(item => item !== handler)); } listeners.set(method, [...(listeners.get(method) || []), handler]); }); }
  async function evaluate(expression, awaitPromise = false) { const response = await command('Runtime.evaluate', { expression, awaitPromise, returnByValue: true }); if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails)); return response.result.value; }
  async function waitFor(expression, timeout = 15000) { const started = Date.now(); while (Date.now() - started < timeout) { if (await evaluate(expression)) return; await delay(100); } throw new Error(`Wartezeit überschritten: ${expression}`); }
  async function navigate(slug, tool) { await command('Network.setBlockedURLs', { urls: [] }); const loaded = once('Page.loadEventFired'); await command('Page.navigate', { url: `${baseUrl}/tools/bild/${slug}/` }); await loaded; await waitFor(`document.querySelector('[data-image-tool="${tool}"]')?.dataset.imageToolInitialized === 'true'`); }
  const makeFiles = `(async (count = 1, mime = 'image/png') => { const extension = mime === 'image/jpeg' ? 'jpg' : mime.split('/')[1]; const files = []; for (let n = 0; n < count; n += 1) { let blob; if (mime === 'image/png' && n === 0) { const binary = atob('iVBORw0KGgoAAAANSUhEUgAAAAQAAAACCAYAAAB/qH1jAAAAEklEQVR4nGP4z8DwHxkzoAsAAA8hD/EEN8afAAAAAElFTkSuQmCC'); const bytes = Uint8Array.from(binary, character => character.charCodeAt(0)); blob = new Blob([bytes], { type: mime }); } else { const canvas = document.createElement('canvas'); canvas.width = 4; canvas.height = 2; const ctx = canvas.getContext('2d'); ctx.fillStyle = n ? '#00ff00' : '#ff0000'; ctx.fillRect(0,0,4,2); blob = await new Promise(resolve => canvas.toBlob(resolve, mime, .95)); } if (!blob || blob.type !== mime) throw new Error('Testbrowser kann ' + mime + ' nicht erzeugen.'); files.push(new File([blob], 'test-' + n + '.' + extension, { type: mime, lastModified: 1700000000000 })); } const transfer = new DataTransfer(); files.forEach(file => transfer.items.add(file)); const input = document.querySelector('.file-input'); input.files = transfer.files; input.dispatchEvent(new Event('change', { bubbles: true })); return files.length; })`;
  await Promise.all([command('Page.enable'), command('Runtime.enable'), command('Network.enable')]);
  const exceptions = []; listeners.set('Runtime.exceptionThrown', [params => exceptions.push(params.exceptionDetails.text || 'Ausnahme')]);

  for (const [slug, tool] of pages) {
    await navigate(slug, tool);
    const state = await evaluate(`(() => { const root = document.querySelector('[data-image-tool="${tool}"]'); const rect = root.getBoundingClientRect(); return { initialized: root.dataset.imageToolInitialized, visible: rect.width > 0 && rect.height > 0, picker: !!root.querySelector('.file-input'), drop: !!root.querySelector('.file-drop-zone'), process: !!root.querySelector('[data-process]') }; })()`);
    assert.deepStrictEqual(state, { initialized: 'true', visible: true, picker: true, drop: true, process: true }, `${slug}: Oberfläche unvollständig`);
  }

  // Direct decode regression: the same production file-input/decode/adopt path must decode and draw real browser PNG/JPEG/WebP blobs under the active CSP.
  for (const mime of ['image/png', 'image/jpeg', 'image/webp']) {
    await navigate('komprimieren', 'compress'); await command('Network.setBlockedURLs', { urls: ['http://*', 'https://*'] }); await evaluate(`${makeFiles}(1, '${mime}')`, true); await waitFor("document.querySelector('[data-workspace]').hidden === false && document.querySelector('[data-source-preview]').complete && document.querySelector('[data-source-preview]').naturalWidth === 4");
    const decoded = await evaluate(`(() => { const root = document.querySelector('[data-image-tool]'); const image = document.querySelector('[data-source-preview]'); const canvas = document.createElement('canvas'); canvas.width = 4; canvas.height = 2; canvas.getContext('2d').drawImage(image, 0, 0, 4, 2); const pixel = Array.from(canvas.getContext('2d').getImageData(0, 0, 1, 1).data); return { width: root.dataset.sourceWidth, height: root.dataset.sourceHeight, mime: root.dataset.sourceMime, method: root.dataset.decodeMethod, probe: root.dataset.decodePixel, previewComplete: image.complete, previewWidth: image.naturalWidth, previewHeight: image.naturalHeight, pixel }; })()`);
    assert.strictEqual(decoded.width, '4', `${mime}: Produktionsdecoder-Breite`); assert.strictEqual(decoded.height, '2', `${mime}: Produktionsdecoder-Höhe`); assert.strictEqual(decoded.mime, mime, `${mime}: Produktionsdecoder-MIME`); assert.ok(decoded.method === 'createImageBitmap' || decoded.method === 'image-data-url-fallback', `${mime}: Decode-Methode`); assert.ok(decoded.probe, `${mime}: interner Canvas-Probe-Pixel`); assert.ok(decoded.previewComplete && decoded.previewWidth === 4 && decoded.previewHeight === 2, `${mime}: CSP-sichere Vorschau`); assert.ok(decoded.pixel[0] > 240 && decoded.pixel[1] < 20 && decoded.pixel[2] < 20 && decoded.pixel[3] === 255, `${mime}: roter Pixel durch Canvas`);
  }

  // Representative real-UI matrix for the seven manually requested tools and all baseline formats.
  const uiTools = [
    ['komprimieren', 'compress', `document.querySelector('[data-process]').click()`],
    ['groesse-aendern', 'resize', `document.querySelector('[data-process]').click()`],
    ['zuschneiden', 'crop', `document.querySelector('[data-process]').click()`],
    ['drehen-spiegeln', 'rotate', `document.querySelector('[data-transform="right"]').click(); document.querySelector('[data-process]').click()`],
    ['format-konvertieren', 'convert', `document.querySelector('[data-format]').value = 'image/png'; document.querySelector('[data-format]').dispatchEvent(new Event('change')); document.querySelector('[data-process]').click()`],
    ['metadaten-anzeigen', 'metadata', ''],
    ['farbe-auswaehlen', 'color', '']
  ];
  for (const mime of ['image/png', 'image/jpeg', 'image/webp']) {
    for (const [slug, tool, action] of uiTools) {
      await navigate(slug, tool); await evaluate(`${makeFiles}(1, '${mime}')`, true); await waitFor("document.querySelector('[data-workspace]').hidden === false");
      const loaded = await evaluate(`(() => { const root = document.querySelector('[data-image-tool]'); const preview = document.querySelector('[data-source-preview]'); return { width: root.dataset.sourceWidth, height: root.dataset.sourceHeight, mime: root.dataset.sourceMime, preview: preview.complete && preview.naturalWidth === 4 }; })()`);
      assert.deepStrictEqual(loaded, { width: '4', height: '2', mime, preview: true }, `${slug}/${mime}: Auswahl, Vorschau und Maße`);
      if (action) { await evaluate(`${action}; true`); await waitFor("Number(document.querySelector('[data-image-tool]').dataset.resultSize) > 0"); assert.strictEqual(await evaluate("document.querySelector('[data-download]').disabled"), false, `${slug}/${mime}: Download bereit`); }
      else if (tool === 'metadata') assert.ok(await evaluate("document.querySelectorAll('.metadata-table dd').length >= 7"), `${slug}/${mime}: Metadaten sichtbar`);
      else assert.ok((await evaluate("document.querySelector('[data-hex]').textContent")).startsWith('#'), `${slug}/${mime}: Farbe abgetastet`);
    }
  }

  // Offline resize: block every network request only after page and local assets loaded.
  await navigate('groesse-aendern', 'resize'); await command('Network.setBlockedURLs', { urls: ['http://*', 'https://*'] }); await evaluate(`${makeFiles}(1)`, true); await waitFor("document.querySelector('[data-workspace]').hidden === false");
  await evaluate(`document.querySelector('[data-width]').value = 2; document.querySelector('[data-width]').dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('[data-process]').click(); true`); await waitFor("document.querySelector('[data-image-tool]').dataset.resultWidth === '2'");
  let result = await evaluate(`({ width: document.querySelector('[data-image-tool]').dataset.resultWidth, height: document.querySelector('[data-image-tool]').dataset.resultHeight })`); assert.deepStrictEqual(result, { width: '2', height: '1' }, 'Offline-Resize 2 × 1');

  // Offline format conversion.
  await navigate('format-konvertieren', 'convert'); await command('Network.setBlockedURLs', { urls: ['http://*', 'https://*'] }); await evaluate(`${makeFiles}(1)`, true); await waitFor("document.querySelector('[data-workspace]').hidden === false"); await evaluate(`document.querySelector('[data-format]').value = 'image/jpeg'; document.querySelector('[data-format]').dispatchEvent(new Event('change')); document.querySelector('[data-process]').click(); true`); await waitFor("document.querySelector('[data-image-tool]').dataset.resultMime === 'image/jpeg'");

  // Offline metadata removal keeps dimensions and re-encodes.
  await navigate('metadaten-entfernen', 'remove-metadata'); await command('Network.setBlockedURLs', { urls: ['http://*', 'https://*'] }); await evaluate(`${makeFiles}(1)`, true); await waitFor("document.querySelector('[data-workspace]').hidden === false"); await evaluate(`document.querySelector('[data-process]').click(); true`); await waitFor("document.querySelector('[data-image-tool]').dataset.resultSize"); result = await evaluate(`({ mime: document.querySelector('[data-image-tool]').dataset.resultMime, width: document.querySelector('[data-image-tool]').dataset.resultWidth, height: document.querySelector('[data-image-tool]').dataset.resultHeight })`); assert.deepStrictEqual(result, { mime: 'image/png', width: '4', height: '2' }, 'Offline-Metadatenentfernung');

  // Offline known-red color sample. Chromium color management may shift zero channels by one unit.
  await navigate('farbe-auswaehlen', 'color'); await command('Network.setBlockedURLs', { urls: ['http://*', 'https://*'] }); await evaluate(`${makeFiles}(1)`, true); await waitFor("document.querySelector('[data-workspace]').hidden === false"); result = await evaluate(`({ hex: document.querySelector('[data-hex]').textContent, rgb: document.querySelector('[data-rgb]').textContent, status: document.querySelector('[data-status]').textContent, sourceMime: document.querySelector('[data-image-tool]').dataset.sourceMime, probe: document.querySelector('[data-image-tool]').dataset.decodePixel })`); assert.ok(/^#FF0[0-2]0[0-2]$/.test(result.hex), `Offline-Farbprobe nahe #FF0000: ${JSON.stringify(result)}`); assert.ok(/^rgb\(255, [0-2], [0-2]\)$/.test(result.rgb), `Offline-RGB-Probe nahe rgb(255, 0, 0): ${JSON.stringify(result)}`);

  // Rotation dimensions.
  await navigate('drehen-spiegeln', 'rotate'); await evaluate(`${makeFiles}(1)`, true); await waitFor("document.querySelector('[data-workspace]').hidden === false"); await evaluate(`document.querySelector('[data-transform="right"]').click(); document.querySelector('[data-process]').click(); true`); await waitFor("document.querySelector('[data-image-tool]').dataset.resultWidth === '2'"); result = await evaluate(`({ width: document.querySelector('[data-image-tool]').dataset.resultWidth, height: document.querySelector('[data-image-tool]').dataset.resultHeight })`); assert.deepStrictEqual(result, { width: '2', height: '4' }, 'Drehung vertauscht Abmessungen');

  // Batch and ZIP.
  await navigate('mehrere-konvertieren', 'batch'); await evaluate(`${makeFiles}(2)`, true); await waitFor("document.querySelectorAll('.batch-card').length === 2"); await evaluate(`document.querySelector('[data-process]').click(); true`); await waitFor("document.querySelector('[data-image-tool]').dataset.batchSuccess === '2'"); await evaluate(`document.querySelector('[data-download-all]').click(); true`); await waitFor("Number(document.querySelector('[data-image-tool]').dataset.zipSize) > 0");

  // Metadata without EXIF and corrupt input.
  await navigate('metadaten-anzeigen', 'metadata'); await evaluate(`${makeFiles}(1)`, true); await waitFor("document.querySelector('.metadata-table dd')"); assert.strictEqual(await evaluate("document.querySelector('[data-gps]').hidden"), true, 'Kein erfundenes GPS');
  await navigate('komprimieren', 'compress'); await evaluate(`(() => { const transfer = new DataTransfer(); transfer.items.add(new File([new Uint8Array([1,2,3,4])], 'kaputt.png', { type: 'image/png' })); const input = document.querySelector('.file-input'); input.files = transfer.files; input.dispatchEvent(new Event('change', { bubbles: true })); })()`); await waitFor("document.querySelector('[data-status]').classList.contains('is-error')"); assert.strictEqual(await evaluate("document.querySelector('[data-image-tool]').dataset.lastErrorCode"), 'invalid_signature', 'Beschädigte Eingabe wird intern kategorisiert');

  // Favicons and ZIP.
  await navigate('favicon-erstellen', 'favicon'); await evaluate(`${makeFiles}(1)`, true); await waitFor("document.querySelector('[data-workspace]').hidden === false"); await evaluate(`document.querySelector('[data-process]').click(); true`); await waitFor("document.querySelector('[data-image-tool]').dataset.faviconSizes === '16,32,48,180,192,512'"); await evaluate(`document.querySelector('[data-download-all]').click(); true`); await waitFor("Number(document.querySelector('[data-image-tool]').dataset.zipSize) > 0");

  // Required viewports: structural overflow validation on the crop page.
  for (const width of [320,375,390,430,768,1024,1280,1440,1920]) { await command('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 }); await navigate('zuschneiden', 'crop'); const overflow = await evaluate(`document.documentElement.scrollWidth > document.documentElement.clientWidth`); assert.strictEqual(overflow, false, `Horizontaler Overflow bei ${width}px`); }
  await command('Emulation.clearDeviceMetricsOverride'); assert.deepStrictEqual(exceptions, [], 'Unbehandelte Browser-Ausnahmen');
  console.log(`IMAGE-PAGES-BROWSER ERFOLGREICH: 10 Seiten, PNG/JPEG/WebP-Produktionsdecoder, 21 UI-Formatläufe, Offline-Kernfunktionen, Stapel/ZIP, Fehlerfall und 9 Viewports`); socket.close();
}()).catch(error => { console.error(error); process.exit(1); });
