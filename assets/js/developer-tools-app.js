(function () {
  'use strict';

  var core = window.StylePandaDeveloperCore;
  var fieldId = 0;

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function append(parent) {
    Array.prototype.slice.call(arguments, 1).forEach(function (child) { if (child) parent.appendChild(child); });
    return parent;
  }

  function field(labelText, control, help) {
    var wrap = element('div', 'tool-field');
    var label = element('label', '', labelText);
    if (!control.id) { fieldId += 1; control.id = 'developer-field-' + fieldId; }
    label.htmlFor = control.id;
    append(wrap, label, control);
    if (help) append(wrap, element('p', 'tool-help', help));
    return wrap;
  }

  function textarea(name, placeholder, readonly) {
    var control = element('textarea', 'tool-textarea developer-textarea');
    control.dataset[name] = '';
    control.placeholder = placeholder || '';
    control.spellcheck = false;
    if (readonly) { control.readOnly = true; control.classList.add('result'); }
    return control;
  }

  function input(type, name, value) {
    var control = element('input', 'tool-input');
    control.type = type;
    control.dataset[name] = '';
    if (value !== undefined) control.value = value;
    return control;
  }

  function select(name, options) {
    var control = element('select', 'tool-select');
    control.dataset[name] = '';
    options.forEach(function (option) {
      var item = element('option', '', option[1]);
      item.value = option[0];
      control.appendChild(item);
    });
    return control;
  }

  function button(label, action, primary) {
    var control = element('button', 'button ' + (primary ? 'button-primary' : 'button-secondary'), label);
    control.type = 'button';
    control.dataset.action = action;
    return control;
  }

  function panel(title) {
    var section = element('section', 'tool-panel');
    if (title) append(section, element('h2', '', title));
    return section;
  }

  function statusNode() {
    var status = element('p', 'status-row');
    status.dataset.status = '';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    return status;
  }

  function setStatus(app, message, isError) {
    var status = app.querySelector('[data-status]');
    status.textContent = message || '';
    status.classList.toggle('is-error', Boolean(isError));
    app.dataset.state = isError ? 'error' : message ? 'success' : 'idle';
    if (isError) app.dataset.errorCode = isError.code || 'error';
    else delete app.dataset.errorCode;
  }

  function reportError(app, error) { setStatus(app, error && error.message ? error.message : 'Die Eingabe konnte nicht verarbeitet werden.', error || true); }

  async function copyText(app, text, label) {
    if (!text) { setStatus(app, 'Es gibt noch kein Ergebnis zum Kopieren.', true); return; }
    try {
      await navigator.clipboard.writeText(text);
      setStatus(app, (label || 'Ergebnis') + ' wurde kopiert.');
    } catch (error) { setStatus(app, 'Kopieren war nicht möglich. Bitte markiere den Text manuell.', true); }
  }

  function actionRow(actions) {
    var row = element('div', 'tool-actions');
    actions.forEach(function (item) { row.appendChild(button(item[0], item[1], item[2])); });
    return row;
  }

  function makeShell(root) {
    var shell = element('form', 'tool-shell developer-tool-app');
    shell.noValidate = true;
    shell.addEventListener('submit', function (event) { event.preventDefault(); });
    root.replaceChildren(shell);
    return shell;
  }

  function resetFields(app) {
    app.querySelectorAll('textarea').forEach(function (node) { node.value = ''; });
    app.querySelectorAll('[data-output], [data-hex], [data-base64]').forEach(function (node) { node.textContent = ''; });
    app.querySelectorAll('[data-result-panel]').forEach(function (node) { node.hidden = true; });
    setStatus(app, '');
  }

  function buildTwoPane(root, labels, placeholders) {
    var app = makeShell(root);
    var layout = element('div', 'tool-layout');
    var source = textarea('input', placeholders[0], false);
    var output = textarea('output', placeholders[1], true);
    append(layout, append(panel(), field(labels[0], source)), append(panel(), field(labels[1], output)));
    append(app, layout);
    return { app: app, source: source, output: output };
  }

  function initJsonFormatter(root) {
    var ui = buildTwoPane(root, ['JSON-Eingabe', 'Formatiertes JSON'], ['JSON hier eingeben …', 'Das formatierte Ergebnis erscheint hier.']);
    var indentation = select('indent', [['2', '2 Leerzeichen'], ['4', '4 Leerzeichen'], ['tab', 'Tabulator']]);
    var options = panel('Formatierung');
    append(options, field('Einrückung', indentation));
    append(ui.app, options, actionRow([['Formatieren & validieren', 'run', true], ['Beispiel einsetzen', 'sample'], ['Ergebnis kopieren', 'copy'], ['Zurücksetzen', 'reset']]), statusNode());
    function run() { try { ui.output.value = core.formatJson(ui.source.value, indentation.value); setStatus(ui.app, 'Gültiges JSON wurde formatiert.'); } catch (error) { ui.output.value = ''; reportError(ui.app, error); } }
    ui.app.addEventListener('click', function (event) {
      var action = event.target.closest('[data-action]'); if (!action) return;
      if (action.dataset.action === 'run') run();
      if (action.dataset.action === 'sample') { ui.source.value = '{"name":"StylePanda","lokal":true,"tools":["JSON","Base64"]}'; run(); }
      if (action.dataset.action === 'copy') copyText(ui.app, ui.output.value, 'Formatiertes JSON');
      if (action.dataset.action === 'reset') resetFields(ui.app);
    });
  }

  function initJsonMinifier(root) {
    var ui = buildTwoPane(root, ['JSON-Eingabe', 'Minimiertes JSON'], ['JSON hier eingeben …', 'Das kompakte Ergebnis erscheint hier.']);
    var stats = element('div', 'stats-grid developer-stats');
    [['source-chars', 'Original: Zeichen'], ['source-bytes', 'Original: UTF-8-Bytes'], ['result-chars', 'Ergebnis: Zeichen'], ['result-bytes', 'Ergebnis: UTF-8-Bytes']].forEach(function (item) { var card = element('div', 'stat-card'); var strong = element('strong', '', '0'); strong.setAttribute('data-' + item[0], ''); append(card, strong, element('span', '', item[1])); stats.appendChild(card); });
    var statsPanel = panel('Größenvergleich'); append(statsPanel, stats);
    append(ui.app, statsPanel, actionRow([['JSON minimieren', 'run', true], ['Ergebnis kopieren', 'copy'], ['Zurücksetzen', 'reset']]), statusNode());
    function updateStats(result) { ui.app.querySelector('[data-source-chars]').textContent = String(ui.source.value.length); ui.app.querySelector('[data-source-bytes]').textContent = String(core.utf8Length(ui.source.value)); ui.app.querySelector('[data-result-chars]').textContent = String(result.length); ui.app.querySelector('[data-result-bytes]').textContent = String(core.utf8Length(result)); }
    ui.app.addEventListener('click', function (event) { var action = event.target.closest('[data-action]'); if (!action) return; try { if (action.dataset.action === 'run') { ui.output.value = core.minifyJson(ui.source.value); updateStats(ui.output.value); setStatus(ui.app, 'Gültiges JSON wurde minimiert.'); } else if (action.dataset.action === 'copy') copyText(ui.app, ui.output.value, 'Minimiertes JSON'); else if (action.dataset.action === 'reset') { resetFields(ui.app); updateStats(''); } } catch (error) { ui.output.value = ''; reportError(ui.app, error); } });
  }

  function initConverter(root, type) {
    var labels = { base64: ['Text oder Base64', 'Ergebnis'], url: ['Text oder URL-Komponente', 'Ergebnis'], html: ['Text oder HTML Entities', 'Ergebnis'] }[type];
    var ui = buildTwoPane(root, labels, ['Eingabe …', 'Ergebnis …']);
    var modes = {
      base64: [['encode', 'Text → Base64'], ['decode', 'Base64 → Text']],
      url: [['encode', 'Text/URL-Komponente kodieren'], ['decode', 'URL-Komponente dekodieren']],
      html: [['encode', 'Text → HTML Entities'], ['decode', 'HTML Entities → Text']]
    };
    var mode = select('mode', modes[type]);
    var options = panel('Modus'); append(options, field('Konvertierungsrichtung', mode));
    append(ui.app, options, actionRow([['Konvertieren', 'run', true], ['Ergebnis kopieren', 'copy'], ['Zurücksetzen', 'reset']]), statusNode());
    function run() {
      try {
        if (type === 'base64') ui.output.value = mode.value === 'encode' ? core.encodeBase64(ui.source.value) : core.decodeBase64(ui.source.value);
        if (type === 'url') ui.output.value = mode.value === 'encode' ? core.encodeUrlComponent(ui.source.value) : core.decodeUrlComponent(ui.source.value);
        if (type === 'html') ui.output.value = mode.value === 'encode' ? core.encodeHtmlEntities(ui.source.value) : core.decodeHtmlEntities(ui.source.value, document);
        setStatus(ui.app, 'Die Konvertierung wurde lokal abgeschlossen.');
      } catch (error) { ui.output.value = ''; reportError(ui.app, error); }
    }
    ui.app.addEventListener('click', function (event) { var action = event.target.closest('[data-action]'); if (!action) return; if (action.dataset.action === 'run') run(); if (action.dataset.action === 'copy') copyText(ui.app, ui.output.value); if (action.dataset.action === 'reset') resetFields(ui.app); });
  }

  function initHash(root) {
    var ui = buildTwoPane(root, ['Text (UTF-8)', 'Hex-Digest'], ['Zu hashenden Text eingeben …', 'Hex-Digest erscheint hier.']);
    var algorithm = select('algorithm', [['SHA-256', 'SHA-256'], ['SHA-384', 'SHA-384'], ['SHA-512', 'SHA-512']]);
    var base64 = textarea('base64', 'Base64-Digest erscheint hier.', true); base64.classList.add('developer-textarea-short');
    var options = panel('Hash-Einstellungen'); append(options, field('Algorithmus', algorithm), field('Base64-Digest', base64, 'Der Eingabetext wird als UTF-8 verarbeitet.'));
    append(ui.app, options, actionRow([['Hash erzeugen', 'run', true], ['Hex kopieren', 'copy-hex'], ['Base64 kopieren', 'copy-base64'], ['Zurücksetzen', 'reset']]), statusNode());
    ui.app.addEventListener('click', async function (event) { var action = event.target.closest('[data-action]'); if (!action) return; try { if (action.dataset.action === 'run') { var result = await core.hashText(ui.source.value, algorithm.value); ui.output.value = result.hex; base64.value = result.base64; setStatus(ui.app, result.algorithm + ' wurde lokal berechnet.'); } else if (action.dataset.action === 'copy-hex') copyText(ui.app, ui.output.value, 'Hex-Digest'); else if (action.dataset.action === 'copy-base64') copyText(ui.app, base64.value, 'Base64-Digest'); else if (action.dataset.action === 'reset') resetFields(ui.app); } catch (error) { reportError(ui.app, error); } });
  }

  function initUuid(root) {
    var app = makeShell(root);
    var count = input('number', 'count', '1'); count.min = '1'; count.max = '100'; count.step = '1';
    var output = textarea('output', 'UUIDs erscheinen hier.', true);
    var inputPanel = panel('UUIDs erzeugen'); append(inputPanel, field('Anzahl (1–100)', count, 'Verwendet ausschließlich kryptografische Browser-Zufälligkeit und keinen pseudozufälligen Ersatz.'));
    var resultPanel = panel('Ergebnis'); append(resultPanel, field('UUID v4', output));
    append(app, inputPanel, resultPanel, actionRow([['UUID erzeugen', 'run', true], ['Alle kopieren', 'copy'], ['Zurücksetzen', 'reset']]), statusNode());
    app.addEventListener('click', function (event) { var action = event.target.closest('[data-action]'); if (!action) return; try { if (action.dataset.action === 'run') { var total = Number(count.value); if (!Number.isInteger(total) || total < 1 || total > 100) throw new Error('Bitte wähle eine Anzahl zwischen 1 und 100.'); output.value = Array.from({ length: total }, function () { return core.generateUuid(); }).join('\n'); setStatus(app, total + (total === 1 ? ' UUID wurde' : ' UUIDs wurden') + ' kryptografisch erzeugt.'); } else if (action.dataset.action === 'copy') copyText(app, output.value, 'UUIDs'); else if (action.dataset.action === 'reset') { resetFields(app); count.value = '1'; } } catch (error) { reportError(app, error); } });
  }

  function initTimestamp(root) {
    var app = makeShell(root);
    var direction = select('direction', [['timestamp', 'Unix-Timestamp → Datum/Uhrzeit'], ['date', 'Datum/Uhrzeit → Unix-Timestamp']]);
    var unit = select('unit', [['seconds', 'Sekunden'], ['milliseconds', 'Millisekunden']]);
    var timestamp = input('text', 'timestamp', '0'); timestamp.inputMode = 'numeric';
    var dateInput = input('datetime-local', 'date'); dateInput.hidden = true;
    var controls = panel('Eingabe'); append(controls, element('div', 'inline-fields'));
    append(controls.firstElementChild, field('Richtung', direction), field('Einheit', unit));
    append(controls, field('Unix-Timestamp', timestamp), field('Lokales Datum mit Uhrzeit', dateInput));
    var result = panel('Ergebnis'); result.dataset.resultPanel = ''; result.hidden = true;
    var list = element('dl', 'developer-result-list');
    [['timestamp-result', 'Unix-Timestamp'], ['local-result', 'Lokale Zeit'], ['utc-result', 'UTC'], ['iso-result', 'ISO 8601']].forEach(function (item) { var row = element('div'); var value = element('dd'); value.setAttribute('data-' + item[0], ''); append(row, element('dt', '', item[1]), value); list.appendChild(row); });
    append(result, list);
    append(app, controls, result, actionRow([['Konvertieren', 'run', true], ['Aktuelle Zeit', 'now'], ['Ergebnis kopieren', 'copy'], ['Zurücksetzen', 'reset']]), statusNode());
    function toggle() { var fromDate = direction.value === 'date'; timestamp.parentElement.hidden = fromDate; dateInput.parentElement.hidden = !fromDate; }
    function run() { try { var converted; if (direction.value === 'timestamp') converted = core.timestampToDate(timestamp.value, unit.value); else { var date = new Date(dateInput.value); var numeric = core.dateToTimestamp(date, unit.value); converted = core.timestampToDate(numeric, unit.value); } app.querySelector('[data-timestamp-result]').textContent = unit.value === 'seconds' ? String(converted.seconds) : String(converted.milliseconds); app.querySelector('[data-local-result]').textContent = converted.date.toLocaleString('de-DE'); app.querySelector('[data-utc-result]').textContent = converted.date.toUTCString(); app.querySelector('[data-iso-result]').textContent = converted.iso; result.hidden = false; setStatus(app, 'Zeitwert wurde mit expliziter Einheit konvertiert.'); } catch (error) { result.hidden = true; reportError(app, error); } }
    direction.addEventListener('change', toggle);
    app.addEventListener('click', function (event) { var action = event.target.closest('[data-action]'); if (!action) return; if (action.dataset.action === 'run') run(); if (action.dataset.action === 'now') { var now = new Date(); if (direction.value === 'timestamp') timestamp.value = String(unit.value === 'seconds' ? Math.trunc(now.getTime() / 1000) : now.getTime()); else { var shifted = new Date(now.getTime() - now.getTimezoneOffset() * 60000); dateInput.value = shifted.toISOString().slice(0, 16); } run(); } if (action.dataset.action === 'copy') copyText(app, Array.from(result.querySelectorAll('div')).map(function (row) { return row.textContent; }).join('\n'), 'Zeitangaben'); if (action.dataset.action === 'reset') { resetFields(app); timestamp.value = '0'; direction.value = 'timestamp'; unit.value = 'seconds'; toggle(); } }); toggle();
  }

  function initRegex(root) {
    var app = makeShell(root);
    var pattern = input('text', 'pattern', ''); pattern.placeholder = 'z. B. (Style)(Panda)';
    var flags = element('fieldset'); append(flags, element('legend', '', 'Flags'));
    var options = element('div', 'regex-flags');
    'gimsuy'.split('').forEach(function (flag) { var label = element('label', 'option'); var checkbox = input('checkbox', 'flag'); checkbox.value = flag; if (flag === 'g') checkbox.checked = true; append(label, checkbox, document.createTextNode(flag)); options.appendChild(label); }); append(flags, options);
    var testText = textarea('input', 'Testtext eingeben …', false);
    var inputPanel = panel('Regulärer Ausdruck'); append(inputPanel, field('Muster (ohne /…/)', pattern), flags, field('Testtext', testText, 'Maximal 50.000 Zeichen und 1.000 Treffer pro Lauf. Offensichtlich riskante verschachtelte Wiederholungen werden abgewiesen; ein vollständiger ReDoS-Schutz kann nicht garantiert werden.'));
    var resultPanel = panel('Treffer'); resultPanel.dataset.resultPanel = ''; resultPanel.hidden = true;
    var summary = element('p', 'compact-counters'); summary.dataset.matchSummary = '';
    var preview = element('pre', 'developer-code-output regex-preview'); preview.dataset.highlight = ''; preview.setAttribute('aria-label', 'Sicher gerenderte Treffer-Vorschau');
    var matchList = element('ol', 'regex-match-list'); matchList.dataset.matchList = '';
    append(resultPanel, summary, preview, matchList);
    append(app, inputPanel, resultPanel, actionRow([['Regex testen', 'run', true], ['Zurücksetzen', 'reset']]), statusNode());
    function flagsValue() { return Array.from(app.querySelectorAll('[data-flag]:checked')).map(function (node) { return node.value; }).join(''); }
    function renderHighlight(text, matches) { preview.replaceChildren(); var cursor = 0; matches.forEach(function (match) { if (match.start < cursor) return; preview.appendChild(document.createTextNode(text.slice(cursor, match.start))); var mark = element('mark', '', match.value || ''); if (!match.value) mark.setAttribute('aria-label', 'Leerer Treffer'); preview.appendChild(mark); cursor = match.end; }); preview.appendChild(document.createTextNode(text.slice(cursor))); }
    function run() { try { var outcome = core.testRegex(pattern.value, flagsValue(), testText.value); summary.textContent = outcome.matches.length + (outcome.matches.length === 1 ? ' Treffer' : ' Treffer') + (outcome.truncated ? ' (Liste begrenzt)' : ''); matchList.replaceChildren(); outcome.matches.forEach(function (match, index) { var item = element('li'); var heading = element('strong', '', '#' + (index + 1) + ' · Position ' + match.start + '–' + match.end); append(item, heading, element('code', '', match.value || '(leerer Treffer)')); if (match.captures.length) append(item, element('span', 'regex-groups', 'Gruppen: ' + match.captures.map(function (value) { return value === undefined ? '(nicht gesetzt)' : value; }).join(' | '))); if (match.groups) append(item, element('span', 'regex-groups', 'Benannt: ' + Object.keys(match.groups).map(function (key) { return key + '=' + match.groups[key]; }).join(' | '))); matchList.appendChild(item); }); renderHighlight(testText.value, outcome.matches); resultPanel.hidden = false; setStatus(app, 'Regex wurde einmal kontrolliert ausgeführt.'); } catch (error) { resultPanel.hidden = true; reportError(app, error); } }
    app.addEventListener('click', function (event) { var action = event.target.closest('[data-action]'); if (!action) return; if (action.dataset.action === 'run') run(); if (action.dataset.action === 'reset') resetFields(app); });
  }

  function initJwt(root) {
    var app = makeShell(root);
    var token = textarea('input', 'JWT einfügen …', false); token.classList.add('developer-token-input');
    var inputPanel = panel('JWT'); append(inputPanel, field('Token', token), element('div', 'notice warning-notice'));
    append(inputPanel.lastElementChild, element('span', '', '!'), element('p', '', 'Die Signatur wird nicht überprüft. Die angezeigten Inhalte können manipuliert sein.'));
    var resultPanel = panel('Dekodierte Inhalte'); resultPanel.dataset.resultPanel = ''; resultPanel.hidden = true;
    var panes = element('div', 'tool-layout'); var header = textarea('header', '', true); var payload = textarea('payload', '', true); append(panes, field('Header', header), field('Payload', payload));
    var claims = element('dl', 'developer-result-list'); claims.dataset.claims = '';
    append(resultPanel, panes, element('h3', 'developer-subheading', 'Häufige Claims'), claims);
    append(app, inputPanel, resultPanel, actionRow([['JWT dekodieren', 'run', true], ['Header kopieren', 'copy-header'], ['Payload kopieren', 'copy-payload'], ['Zurücksetzen', 'reset']]), statusNode());
    function run() { try { var decoded = core.decodeJwt(token.value); header.value = decoded.headerText; payload.value = decoded.payloadText; claims.replaceChildren(); ['iss', 'sub', 'aud', 'exp', 'nbf', 'iat'].forEach(function (name) { if (!Object.prototype.hasOwnProperty.call(decoded.payload, name)) return; var row = element('div'); var value = decoded.payload[name]; var rendered = typeof value === 'string' ? value : JSON.stringify(value); var date = ['exp', 'nbf', 'iat'].indexOf(name) >= 0 ? core.claimDate(value) : null; if (date) rendered += ' · ' + date; if (name === 'exp' && typeof value === 'number') rendered += value * 1000 < Date.now() ? ' · abgelaufen' : ' · noch nicht abgelaufen'; append(row, element('dt', '', name), element('dd', '', rendered)); claims.appendChild(row); }); if (!claims.children.length) append(claims, element('div', 'developer-empty', 'Keine der häufigen Claims vorhanden.')); resultPanel.hidden = false; setStatus(app, 'Header und Payload wurden dekodiert; die Signatur wurde nicht geprüft.'); } catch (error) { resultPanel.hidden = true; reportError(app, error); } }
    app.addEventListener('click', function (event) { var action = event.target.closest('[data-action]'); if (!action) return; if (action.dataset.action === 'run') run(); if (action.dataset.action === 'copy-header') copyText(app, header.value, 'JWT-Header'); if (action.dataset.action === 'copy-payload') copyText(app, payload.value, 'JWT-Payload'); if (action.dataset.action === 'reset') resetFields(app); });
  }

  function initQr(root) {
    var app = makeShell(root);
    var value = textarea('input', 'Text oder URL direkt in den QR-Code einbetten …', false); value.classList.add('developer-textarea-short');
    var size = select('size', [['256', '256 × 256 px'], ['128', '128 × 128 px'], ['384', '384 × 384 px'], ['512', '512 × 512 px'], ['1024', '1024 × 1024 px']]);
    var level = select('level', [['M', 'M · mittel'], ['L', 'L · niedrig'], ['Q', 'Q · hoch'], ['H', 'H · sehr hoch']]);
    var controls = panel('QR-Inhalt'); append(controls, field('Text oder URL', value), element('div', 'inline-fields')); append(controls.lastElementChild, field('Bildgröße', size), field('Fehlerkorrektur', level));
    var result = panel('QR-Code'); result.dataset.resultPanel = ''; result.hidden = true; var frame = element('div', 'qr-preview'); var canvas = element('canvas'); canvas.dataset.qrCanvas = ''; append(frame, canvas); append(result, frame, element('p', 'tool-help', 'Der eingegebene Inhalt wird direkt kodiert. Es wird kein Weiterleitungs- oder Tracking-Link erzeugt.'));
    append(app, controls, result, actionRow([['QR-Code erzeugen', 'run', true], ['PNG herunterladen', 'download'], ['Zurücksetzen', 'reset']]), statusNode());
    function run() { try { if (!value.value) throw new Error('Bitte gib Text oder eine URL ein.'); if (typeof window.qrcode !== 'function') throw new Error('Die lokale QR-Bibliothek konnte nicht geladen werden.'); var code = window.qrcode(0, level.value); code.addData(value.value); code.make(); var modules = code.getModuleCount(); var target = Number(size.value); var quiet = 4; var cells = modules + quiet * 2; canvas.width = target; canvas.height = target; var context = canvas.getContext('2d'); context.fillStyle = '#ffffff'; context.fillRect(0, 0, target, target); context.fillStyle = '#090a0f'; for (var row = 0; row < modules; row += 1) for (var column = 0; column < modules; column += 1) if (code.isDark(row, column)) { var left = Math.floor((column + quiet) * target / cells); var top = Math.floor((row + quiet) * target / cells); var right = Math.ceil((column + quiet + 1) * target / cells); var bottom = Math.ceil((row + quiet + 1) * target / cells); context.fillRect(left, top, right - left, bottom - top); } result.hidden = false; app.dataset.qrReady = 'true'; app.dataset.qrSize = String(target); setStatus(app, 'QR-Code wurde vollständig lokal erzeugt.'); } catch (error) { result.hidden = true; delete app.dataset.qrReady; reportError(app, error); } }
    function download() { if (app.dataset.qrReady !== 'true') { setStatus(app, 'Erzeuge zuerst einen QR-Code.', true); return; } canvas.toBlob(function (blob) { if (!blob) { setStatus(app, 'Das PNG konnte nicht erzeugt werden.', true); return; } var url = URL.createObjectURL(blob); var link = element('a'); link.href = url; link.download = 'stylepanda-qr-code.png'; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url); app.dataset.downloadMime = blob.type; app.dataset.downloadSize = String(blob.size); setStatus(app, 'QR-Code-PNG wurde erstellt.'); }, 'image/png'); }
    app.addEventListener('click', function (event) { var action = event.target.closest('[data-action]'); if (!action) return; if (action.dataset.action === 'run') run(); if (action.dataset.action === 'download') download(); if (action.dataset.action === 'reset') { resetFields(app); result.hidden = true; delete app.dataset.qrReady; } });
  }

  var initializers = {
    'json-format': initJsonFormatter,
    'json-minify': initJsonMinifier,
    base64: function (root) { initConverter(root, 'base64'); },
    url: function (root) { initConverter(root, 'url'); },
    'html-entities': function (root) { initConverter(root, 'html'); },
    hash: initHash,
    uuid: initUuid,
    timestamp: initTimestamp,
    regex: initRegex,
    jwt: initJwt,
    qr: initQr
  };

  function initialize() {
    if (!core) return;
    document.querySelectorAll('[data-developer-tool]').forEach(function (root) {
      var initializer = initializers[root.dataset.developerTool];
      if (initializer) { initializer(root); root.dataset.initialized = 'true'; }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize);
  else initialize();
}());
