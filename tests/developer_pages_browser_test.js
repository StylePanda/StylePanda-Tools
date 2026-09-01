'use strict';

const assert = require('assert');
const pages = [
  ['json-formatieren', 'json-format'], ['json-minimieren', 'json-minify'], ['base64', 'base64'],
  ['url-encoder-decoder', 'url'], ['html-entities', 'html-entities'], ['hash-generator', 'hash'],
  ['uuid-generator', 'uuid'], ['unix-timestamp', 'timestamp'], ['regex-tester', 'regex'],
  ['jwt-decoder', 'jwt'], ['qr-code-generator', 'qr']
];
const port = Number(process.argv[2] || 9222);
const baseUrl = String(process.argv[3] || 'http://127.0.0.1:8010').replace(/\/$/, '');
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

(async function () {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const target = targets.find((item) => item.type === 'page');
  if (!target) throw new Error('Keine Brave/Chromium-Testseite gefunden.');
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  const pending = new Map(); const listeners = new Map(); let nextId = 1;
  socket.addEventListener('message', (event) => { const message = JSON.parse(event.data); if (message.id && pending.has(message.id)) { const handlers = pending.get(message.id); pending.delete(message.id); if (message.error) handlers.reject(new Error(JSON.stringify(message.error))); else handlers.resolve(message.result); return; } (listeners.get(message.method) || []).forEach((listener) => listener(message.params)); });
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve); socket.addEventListener('error', reject); });
  function command(method, params = {}) { return new Promise((resolve, reject) => { const id = nextId++; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); }); }
  function once(method, timeout = 15000) { return new Promise((resolve, reject) => { const handler = (params) => { cleanup(); resolve(params); }; const timer = setTimeout(() => { cleanup(); reject(new Error(`Browser-Ereignis ${method} blieb aus.`)); }, timeout); function cleanup() { clearTimeout(timer); listeners.set(method, (listeners.get(method) || []).filter((item) => item !== handler)); } listeners.set(method, [...(listeners.get(method) || []), handler]); }); }
  async function evaluate(expression, awaitPromise = false) { const response = await command('Runtime.evaluate', { expression, awaitPromise, returnByValue: true }); if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails)); return response.result.value; }
  async function waitFor(expression, timeout = 15000) { const started = Date.now(); while (Date.now() - started < timeout) { if (await evaluate(expression)) return; await delay(80); } throw new Error(`Wartezeit überschritten: ${expression}`); }
  async function navigate(slug, tool) { await command('Network.setBlockedURLs', { urls: [] }); const loaded = once('Page.loadEventFired'); await command('Page.navigate', { url: `${baseUrl}/tools/entwickler/${slug}/` }); await loaded; await waitFor(`document.querySelector('[data-developer-tool="${tool}"]')?.dataset.initialized === 'true'`); }
  async function setValue(selector, value) { await evaluate(`(() => { const node = document.querySelector(${JSON.stringify(selector)}); node.value = ${JSON.stringify(value)}; node.dispatchEvent(new Event('input', { bubbles: true })); node.dispatchEvent(new Event('change', { bubbles: true })); })()`); }
  async function click(action) { await evaluate(`document.querySelector('[data-action="${action}"]').click(); true`); }

  await Promise.all([command('Page.enable'), command('Runtime.enable'), command('Network.enable')]);
  const exceptions = []; listeners.set('Runtime.exceptionThrown', [(params) => exceptions.push(params.exceptionDetails.text || 'Ausnahme')]);

  for (const [slug, tool] of pages) {
    await navigate(slug, tool);
    const state = await evaluate(`(() => { const root = document.querySelector('[data-developer-tool="${tool}"]'); const rect = root.getBoundingClientRect(); return { initialized: root.dataset.initialized, visible: rect.width > 0 && rect.height > 0, form: !!root.querySelector('form'), status: !!root.querySelector('[data-status]'), action: !!root.querySelector('[data-action="run"]') }; })()`);
    assert.deepStrictEqual(state, { initialized: 'true', visible: true, form: true, status: true, action: true }, `${slug}: UI initialisiert`);
  }

  await navigate('json-formatieren', 'json-format'); await setValue('[data-input]', '{"b":[1,true],"a":"ä"}'); await click('run'); assert.strictEqual(await evaluate("document.querySelector('[data-output]').value"), '{\n  "b": [\n    1,\n    true\n  ],\n  "a": "ä"\n}', 'JSON-Formatierung im realen UI');
  await setValue('[data-input]', '{"x":}'); await click('run'); assert.strictEqual(await evaluate("document.querySelector('.developer-tool-app').dataset.errorCode"), 'invalid_json', 'JSON-Syntaxfehler sichtbar');

  await navigate('json-minimieren', 'json-minify'); await setValue('[data-input]', '{ "a": 1, "text": "🐼" }'); await click('run'); assert.strictEqual(await evaluate("document.querySelector('[data-output]').value"), '{"a":1,"text":"🐼"}', 'JSON-Minifier im UI'); assert.ok(Number(await evaluate("document.querySelector('[data-result-bytes]').textContent")) > 0, 'UTF-8-Bytevergleich sichtbar');

  await navigate('base64', 'base64'); await setValue('[data-input]', 'Grüße 🐼'); await click('run'); const encoded = await evaluate("document.querySelector('[data-output]').value"); await setValue('[data-mode]', 'decode'); await setValue('[data-input]', encoded); await click('run'); assert.strictEqual(await evaluate("document.querySelector('[data-output]').value"), 'Grüße 🐼', 'Base64 UTF-8 Roundtrip');
  await setValue('[data-input]', '%%%'); await click('run'); assert.strictEqual(await evaluate("document.querySelector('.developer-tool-app').dataset.errorCode"), 'invalid_base64', 'Malformed Base64 im UI');

  await navigate('url-encoder-decoder', 'url'); await setValue('[data-input]', 'München & 東京'); await click('run'); assert.strictEqual(await evaluate("document.querySelector('[data-output]').value"), 'M%C3%BCnchen%20%26%20%E6%9D%B1%E4%BA%AC', 'URL-Komponente kodiert');
  await navigate('html-entities', 'html-entities'); await setValue('[data-input]', '<img src=x onerror=alert(1)> & "Text"'); await click('run'); assert.ok((await evaluate("document.querySelector('[data-output]').value")).startsWith('&lt;img'), 'HTML sicher kodiert'); await setValue('[data-mode]', 'decode'); await setValue('[data-input]', '&lt;script&gt;window.__unsafe=true&lt;/script&gt;'); await click('run'); assert.strictEqual(await evaluate("document.querySelector('[data-output]').value"), '<script>window.__unsafe=true</script>', 'HTML wird als Text dekodiert'); assert.strictEqual(await evaluate('window.__unsafe === true'), false, 'Dekodiertes HTML nicht ausgeführt');

  await navigate('hash-generator', 'hash'); await setValue('[data-input]', 'abc'); await click('run'); await waitFor("document.querySelector('[data-output]').value.length === 64"); assert.strictEqual(await evaluate("document.querySelector('[data-output]').value"), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', 'SHA-256 im UI');
  await navigate('uuid-generator', 'uuid'); await setValue('[data-count]', '5'); await click('run'); const uuids = await evaluate("document.querySelector('[data-output]').value.split('\\n')"); assert.strictEqual(uuids.length, 5, 'Fünf UUIDs'); uuids.forEach((uuid) => assert.ok(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid), 'UUID v4 im UI'));
  await navigate('unix-timestamp', 'timestamp'); await setValue('[data-timestamp]', '0'); await click('run'); assert.strictEqual(await evaluate("document.querySelector('[data-iso-result]').textContent"), '1970-01-01T00:00:00.000Z', 'Timestamp-Epoche im UI');
  await navigate('regex-tester', 'regex'); await setValue('[data-pattern]', '(?<word>panda)-(\\d+)'); await setValue('[data-input]', 'panda-12 panda-34'); await click('run'); assert.strictEqual(await evaluate("document.querySelectorAll('[data-match-list] li').length"), 2, 'Regex-Trefferliste'); assert.ok((await evaluate("document.querySelector('[data-match-list]').textContent")).includes('word=panda'), 'Named Group sichtbar');
  await setValue('[data-pattern]', '(?=a)'); await setValue('[data-input]', 'aa'); await click('run'); assert.strictEqual(await evaluate("document.querySelectorAll('[data-match-list] li').length"), 2, 'Zero-Length-Regex terminiert');

  const token = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url') + '.' + Buffer.from(JSON.stringify({ sub: 'Bär 🐼', exp: 0, iat: 1 })).toString('base64url') + '.x';
  await navigate('jwt-decoder', 'jwt'); await setValue('[data-input]', token); await click('run'); assert.ok((await evaluate("document.querySelector('[data-payload]').value")).includes('Bär 🐼'), 'JWT Unicode Payload'); assert.ok((await evaluate("document.querySelector('[data-claims]').textContent")).includes('abgelaufen'), 'JWT exp lesbar'); assert.ok((await evaluate('document.body.textContent')).includes('Die Signatur wird nicht überprüft'), 'Keine Signatur-Validitätsbehauptung');

  await navigate('qr-code-generator', 'qr'); await setValue('[data-input]', 'https://example.invalid/🐼'); await click('run'); await waitFor("document.querySelector('.developer-tool-app').dataset.qrReady === 'true'"); let qr = await evaluate(`(() => { const canvas = document.querySelector('[data-qr-canvas]'); const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data; let dark = 0; for (let i = 0; i < pixels.length; i += 4) if (pixels[i] < 64) dark += 1; return { width: canvas.width, height: canvas.height, dark }; })()`); assert.deepStrictEqual({ width: qr.width, height: qr.height }, { width: 256, height: 256 }, 'QR-Canvas-Abmessungen'); assert.ok(qr.dark > 1000, 'QR-Matrix enthält dunkle Module'); await click('download'); await waitFor("Number(document.querySelector('.developer-tool-app').dataset.downloadSize) > 0"); assert.strictEqual(await evaluate("document.querySelector('.developer-tool-app').dataset.downloadMime"), 'image/png', 'QR-Download ist PNG');

  // Representative operations after all page assets loaded and HTTP/HTTPS blocked.
  const offlineCases = [
    ['json-formatieren', 'json-format', `document.querySelector('[data-input]').value='{"offline":true}'; document.querySelector('[data-action="run"]').click()`, "document.querySelector('[data-output]').value.includes('offline')"],
    ['base64', 'base64', `document.querySelector('[data-input]').value='Grüße 🐼'; document.querySelector('[data-action="run"]').click()`, "document.querySelector('[data-output]').value.length > 8"],
    ['hash-generator', 'hash', `document.querySelector('[data-input]').value='abc'; document.querySelector('[data-action="run"]').click()`, "document.querySelector('[data-output]').value.length === 64"],
    ['uuid-generator', 'uuid', `document.querySelector('[data-action="run"]').click()`, "document.querySelector('[data-output]').value.length === 36"],
    ['unix-timestamp', 'timestamp', `document.querySelector('[data-timestamp]').value='0'; document.querySelector('[data-action="run"]').click()`, "document.querySelector('[data-iso-result]').textContent.startsWith('1970')"],
    ['regex-tester', 'regex', `document.querySelector('[data-pattern]').value='a+'; document.querySelector('[data-input]').value='aaa'; document.querySelector('[data-action="run"]').click()`, "document.querySelectorAll('[data-match-list] li').length === 1"],
    ['jwt-decoder', 'jwt', `document.querySelector('[data-input]').value=${JSON.stringify(token)}; document.querySelector('[data-action="run"]').click()`, "document.querySelector('[data-payload]').value.includes('Bär')"],
    ['qr-code-generator', 'qr', `document.querySelector('[data-input]').value='offline'; document.querySelector('[data-action="run"]').click()`, "document.querySelector('.developer-tool-app').dataset.qrReady === 'true'"]
  ];
  for (const [slug, tool, operation, assertion] of offlineCases) { await navigate(slug, tool); await command('Network.setBlockedURLs', { urls: ['http://*', 'https://*'] }); await evaluate(operation); await waitFor(assertion); }

  for (const width of [320, 375, 390, 430, 768, 1024, 1280, 1440, 1920]) {
    await command('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 768 });
    await navigate('hash-generator', 'hash'); await setValue('[data-input]', 'responsive'); await click('run'); await waitFor("document.querySelector('[data-output]').value.length === 64");
    const layout = await evaluate(`(() => { const root = document.querySelector('[data-developer-tool]'); const output = document.querySelector('[data-output]'); const actions = document.querySelector('.tool-actions'); return { bodyOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth, rootWidth: root.getBoundingClientRect().width, outputOverflow: output.scrollWidth > output.clientWidth && getComputedStyle(output).overflowX !== 'auto', actionsRight: actions.getBoundingClientRect().right, viewport: document.documentElement.clientWidth }; })()`);
    assert.strictEqual(layout.bodyOverflow, false, `${width}px: kein horizontaler Dokument-Overflow`); assert.ok(layout.rootWidth > 0, `${width}px: Tool sichtbar`); assert.strictEqual(layout.outputOverflow, false, `${width}px: langer Hash bleibt intern beherrscht`); assert.ok(layout.actionsRight <= layout.viewport + 1, `${width}px: Aktionen erreichbar`);
  }

  await command('Emulation.clearDeviceMetricsOverride');
  assert.deepStrictEqual(exceptions, [], 'Keine unbehandelten Browser-Ausnahmen');
  console.log('DEVELOPER-PAGES-BROWSER ERFOLGREICH: 11 Seiten, reale UI-Operationen, Offline-Matrix, QR-PNG und 9 Viewports');
  socket.close();
}()).catch((error) => { console.error(error); process.exit(1); });
