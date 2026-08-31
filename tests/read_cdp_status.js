'use strict';

(async function () {
  const targets = await (await fetch('http://127.0.0.1:9223/json')).json();
  const target = targets.find(item => item.url.includes('/tests/pdf_runtime_browser_test.html'));
  if (!target) throw new Error('Testseite nicht gefunden');
  const status = await new Promise((resolve, reject) => {
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    socket.addEventListener('open', () => socket.send(JSON.stringify({
      id: 1, method: 'Runtime.evaluate',
      params: { expression: "(() => { const result = document.querySelector('#result'); return result ? result.textContent : 'MISSING RESULT ELEMENT: ' + document.readyState; })()", returnByValue: true }
    })));
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.id === 1) { socket.close(); resolve(message.result.result.value); }
    });
    socket.addEventListener('error', reject);
  });
  console.log(status);
  const version = await (await fetch('http://127.0.0.1:9223/json/version')).json();
  await new Promise((resolve, reject) => {
    const socket = new WebSocket(version.webSocketDebuggerUrl);
    socket.addEventListener('open', () => socket.send(JSON.stringify({ id: 2, method: 'Browser.close' })));
    socket.addEventListener('message', event => { if (JSON.parse(event.data).id === 2) { socket.close(); resolve(); } });
    socket.addEventListener('error', reject);
  });
  if (!String(status).startsWith('PASS ')) process.exitCode = 1;
}()).catch(error => { console.error(error.message); process.exit(1); });
