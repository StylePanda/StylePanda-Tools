'use strict';

const assert = require('assert');

(async function () {
  const targets = await (await fetch('http://127.0.0.1:9224/json')).json();
  const target = targets.find(item => item.url.includes('/tools/pdf/extrahieren/'));
  if (!target) throw new Error('PDF-Tool-Testseite nicht gefunden');
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  const pending = new Map(); let nextId = 1;
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data); if (!message.id || !pending.has(message.id)) return;
    const handlers = pending.get(message.id); pending.delete(message.id);
    if (message.error || message.result.exceptionDetails) handlers.reject(new Error(JSON.stringify(message.error || message.result.exceptionDetails)));
    else handlers.resolve(message.result.result.value);
  });
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve); socket.addEventListener('error', reject); });
  function evaluate(expression, awaitPromise = false) {
    return new Promise((resolve, reject) => {
      const id = nextId++; pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise, returnByValue: true } }));
    });
  }
  async function waitFor(expression, timeout = 30000) {
    const start = Date.now();
    while (Date.now() - start < timeout) { if (await evaluate(expression)) return; await new Promise(resolve => setTimeout(resolve, 250)); }
    throw new Error('Browser-Testzeit überschritten: ' + expression);
  }

  await waitFor("Boolean(window.PDFLib && document.querySelector('.file-input'))");
  await evaluate(`(async()=>{
    const documentPdf=await PDFLib.PDFDocument.create();
    documentPdf.addPage([300,200]).drawText('Browser Seite 1',{x:30,y:100});
    documentPdf.addPage([400,250]).drawText('Browser Seite 2',{x:30,y:100});
    const bytes=await documentPdf.save();
    const transfer=new DataTransfer();
    transfer.items.add(new File([bytes],'browser-test.pdf',{type:'application/pdf'}));
    const input=document.querySelector('.file-input'); input.files=transfer.files;
    input.dispatchEvent(new Event('change',{bubbles:true}));
  })()`, true);
  await waitFor("document.querySelectorAll('.pdf-thumbnail').length===2 && document.querySelector('[data-action=\"process\"]:not(:disabled)')");
  await evaluate("document.querySelector('.pdf-thumbnail-grid').scrollIntoView(); document.querySelector('[data-action=\"select-all\"]').click(); true");
  await waitFor("document.querySelectorAll('.pdf-thumbnail[aria-pressed=\"true\"]').length===2");
  await waitFor("document.querySelectorAll('.page-canvas[width]:not([width=\"0\"])').length>=1");
  await evaluate("document.querySelector('[data-action=\"process\"]').click(); true");
  await waitFor("Boolean(document.querySelector('.pdf-results a[download]'))");
  const outcome = await evaluate(`({
    pages:document.querySelectorAll('.pdf-thumbnail').length,
    selected:document.querySelectorAll('.pdf-thumbnail[aria-pressed="true"]').length,
    rendered:document.querySelectorAll('.page-canvas[width]:not([width="0"])').length,
    filename:document.querySelector('.pdf-results a[download]').download,
    status:document.querySelector('.status-row').textContent,
    error:document.querySelector('.form-error').textContent
  })`);
  assert.deepStrictEqual(outcome.pages, 2);
  assert.deepStrictEqual(outcome.selected, 2);
  assert.ok(outcome.rendered >= 1, 'Mindestens eine echte Miniatur wurde gerendert');
  assert.deepStrictEqual(outcome.filename, 'browser-test-seiten-extrahiert.pdf');
  assert.ok(outcome.status.includes('Download bereit'));
  assert.deepStrictEqual(outcome.error, '');
  console.log(`PDF-APP-BROWSER ERFOLGREICH: ${JSON.stringify(outcome)}`);
  socket.close();
  const version = await (await fetch('http://127.0.0.1:9224/json/version')).json();
  const closeSocket = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { closeSocket.addEventListener('open', resolve); closeSocket.addEventListener('error', reject); });
  closeSocket.send(JSON.stringify({ id: 99, method: 'Browser.close' }));
}()).catch(error => { console.error(error); process.exit(1); });
