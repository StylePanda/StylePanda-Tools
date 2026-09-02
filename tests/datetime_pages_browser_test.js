'use strict';

const assert = require('assert');
const port = Number(process.argv[2] || 9222);
const baseUrl = String(process.argv[3] || 'http://127.0.0.1:8010').replace(/\/$/, '');
const pages = [
  ['datumsdifferenz', 'difference'], ['tage-zwischen-daten', 'days'], ['datum-addieren-subtrahieren', 'add'],
  ['altersrechner', 'age'], ['kalenderwochen-rechner', 'iso-week'], ['zeitdauer-berechnen', 'duration']
];
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

(async function () {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const target = targets.find((item) => item.type === 'page');
  if (!target) throw new Error('Keine Brave/Chromium-Testseite gefunden.');
  const socket = new WebSocket(target.webSocketDebuggerUrl); const pending = new Map(); const listeners = new Map(); let nextId = 1;
  socket.addEventListener('message', (event) => { const message = JSON.parse(event.data); if (message.id && pending.has(message.id)) { const callback = pending.get(message.id); pending.delete(message.id); if (message.error) callback.reject(new Error(JSON.stringify(message.error))); else callback.resolve(message.result); return; } (listeners.get(message.method) || []).forEach((listener) => listener(message.params)); });
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve); socket.addEventListener('error', reject); });
  function command(method, params = {}) { return new Promise((resolve, reject) => { const id = nextId++; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); }); }
  function once(method, timeout = 15000) { return new Promise((resolve, reject) => { const handler = (params) => { clean(); resolve(params); }; const timer = setTimeout(() => { clean(); reject(new Error(`Browser-Ereignis ${method} blieb aus.`)); }, timeout); function clean() { clearTimeout(timer); listeners.set(method, (listeners.get(method) || []).filter((item) => item !== handler)); } listeners.set(method, [...(listeners.get(method) || []), handler]); }); }
  async function evaluate(expression) { const response = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails)); return response.result.value; }
  async function waitFor(expression, timeout = 15000) { const started = Date.now(); while (Date.now() - started < timeout) { if (await evaluate(expression)) return; await delay(60); } throw new Error(`Wartezeit überschritten: ${expression}`); }
  async function navigate(slug, tool) { await command('Network.setBlockedURLs', { urls: [] }); const loaded = once('Page.loadEventFired'); await command('Page.navigate', { url: `${baseUrl}/tools/datum-zeit/${slug}/` }); await loaded; await waitFor(`document.querySelector('[data-datetime-tool="${tool}"]')?.dataset.initialized === 'true'`); }
  async function navigatePath(pathname) { await command('Network.setBlockedURLs', { urls: [] }); const loaded = once('Page.loadEventFired'); await command('Page.navigate', { url: baseUrl + pathname }); await loaded; await waitFor("document.readyState === 'complete'"); }
  async function setValue(selector, value) { await evaluate(`(() => { const node=document.querySelector(${JSON.stringify(selector)}); node.value=${JSON.stringify(value)}; node.dispatchEvent(new Event('input',{bubbles:true})); node.dispatchEvent(new Event('change',{bubbles:true})); return true; })()`); }
  async function click(action) { await evaluate(`document.querySelector('[data-action="${action}"]').click(); true`); }
  async function calculateOffline(slug, tool, setup, expected) { await navigate(slug, tool); await command('Network.setBlockedURLs', { urls: ['http://*', 'https://*'] }); for (const [selector, value] of setup) await setValue(selector, value); await click('run'); await waitFor("document.querySelector('[data-result-panel]').hidden === false"); const result = await evaluate("document.querySelector('[data-result-value]').textContent"); assert.strictEqual(result, expected, `${slug}: Offline-Ergebnis`); }

  await Promise.all([command('Page.enable'), command('Runtime.enable'), command('Network.enable')]);
  const exceptions = []; listeners.set('Runtime.exceptionThrown', [(params) => exceptions.push(params.exceptionDetails.text || 'Ausnahme')]);
  for (const [slug, tool] of pages) {
    await navigate(slug, tool);
    const shape = await evaluate(`(() => { const root=document.querySelector('[data-datetime-tool="${tool}"]'); const rect=root.getBoundingClientRect(); return { initialized:root.dataset.initialized, visible:rect.width>0&&rect.height>0, form:!!root.querySelector('form'), status:!!root.querySelector('[data-status]'), run:!!root.querySelector('[data-action="run"]'), hidden:root.querySelector('[data-result-panel]').hidden }; })()`);
    assert.deepStrictEqual(shape, { initialized: 'true', visible: true, form: true, status: true, run: true, hidden: true }, `${slug}: reale UI und kompakter Anfangszustand`);
    assert.ok((await evaluate('document.body.textContent')).includes('lokal in deinem Browser'), `${slug}: lokaler Hinweis`);
  }

  await calculateOffline('datumsdifferenz', 'difference', [['[data-start]', '2020-01-01'], ['[data-end]', '2022-03-15']], '2 Jahre, 2 Monate, 14 Tage');
  await calculateOffline('tage-zwischen-daten', 'days', [['[data-start]', '2026-01-01'], ['[data-end]', '2026-01-08']], '7 Tage');
  await calculateOffline('datum-addieren-subtrahieren', 'add', [['[data-date]', '2026-01-31'], ['[data-operation]', 'add'], ['[data-amount]', '1'], ['[data-unit]', 'months']], '28.02.2026');
  await calculateOffline('altersrechner', 'age', [['[data-birth]', '2000-09-02'], ['[data-on]', '2026-09-02']], '26 vollendete Jahre');
  await calculateOffline('kalenderwochen-rechner', 'iso-week', [['[data-mode]', 'date-to-week'], ['[data-date]', '2021-01-01']], '2020-W53');
  await setValue('[data-mode]', 'week-to-range'); await setValue('[data-year]', '2021'); await setValue('[data-week]', '53'); await click('run'); assert.ok((await evaluate("document.querySelector('[data-status]').textContent")).includes('52'), 'ungültige ISO-Woche 53 sichtbar abgewiesen');
  await calculateOffline('zeitdauer-berechnen', 'duration', [['[data-mode]', 'time'], ['[data-start-time]', '08:30'], ['[data-end-time]', '16:15']], '7 Stunden, 45 Minuten');
  await setValue('[data-start-time]', '22:00'); await setValue('[data-end-time]', '06:00'); await evaluate("document.querySelector('[data-next-day]').checked=true"); await click('run'); assert.strictEqual(await evaluate("document.querySelector('[data-result-value]').textContent"), '8 Stunden, 0 Minuten', 'Mitternachtswechsel nur mit expliziter Option');

  for (const width of [320, 375, 390, 430, 768, 1024, 1280, 1440, 1920]) {
    await command('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 768 }); const page = pages[width % pages.length]; await navigate(page[0], page[1]);
    const layout = await evaluate(`(() => { const viewport=document.documentElement.clientWidth; const root=document.querySelector('[data-datetime-tool]'); const controls=[...document.querySelectorAll('input,select,button')]; return { bodyOverflow:document.documentElement.scrollWidth>viewport, scrollWidth:document.documentElement.scrollWidth, viewport, offenders:[...document.querySelectorAll('body *')].filter((node)=>node.getBoundingClientRect().right>viewport+1).slice(0,6).map((node)=>node.tagName+'.'+node.className), rootWidth:root.getBoundingClientRect().width, controlOverflow:controls.some((node)=>node.getBoundingClientRect().right>viewport+1), resultHidden:document.querySelector('[data-result-panel]').hidden }; })()`);
    assert.strictEqual(layout.bodyOverflow, false, `${width}px: kein horizontaler Body-Overflow (${JSON.stringify(layout)})`); assert.ok(layout.rootWidth > 0, `${width}px: Werkzeug sichtbar`); assert.strictEqual(layout.controlOverflow, false, `${width}px: Eingaben und Buttons erreichbar`); assert.strictEqual(layout.resultHidden, true, `${width}px: kein leerer Ergebnisbereich`);
    await navigatePath('/tools/datum-zeit/'); assert.strictEqual(await evaluate('document.documentElement.scrollWidth > document.documentElement.clientWidth'), false, `${width}px: Übersicht ohne horizontalen Overflow`);
  }
  await command('Emulation.clearDeviceMetricsOverride'); assert.deepStrictEqual(exceptions, [], 'keine unbehandelten Browser-Ausnahmen'); console.log('DATETIME-PAGES-BROWSER ERFOLGREICH: 6 reale UIs, Offline-Matrix und 9 Viewports'); socket.close();
}()).catch((error) => { console.error(error); process.exit(1); });
