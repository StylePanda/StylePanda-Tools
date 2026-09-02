'use strict';

const assert = require('assert');
const port = Number(process.argv[2] || 9222);
const baseUrl = String(process.argv[3] || 'http://127.0.0.1:8010').replace(/\/$/, '');
const pages = [
  ['prozentrechner', 'percent'], ['dreisatzrechner', 'rule-of-three'], ['rabattrechner', 'discount'], ['mehrwertsteuerrechner', 'vat'],
  ['einheitenumrechner', 'units'], ['datengroessenrechner', 'data'], ['temperaturumrechner', 'temperature'], ['geschwindigkeitsumrechner', 'speed']
];
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

(async function () {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); const target = targets.find((item) => item.type === 'page'); if (!target) throw new Error('Keine Brave/Chromium-Testseite gefunden.');
  const socket = new WebSocket(target.webSocketDebuggerUrl); const pending = new Map(); const listeners = new Map(); let nextId = 1;
  socket.addEventListener('message', (event) => { const message = JSON.parse(event.data); if (message.id && pending.has(message.id)) { const callback = pending.get(message.id); pending.delete(message.id); if (message.error) callback.reject(new Error(JSON.stringify(message.error))); else callback.resolve(message.result); return; } (listeners.get(message.method) || []).forEach((listener) => listener(message.params)); });
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve); socket.addEventListener('error', reject); });
  function command(method, params = {}) { return new Promise((resolve, reject) => { const id = nextId++; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); }); }
  function once(method, timeout = 15000) { return new Promise((resolve, reject) => { const handler = (params) => { clean(); resolve(params); }; const timer = setTimeout(() => { clean(); reject(new Error(`Browser-Ereignis ${method} blieb aus.`)); }, timeout); function clean() { clearTimeout(timer); listeners.set(method, (listeners.get(method) || []).filter((item) => item !== handler)); } listeners.set(method, [...(listeners.get(method) || []), handler]); }); }
  async function evaluate(expression) { const response = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails)); return response.result.value; }
  async function waitFor(expression, timeout = 15000) { const started = Date.now(); while (Date.now() - started < timeout) { if (await evaluate(expression)) return; await delay(60); } throw new Error(`Wartezeit überschritten: ${expression}`); }
  async function navigate(slug, tool) { await command('Network.setBlockedURLs', { urls: [] }); const loaded = once('Page.loadEventFired'); await command('Page.navigate', { url: `${baseUrl}/tools/rechner/${slug}/` }); await loaded; await waitFor(`document.querySelector('[data-calculator-tool="${tool}"]')?.dataset.initialized === 'true'`); }
  async function navigatePath(pathname) { await command('Network.setBlockedURLs', { urls: [] }); const loaded = once('Page.loadEventFired'); await command('Page.navigate', { url: baseUrl + pathname }); await loaded; await waitFor("document.readyState === 'complete'"); }
  async function setValue(selector, value) { await evaluate(`(() => { const node=document.querySelector(${JSON.stringify(selector)}); node.value=${JSON.stringify(value)}; node.dispatchEvent(new Event('input',{bubbles:true})); node.dispatchEvent(new Event('change',{bubbles:true})); return true; })()`); }
  async function click(action) { await evaluate(`document.querySelector('[data-action="${action}"]').click(); true`); }
  async function calculateOffline(slug, tool, setup, expected) { await navigate(slug, tool); await command('Network.setBlockedURLs', { urls: ['http://*', 'https://*'] }); for (const [selector, value] of setup) await setValue(selector, value); await click('run'); await waitFor("document.querySelector('[data-result-panel]').hidden === false"); const result = await evaluate("document.querySelector('[data-result-value]').textContent"); assert.strictEqual(result, expected, `${slug}: Offline-Ergebnis`); return result; }

  await Promise.all([command('Page.enable'), command('Runtime.enable'), command('Network.enable')]); const exceptions = []; listeners.set('Runtime.exceptionThrown', [(params) => exceptions.push(params.exceptionDetails.text || 'Ausnahme')]);
  for (const [slug, tool] of pages) { await navigate(slug, tool); const shape = await evaluate(`(() => { const root=document.querySelector('[data-calculator-tool="${tool}"]'); const rect=root.getBoundingClientRect(); return { initialized:root.dataset.initialized, visible:rect.width>0&&rect.height>0, form:!!root.querySelector('form'), status:!!root.querySelector('[data-status]'), run:!!root.querySelector('[data-action="run"]'), hidden:root.querySelector('[data-result-panel]').hidden }; })()`); assert.deepStrictEqual(shape, { initialized: 'true', visible: true, form: true, status: true, run: true, hidden: true }, `${slug}: UI und kompakter Anfangszustand`); assert.ok((await evaluate('document.body.textContent')).includes('lokal in deinem Browser'), `${slug}: lokaler Hinweis`); }

  await calculateOffline('prozentrechner', 'percent', [['[data-mode]', 'of'], ['[data-first]', '20'], ['[data-second]', '150']], '30');
  await setValue('[data-mode]', 'ratio'); await setValue('[data-first]', '30'); await setValue('[data-second]', '150'); await click('run'); assert.strictEqual(await evaluate("document.querySelector('[data-result-value]').textContent"), '20 %', 'zweiter Prozentmodus');
  await setValue('[data-mode]', 'change'); await setValue('[data-first]', '100'); await setValue('[data-second]', '120'); await click('run'); assert.strictEqual(await evaluate("document.querySelector('[data-result-value]').textContent"), '+20 %', 'prozentuale Veränderung');
  await setValue('[data-mode]', 'adjust'); await setValue('[data-direction]', 'decrease'); await setValue('[data-first]', '100'); await setValue('[data-second]', '20'); await click('run'); assert.strictEqual(await evaluate("document.querySelector('[data-result-value]').textContent"), '80', 'prozentuale Verringerung');
  await setValue('[data-mode]', 'ratio'); await setValue('[data-second]', '0'); await click('run'); assert.strictEqual(await evaluate("document.querySelector('.calculator-tool-app').dataset.errorCode"), 'division_by_zero', 'Division durch 0 sichtbar');

  await calculateOffline('dreisatzrechner', 'rule-of-three', [['[data-a]', '2,5'], ['[data-b]', '7,5'], ['[data-c]', '1,2']], '3,6');
  await calculateOffline('rabattrechner', 'discount', [['[data-original]', '100'], ['[data-discount]', '20']], '80,00 €');
  await calculateOffline('mehrwertsteuerrechner', 'vat', [['[data-mode]', 'net-to-gross'], ['[data-amount]', '100'], ['[data-rate]', '20']], '120,00 €');
  await calculateOffline('einheitenumrechner', 'units', [['[data-category]', 'length'], ['[data-value]', '1'], ['[data-from]', 'km'], ['[data-to]', 'm']], '1.000 m');
  await calculateOffline('datengroessenrechner', 'data', [['[data-value]', '1'], ['[data-from]', 'MB'], ['[data-to]', 'MiB']], '0,9536743164 MiB');
  await calculateOffline('temperaturumrechner', 'temperature', [['[data-value]', '0'], ['[data-from]', 'C'], ['[data-to]', 'F']], '32 °F');
  await setValue('[data-value]', '-273,16'); await click('run'); assert.strictEqual(await evaluate("document.querySelector('.calculator-tool-app').dataset.errorCode"), 'below_absolute_zero', 'physikalisch unmögliche Temperatur abgewiesen');
  await calculateOffline('geschwindigkeitsumrechner', 'speed', [['[data-value]', '100'], ['[data-from]', 'kmh'], ['[data-to]', 'mph']], '62,1371192237 mph');

  for (const width of [320, 375, 390, 430, 768, 1024, 1280, 1440, 1920]) {
    await command('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 768 }); const page = pages[width % pages.length]; await navigate(page[0], page[1]);
    const layout = await evaluate(`(() => { const viewport=document.documentElement.clientWidth; const root=document.querySelector('[data-calculator-tool]'); const controls=[...document.querySelectorAll('input,select,button')]; return { bodyOverflow:document.documentElement.scrollWidth>viewport, scrollWidth:document.documentElement.scrollWidth, viewport, offenders:[...document.querySelectorAll('body *')].filter((node)=>node.getBoundingClientRect().right>viewport+1).slice(0,6).map((node)=>node.tagName+'.'+node.className), rootWidth:root.getBoundingClientRect().width, controlOverflow:controls.some((node)=>node.getBoundingClientRect().right>viewport+1), resultHidden:document.querySelector('[data-result-panel]').hidden }; })()`);
    assert.strictEqual(layout.bodyOverflow, false, `${width}px: kein horizontaler Body-Overflow (${JSON.stringify(layout)})`); assert.ok(layout.rootWidth > 0, `${width}px: Rechner sichtbar`); assert.strictEqual(layout.controlOverflow, false, `${width}px: Eingaben und Buttons erreichbar`); assert.strictEqual(layout.resultHidden, true, `${width}px: kein großer leerer Ergebnisbereich`);
    await navigatePath('/tools/rechner/'); assert.strictEqual(await evaluate('document.documentElement.scrollWidth > document.documentElement.clientWidth'), false, `${width}px: Rechner-Übersicht ohne horizontalen Overflow`);
  }
  await command('Emulation.clearDeviceMetricsOverride'); assert.deepStrictEqual(exceptions, [], 'keine unbehandelten Browser-Ausnahmen'); console.log('CALCULATOR-PAGES-BROWSER ERFOLGREICH: 8 reale UIs, Offline-Matrix und 9 Viewports'); socket.close();
}()).catch((error) => { console.error(error); process.exit(1); });
