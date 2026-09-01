(function () {
  'use strict';

  var core = window.StylePandaImageCore;
  var root = document.querySelector('[data-image-tool]');
  if (!root) return;

  var tool = root.dataset.imageTool;
  var objectUrls = new Set();
  var state = { file: null, bytes: null, mime: '', image: null, sourceUrl: '', resultUrl: '', resultBlob: null, rotation: 0, flipX: false, flipY: false, crop: null, batch: [] };

  function query(selector, parent) { return (parent || root).querySelector(selector); }
  function queryAll(selector, parent) { return Array.prototype.slice.call((parent || root).querySelectorAll(selector)); }
  function setHidden(element, hidden) { if (element) element.hidden = hidden; }
  function setStatus(message, error) { var element = query('[data-status]'); if (!element) return; element.textContent = message || ''; element.classList.toggle('is-error', Boolean(error)); }
  function makeUrl(blob) { var url = URL.createObjectURL(blob); objectUrls.add(url); return url; }
  function revoke(url) { if (url && objectUrls.has(url)) { URL.revokeObjectURL(url); objectUrls.delete(url); } }
  function releaseAll() { objectUrls.forEach(function (url) { URL.revokeObjectURL(url); }); objectUrls.clear(); }
  function nextFrame() { return new Promise(function (resolve) { requestAnimationFrame(function () { resolve(); }); }); }
  function imageWidth(image) { return Number(image && (image.naturalWidth || image.width)) || 0; }
  function imageHeight(image) { return Number(image && (image.naturalHeight || image.height)) || 0; }
  function decodeError(code, message, cause) { var error = new Error(message); error.code = code; error.cause = cause; return error; }
  function readAsDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.addEventListener('load', function () { resolve(String(reader.result || '')); });
      reader.addEventListener('error', function () { reject(decodeError('file_read_failed', 'Die Bilddatei konnte nicht lokal gelesen werden.', reader.error)); });
      reader.readAsDataURL(file);
    });
  }
  async function decodeWithImageElement(file) {
    var image = new Image(); image.decoding = 'async'; var loaded = false;
    var loadPromise = new Promise(function (resolve, reject) {
      image.addEventListener('load', function () { loaded = true; resolve(); }, { once: true });
      image.addEventListener('error', function (event) { reject(decodeError('browser_decode_failed', 'Das Bild konnte vom Browser nicht dekodiert werden.', event)); }, { once: true });
    });
    image.src = await readAsDataUrl(file);
    if (typeof image.decode === 'function') {
      try { await image.decode(); } catch (error) { if (!loaded) await loadPromise; }
    } else await loadPromise;
    if (!loaded && !image.complete) await loadPromise;
    return image;
  }
  function previewDataUrl(source) {
    var width = imageWidth(source); var height = imageHeight(source); var scale = Math.min(1, 1200 / width, 800 / height);
    var canvas = createCanvas(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)));
    canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
    var url = canvas.toDataURL('image/png'); canvas.width = canvas.height = 1; return url;
  }
  function canvasBlob(canvas, mime, quality) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (!blob || blob.type !== mime) reject(new Error('Der Browser kann das gewählte Ausgabeformat nicht zuverlässig erzeugen.'));
        else resolve(blob);
      }, mime, quality);
    });
  }
  function supportsEncoding(mime) {
    if (mime === 'image/png' || mime === 'image/jpeg') return true;
    try { return document.createElement('canvas').toDataURL(mime).startsWith('data:' + mime); } catch (error) { return false; }
  }
  function extension(mime) { return core.EXTENSION[mime] || 'png'; }
  function download(blob, filename) {
    var url = makeUrl(blob); var anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; document.body.appendChild(anchor); anchor.click(); anchor.remove();
    setTimeout(function () { revoke(url); }, 1000);
  }
  function createCanvas(width, height) {
    var error = core.canvasError(width, height); if (error) throw new Error(error);
    var canvas = document.createElement('canvas'); canvas.width = Math.round(width); canvas.height = Math.round(height); return canvas;
  }
  function drawImage(width, height, options) {
    var canvas = createCanvas(width, height); var context = canvas.getContext('2d', { alpha: true });
    if (!context) throw new Error('Canvas ist in diesem Browser nicht verfügbar.');
    if (options && options.background) { context.fillStyle = options.background; context.fillRect(0, 0, canvas.width, canvas.height); }
    if (options && options.source) context.drawImage(state.image, options.source.x, options.source.y, options.source.width, options.source.height, 0, 0, canvas.width, canvas.height);
    else context.drawImage(state.image, 0, 0, canvas.width, canvas.height);
    return canvas;
  }
  function outputName(suffix, mime) { return core.safeBaseName(state.file && state.file.name) + '-' + suffix + '.' + extension(mime); }
  function setResult(blob, filename, canvas) {
    revoke(state.resultUrl); state.resultBlob = blob; state.resultUrl = '';
    var preview = query('[data-result-preview]'); if (preview && canvas) { preview.src = previewDataUrl(canvas); preview.alt = 'Vorschau des verarbeiteten Bildes'; }
    var button = query('[data-download]'); if (button) { button.disabled = false; button.dataset.filename = filename; }
    setHidden(query('[data-result-box]'), false);
    var size = query('[data-result-size]'); if (size) size.textContent = core.formatBytes(blob.size);
    var dimensions = query('[data-result-dimensions]'); if (dimensions && canvas) dimensions.textContent = canvas.width + ' × ' + canvas.height + ' px';
    var saved = query('[data-saved]'); if (saved) { var percentage = core.savedPercent(state.file.size, blob.size); saved.textContent = (percentage >= 0 ? percentage + ' % kleiner' : Math.abs(percentage) + ' % größer'); }
    root.dataset.resultMime = blob.type;
    root.dataset.resultWidth = canvas ? String(canvas.width) : '';
    root.dataset.resultHeight = canvas ? String(canvas.height) : '';
    root.dataset.resultSize = String(blob.size);
  }
  function clearResult() { revoke(state.resultUrl); state.resultUrl = ''; state.resultBlob = null; var button = query('[data-download]'); if (button) button.disabled = true; setHidden(query('[data-result-box]'), true); }

  async function decodeFile(file) {
    if (!(file instanceof Blob) || typeof file.arrayBuffer !== 'function') throw decodeError('invalid_file', 'Die ausgewählte Datei konnte nicht als lokale Bilddatei gelesen werden.');
    var buffer;
    try { buffer = await file.arrayBuffer(); } catch (error) { throw decodeError('file_read_failed', 'Die Bilddatei konnte nicht lokal gelesen werden.', error); }
    var bytes = new Uint8Array(buffer); var validation = core.validateImageFile(file, bytes);
    if (!validation.ok) throw decodeError(validation.code, validation.error);
    var image = null; var method = '';
    if (typeof window.createImageBitmap === 'function') {
      try { image = await window.createImageBitmap(file, { imageOrientation: 'from-image', colorSpaceConversion: 'none' }); method = 'createImageBitmap'; } catch (bitmapError) {
        try { image = await decodeWithImageElement(file); method = 'image-data-url-fallback'; } catch (imageError) { throw decodeError('browser_decode_failed', 'Das Bild konnte nicht gelesen werden. Der Browser hat die gültige Bilddatei nicht dekodiert.', { bitmap: bitmapError, image: imageError }); }
      }
    } else {
      try { image = await decodeWithImageElement(file); method = 'image-data-url-fallback'; } catch (error) { throw decodeError('browser_decode_failed', 'Das Bild konnte nicht gelesen werden. Der Browser hat die gültige Bilddatei nicht dekodiert.', error); }
    }
    var width = imageWidth(image); var height = imageHeight(image);
    if (!width || !height) { if (image && typeof image.close === 'function') image.close(); throw decodeError('invalid_dimensions', 'Das Bild besitzt keine gültigen Abmessungen.'); }
    try { var probe = createCanvas(1, 1); var probeContext = probe.getContext('2d', { willReadFrequently: true }); probeContext.drawImage(image, 0, 0, 1, 1); var pixel = Array.prototype.slice.call(probeContext.getImageData(0, 0, 1, 1).data); probe.width = probe.height = 1; } catch (error) { if (image && typeof image.close === 'function') image.close(); throw decodeError('canvas_decode_failed', 'Das dekodierte Bild konnte nicht über Canvas verarbeitet werden.', error); }
    return { file: file, bytes: buffer, mime: validation.mime, url: previewDataUrl(image), image: image, method: method, pixel: pixel };
  }
  function adopt(decoded) {
    if (state.image && typeof state.image.close === 'function') state.image.close(); revoke(state.sourceUrl); clearResult(); state.file = decoded.file; state.bytes = decoded.bytes; state.mime = decoded.mime; state.sourceUrl = decoded.url; state.image = decoded.image; state.rotation = 0; state.flipX = false; state.flipY = false;
    var preview = query('[data-source-preview]'); if (preview) { preview.src = state.sourceUrl; preview.alt = 'Vorschau von ' + state.file.name; }
    queryAll('[data-file-name]').forEach(function (element) { element.textContent = state.file.name; });
    queryAll('[data-original-size]').forEach(function (element) { element.textContent = core.formatBytes(state.file.size); });
    queryAll('[data-original-dimensions]').forEach(function (element) { element.textContent = imageWidth(state.image) + ' × ' + imageHeight(state.image) + ' px'; });
    root.dataset.sourceWidth = String(imageWidth(state.image)); root.dataset.sourceHeight = String(imageHeight(state.image)); root.dataset.sourceMime = decoded.mime; root.dataset.decodeMethod = decoded.method; root.dataset.decodePixel = decoded.pixel.join(','); root.dataset.lastErrorCode = '';
    setHidden(query('[data-workspace]'), false); setHidden(query('[data-empty]'), true); setStatus('Bild erfolgreich geladen.', false);
  }
  async function handleSingle(file) {
    if (!file) return;
    setStatus('Bild wird lokal geladen …', false);
    try { adopt(await decodeFile(file)); onLoaded(); } catch (error) { root.dataset.lastErrorCode = error.code || 'unknown_error'; setStatus(error.message, true); }
  }
  function bindDropZone(multiple, handler) {
    var zone = query('.file-drop-zone'); var input = query('.file-input');
    input.addEventListener('change', function () { handler(multiple ? Array.prototype.slice.call(input.files) : input.files[0]); });
    ['dragenter', 'dragover'].forEach(function (type) { zone.addEventListener(type, function (event) { event.preventDefault(); zone.classList.add('is-dragging'); }); });
    ['dragleave', 'drop'].forEach(function (type) { zone.addEventListener(type, function (event) { event.preventDefault(); zone.classList.remove('is-dragging'); }); });
    zone.addEventListener('drop', function (event) { var files = Array.prototype.slice.call(event.dataTransfer.files || []); handler(multiple ? files : files[0]); });
  }
  function resetSingle() {
    (state.favicons || []).forEach(function (item) { revoke(item.url); }); state.favicons = [];
    revoke(state.sourceUrl); clearResult(); if (state.image && typeof state.image.close === 'function') state.image.close(); state.file = null; state.bytes = null; state.image = null; state.sourceUrl = ''; query('.file-input').value = ''; setHidden(query('[data-workspace]'), true); setHidden(query('[data-empty]'), false); setStatus('', false);
  }
  function qualityValue() { var input = query('[data-quality]'); return input ? Number(input.value) / 100 : .82; }
  function chosenMime() { var select = query('[data-format]'); return select ? select.value : state.mime; }
  function syncQuality() {
    var mime = chosenMime(); var wrap = query('[data-quality-wrap]'); if (wrap) setHidden(wrap, mime === 'image/png');
    var output = query('[data-format-note]'); if (output) output.textContent = mime === 'image/png' ? 'PNG wird verlustfrei exportiert; dafür gibt es keinen verlustbehafteten Qualitätsregler.' : 'JPEG/WebP unterstützen eine verlustbehaftete Qualitätssteuerung.';
  }
  function fillFormatOptions(select, includeOriginal) {
    if (includeOriginal && supportsEncoding(state.mime)) {
      var original = document.createElement('option'); original.value = state.mime; original.textContent = 'Originalformat (' + extension(state.mime).toUpperCase() + ')'; select.appendChild(original);
    }
    [['image/jpeg', 'JPEG'], ['image/png', 'PNG'], ['image/webp', 'WebP']].forEach(function (entry) {
      if ((!includeOriginal || entry[0] !== state.mime) && supportsEncoding(entry[0])) { var option = document.createElement('option'); option.value = entry[0]; option.textContent = entry[1]; select.appendChild(option); }
    });
  }
  function renderShell(controls, extra) {
    root.textContent = '';
    root.insertAdjacentHTML('beforeend', '<div class="tool-shell image-tool-app"><section class="tool-panel" data-empty><h2>Bild auswählen</h2><label class="file-drop-zone"><strong>Bild hier ablegen</strong><span>oder über die Dateiauswahl öffnen · JPEG, PNG oder WebP</span><input class="file-input" type="file" accept="image/jpeg,image/png,image/webp"></label></section><p class="status-row" data-status role="status" aria-live="polite"></p><div data-workspace hidden><div class="image-work-grid"><section class="tool-panel"><h2>Original</h2><div class="image-preview checkerboard"><img data-source-preview alt=""></div><dl class="image-facts"><div><dt>Datei</dt><dd data-file-name></dd></div><div><dt>Größe</dt><dd data-original-size></dd></div><div><dt>Abmessungen</dt><dd data-original-dimensions></dd></div></dl></section><section class="tool-panel image-controls"><h2>Einstellungen</h2>' + controls + '<div class="tool-actions"><button class="button button-primary" type="button" data-process>Verarbeiten</button><button class="button button-secondary" type="button" data-reset>Bild entfernen</button></div></section></div>' + (extra || '<section class="tool-panel image-result" data-result-box hidden><div class="image-result-heading"><div><p class="eyebrow">Ergebnis</p><h2>Bereit zum Herunterladen</h2></div><button class="button button-primary" type="button" data-download disabled>Ergebnis herunterladen</button></div><div class="image-result-grid"><div class="image-preview checkerboard"><img data-result-preview alt=""></div><div class="stats-grid"><div class="stat-card"><strong data-result-size>–</strong><span>Dateigröße</span></div><div class="stat-card"><strong data-result-dimensions>–</strong><span>Abmessungen</span></div><div class="stat-card"><strong data-saved>–</strong><span>Vergleich</span></div></div></div></section>') + '</div></div>');
    bindDropZone(false, handleSingle); query('[data-reset]').addEventListener('click', resetSingle);
    var downloadButton = query('[data-download]'); if (downloadButton) downloadButton.addEventListener('click', function () { if (state.resultBlob) download(state.resultBlob, downloadButton.dataset.filename); });
  }

  function onLoaded() {
    if (tool === 'compress') setupCompressLoaded();
    if (tool === 'resize') setupResizeLoaded();
    if (tool === 'crop') setupCropLoaded();
    if (tool === 'rotate') renderTransformPreview();
    if (tool === 'convert' || tool === 'remove-metadata') setupFormatsLoaded();
    if (tool === 'metadata') showMetadata();
    if (tool === 'color') setupColorLoaded();
  }

  function initCompress() {
    renderShell('<div class="tool-field"><label for="output-format">Ausgabeformat</label><select class="tool-select" id="output-format" data-format></select></div><div class="tool-field" data-quality-wrap><label for="quality">Qualität: <output data-quality-output>82 %</output></label><input class="image-range" id="quality" data-quality type="range" min="30" max="95" value="82"></div><p class="tool-help" data-format-note></p>');
    query('[data-format]').addEventListener('change', syncQuality); query('[data-quality]').addEventListener('input', function () { query('[data-quality-output]').textContent = this.value + ' %'; });
    query('[data-process]').addEventListener('click', async function () { try { setStatus('Bild wird lokal komprimiert …'); var canvas = drawImage(imageWidth(state.image), imageHeight(state.image)); var mime = chosenMime(); var blob = await canvasBlob(canvas, mime, mime === 'image/png' ? undefined : qualityValue()); setResult(blob, outputName('komprimiert', mime), canvas); canvas.width = canvas.height = 1; setStatus('Komprimierung abgeschlossen.'); } catch (error) { setStatus(error.message, true); } });
  }
  function setupCompressLoaded() { var select = query('[data-format]'); select.textContent = ''; var preferred = state.mime === 'image/png' && supportsEncoding('image/webp') ? 'image/webp' : (state.mime === 'image/png' ? 'image/jpeg' : state.mime); fillFormatOptions(select, false); select.value = preferred; syncQuality(); }

  function initResize() {
    renderShell('<div class="inline-fields"><div class="tool-field"><label for="width">Breite (px)</label><input class="tool-input" id="width" data-width type="number" min="1" max="16384"></div><div class="tool-field"><label for="height">Höhe (px)</label><input class="tool-input" id="height" data-height type="number" min="1" max="16384"></div></div><label class="option"><input type="checkbox" data-aspect checked> Seitenverhältnis beibehalten</label><div class="tool-field"><label for="percentage">Alternativ prozentual skalieren</label><div class="range-with-value"><input class="image-range" id="percentage" data-percentage type="range" min="5" max="200" value="100"><output data-percentage-output>100 %</output></div></div><div class="tool-field"><label for="resize-format">Ausgabeformat</label><select class="tool-select" id="resize-format" data-format></select></div>');
    ['width', 'height'].forEach(function (name) { query('[data-' + name + ']').addEventListener('input', function () { if (!state.image || !query('[data-aspect]').checked) return; var dimensions = core.aspectDimensions(imageWidth(state.image), imageHeight(state.image), name, this.value); if (dimensions) { query('[data-width]').value = dimensions.width; query('[data-height]').value = dimensions.height; query('[data-percentage]').value = Math.round(dimensions.width / imageWidth(state.image) * 100); query('[data-percentage-output]').textContent = query('[data-percentage]').value + ' %'; } }); });
    query('[data-percentage]').addEventListener('input', function () { if (!state.image) return; var percentage = Number(this.value); query('[data-percentage-output]').textContent = percentage + ' %'; query('[data-width]').value = Math.max(1, Math.round(imageWidth(state.image) * percentage / 100)); query('[data-height]').value = Math.max(1, Math.round(imageHeight(state.image) * percentage / 100)); });
    query('[data-process]').addEventListener('click', async function () { try { var width = Number(query('[data-width]').value); var height = Number(query('[data-height]').value); var error = core.canvasError(width, height); if (error) throw new Error(error); setStatus('Neue Bildgröße wird lokal berechnet …'); var canvas = drawImage(width, height); var mime = chosenMime(); var blob = await canvasBlob(canvas, mime, mime === 'image/png' ? undefined : .9); setResult(blob, outputName('skaliert-' + canvas.width + 'x' + canvas.height, mime), canvas); setStatus('Bildgröße wurde geändert.'); canvas.width = canvas.height = 1; } catch (error) { setStatus(error.message, true); } });
  }
  function setupResizeLoaded() { query('[data-width]').value = imageWidth(state.image); query('[data-height]').value = imageHeight(state.image); query('[data-percentage]').value = 100; query('[data-percentage-output]').textContent = '100 %'; var select = query('[data-format]'); select.textContent = ''; fillFormatOptions(select, true); }

  function initCrop() {
    var extra = '<section class="tool-panel crop-panel"><h2>Zuschneidebereich</h2><p class="tool-help">Ziehe den Rahmen oder den Griff. Die Zahlenfelder lassen sich auch per Tastatur bedienen.</p><div class="crop-stage checkerboard" data-crop-stage><canvas data-crop-canvas></canvas><div class="crop-selection" data-crop-selection tabindex="0" aria-label="Zuschneidebereich verschieben"><span data-crop-handle aria-hidden="true"></span></div></div><div class="crop-fields"><label>X <input class="tool-input" data-crop-x type="number" min="0"></label><label>Y <input class="tool-input" data-crop-y type="number" min="0"></label><label>Breite <input class="tool-input" data-crop-width type="number" min="1"></label><label>Höhe <input class="tool-input" data-crop-height type="number" min="1"></label></div></section><section class="tool-panel image-result" data-result-box hidden><div class="image-result-heading"><h2>Zugeschnittenes Bild</h2><button class="button button-primary" type="button" data-download disabled>Zuschnitt herunterladen</button></div><div class="image-preview checkerboard"><img data-result-preview alt=""></div><p class="tool-help"><span data-result-dimensions></span> · <span data-result-size></span></p></section>';
    renderShell('<fieldset><legend>Seitenverhältnis</legend><div class="ratio-buttons" data-ratios><button class="button button-secondary is-active" type="button" data-ratio="free">Frei</button><button class="button button-secondary" type="button" data-ratio="1">1:1</button><button class="button button-secondary" type="button" data-ratio="1.333333">4:3</button><button class="button button-secondary" type="button" data-ratio="1.5">3:2</button><button class="button button-secondary" type="button" data-ratio="1.777778">16:9</button></div></fieldset>', extra);
    queryAll('[data-ratio]').forEach(function (button) { button.addEventListener('click', function () { queryAll('[data-ratio]').forEach(function (item) { item.classList.remove('is-active'); }); button.classList.add('is-active'); state.crop.ratio = button.dataset.ratio === 'free' ? null : Number(button.dataset.ratio); applyCropRatio(); updateCropUI(); }); });
    queryAll('[data-crop-x],[data-crop-y],[data-crop-width],[data-crop-height]').forEach(function (input) { input.addEventListener('input', cropFromFields); });
    bindCropPointers(); query('[data-process]').addEventListener('click', processCrop);
  }
  function setupCropLoaded() {
    var sourceWidth = imageWidth(state.image); var sourceHeight = imageHeight(state.image); var canvas = query('[data-crop-canvas]'); var scale = Math.min(1, 900 / sourceWidth, 620 / sourceHeight); canvas.width = Math.max(1, Math.round(sourceWidth * scale)); canvas.height = Math.max(1, Math.round(sourceHeight * scale)); canvas.getContext('2d').drawImage(state.image, 0, 0, canvas.width, canvas.height);
    state.crop = { x: 0, y: 0, width: sourceWidth, height: sourceHeight, ratio: null, previewScaleX: canvas.width / sourceWidth, previewScaleY: canvas.height / sourceHeight }; updateCropUI();
  }
  function applyCropRatio() { if (!state.crop || !state.crop.ratio) return; var ratio = state.crop.ratio; var width = state.crop.width; var height = width / ratio; if (height > imageHeight(state.image) - state.crop.y) { height = imageHeight(state.image) - state.crop.y; width = height * ratio; } state.crop.width = Math.max(1, width); state.crop.height = Math.max(1, height); }
  function cropFromFields() { if (!state.crop) return; state.crop.x = core.clamp(Number(query('[data-crop-x]').value) || 0, 0, imageWidth(state.image) - 1); state.crop.y = core.clamp(Number(query('[data-crop-y]').value) || 0, 0, imageHeight(state.image) - 1); state.crop.width = core.clamp(Number(query('[data-crop-width]').value) || 1, 1, imageWidth(state.image) - state.crop.x); state.crop.height = core.clamp(Number(query('[data-crop-height]').value) || 1, 1, imageHeight(state.image) - state.crop.y); applyCropRatio(); updateCropUI(); }
  function updateCropUI() { if (!state.crop) return; var selection = query('[data-crop-selection]'); selection.style.left = (state.crop.x / imageWidth(state.image) * 100) + '%'; selection.style.top = (state.crop.y / imageHeight(state.image) * 100) + '%'; selection.style.width = (state.crop.width / imageWidth(state.image) * 100) + '%'; selection.style.height = (state.crop.height / imageHeight(state.image) * 100) + '%'; [['x','x'],['y','y'],['width','width'],['height','height']].forEach(function (pair) { query('[data-crop-' + pair[0] + ']').value = Math.round(state.crop[pair[1]]); }); }
  function bindCropPointers() {
    var selection = query('[data-crop-selection]'); var active = null;
    selection.addEventListener('pointerdown', function (event) { if (!state.crop) return; event.preventDefault(); selection.setPointerCapture(event.pointerId); active = { resize: event.target.hasAttribute('data-crop-handle'), x: event.clientX, y: event.clientY, crop: Object.assign({}, state.crop) }; });
    selection.addEventListener('pointermove', function (event) { if (!active) return; var stageRect = query('[data-crop-stage]').getBoundingClientRect(); var dx = (event.clientX - active.x) * imageWidth(state.image) / stageRect.width; var dy = (event.clientY - active.y) * imageHeight(state.image) / stageRect.height; if (active.resize) { state.crop.width = core.clamp(active.crop.width + dx, 1, imageWidth(state.image) - state.crop.x); state.crop.height = core.clamp(active.crop.height + dy, 1, imageHeight(state.image) - state.crop.y); applyCropRatio(); } else { state.crop.x = core.clamp(active.crop.x + dx, 0, imageWidth(state.image) - state.crop.width); state.crop.y = core.clamp(active.crop.y + dy, 0, imageHeight(state.image) - state.crop.height); } updateCropUI(); });
    selection.addEventListener('pointerup', function () { active = null; }); selection.addEventListener('pointercancel', function () { active = null; });
    selection.addEventListener('keydown', function (event) { var amount = event.shiftKey ? 10 : 1; if (event.key === 'ArrowLeft') state.crop.x -= amount; else if (event.key === 'ArrowRight') state.crop.x += amount; else if (event.key === 'ArrowUp') state.crop.y -= amount; else if (event.key === 'ArrowDown') state.crop.y += amount; else return; event.preventDefault(); state.crop.x = core.clamp(state.crop.x, 0, imageWidth(state.image) - state.crop.width); state.crop.y = core.clamp(state.crop.y, 0, imageHeight(state.image) - state.crop.height); updateCropUI(); });
  }
  async function processCrop() { try { var crop = state.crop; var width = Math.round(crop.width); var height = Math.round(crop.height); var mime = supportsEncoding(state.mime) ? state.mime : 'image/png'; var canvas = drawImage(width, height, { source: { x: Math.round(crop.x), y: Math.round(crop.y), width: width, height: height } }); var blob = await canvasBlob(canvas, mime, mime === 'image/png' ? undefined : .92); setResult(blob, outputName('zugeschnitten', mime), canvas); setStatus('Zuschnitt wurde lokal erstellt.'); canvas.width = canvas.height = 1; } catch (error) { setStatus(error.message, true); } }

  function initRotate() {
    renderShell('<div class="transform-buttons"><button class="button button-secondary" type="button" data-transform="left">↶ Links 90°</button><button class="button button-secondary" type="button" data-transform="right">↷ Rechts 90°</button><button class="button button-secondary" type="button" data-transform="180">180°</button><button class="button button-secondary" type="button" data-transform="flip-x">Horizontal spiegeln</button><button class="button button-secondary" type="button" data-transform="flip-y">Vertikal spiegeln</button><button class="button button-secondary" type="button" data-transform="reset">Ausrichtung zurücksetzen</button></div><p class="tool-help">Die Änderungen betreffen nur die Vorschau, bis du das Ergebnis exportierst.</p>');
    queryAll('[data-transform]').forEach(function (button) { button.addEventListener('click', function () { var action = button.dataset.transform; if (action === 'left') state.rotation = (state.rotation + 270) % 360; if (action === 'right') state.rotation = (state.rotation + 90) % 360; if (action === '180') state.rotation = (state.rotation + 180) % 360; if (action === 'flip-x') state.flipX = !state.flipX; if (action === 'flip-y') state.flipY = !state.flipY; if (action === 'reset') { state.rotation = 0; state.flipX = false; state.flipY = false; } renderTransformPreview(); }); });
    query('[data-process]').textContent = 'Ausrichtung exportieren'; query('[data-process]').addEventListener('click', exportTransform);
  }
  function transformedCanvas() {
    var dimensions = core.rotatedDimensions(imageWidth(state.image), imageHeight(state.image), state.rotation); var canvas = createCanvas(dimensions.width, dimensions.height); var context = canvas.getContext('2d'); context.translate(canvas.width / 2, canvas.height / 2); context.rotate(state.rotation * Math.PI / 180); context.scale(state.flipX ? -1 : 1, state.flipY ? -1 : 1); context.drawImage(state.image, -imageWidth(state.image) / 2, -imageHeight(state.image) / 2); return canvas;
  }
  function renderTransformPreview() { if (!state.image) return; var preview = query('[data-source-preview]'); preview.style.transform = 'rotate(' + state.rotation + 'deg) scale(' + (state.flipX ? -1 : 1) + ',' + (state.flipY ? -1 : 1) + ')'; preview.classList.toggle('is-rotated', state.rotation % 180 === 90); setStatus('Vorschau: ' + state.rotation + '°' + (state.flipX ? ', horizontal gespiegelt' : '') + (state.flipY ? ', vertikal gespiegelt' : '') + '.'); }
  async function exportTransform() { try { var mime = supportsEncoding(state.mime) ? state.mime : 'image/png'; var canvas = transformedCanvas(); var blob = await canvasBlob(canvas, mime, mime === 'image/png' ? undefined : .92); setResult(blob, outputName('ausgerichtet', mime), canvas); setStatus('Ausrichtung wurde lokal exportiert.'); canvas.width = canvas.height = 1; } catch (error) { setStatus(error.message, true); } }

  function initConvert(remover) {
    var explanation = remover ? '<p class="notice-inline">Das Bild wird über Canvas lokal dekodiert und neu kodiert. Dadurch werden die im Originalcontainer gespeicherten Metadaten nicht in die neue Datei übernommen. Dies ist keine forensische Löschgarantie.</p>' : '<div class="tool-field"><label for="jpeg-background">JPEG-Hintergrund bei Transparenz</label><input class="tool-input" id="jpeg-background" data-background type="color" value="#ffffff"></div>';
    renderShell('<div class="tool-field"><label for="convert-format">Ausgabeformat</label><select class="tool-select" id="convert-format" data-format></select></div><div class="tool-field" data-quality-wrap><label for="convert-quality">Qualität: <output data-quality-output>88 %</output></label><input class="image-range" id="convert-quality" data-quality type="range" min="30" max="100" value="88"></div><p class="tool-help" data-format-note></p>' + explanation);
    query('[data-format]').addEventListener('change', syncQuality); query('[data-quality]').addEventListener('input', function () { query('[data-quality-output]').textContent = this.value + ' %'; }); query('[data-process]').textContent = remover ? 'Metadatenfreie Kopie erstellen' : 'Format konvertieren';
    query('[data-process]').addEventListener('click', async function () { try { var mime = chosenMime(); var background = mime === 'image/jpeg' ? (query('[data-background]') ? query('[data-background]').value : '#ffffff') : null; setStatus(remover ? 'Metadatenfreie Kopie wird lokal neu kodiert …' : 'Bild wird lokal konvertiert …'); var canvas = drawImage(imageWidth(state.image), imageHeight(state.image), { background: background }); var blob = await canvasBlob(canvas, mime, mime === 'image/png' ? undefined : qualityValue()); setResult(blob, outputName(remover ? 'ohne-metadaten' : 'konvertiert', mime), canvas); setStatus(remover ? 'Neu kodierte Kopie ohne übernommene Container-Metadaten ist bereit.' : 'Konvertierung abgeschlossen.'); canvas.width = canvas.height = 1; } catch (error) { setStatus(error.message, true); } });
  }
  function setupFormatsLoaded() { var select = query('[data-format]'); select.textContent = ''; fillFormatOptions(select, false); select.value = state.mime; if (!select.value) select.selectedIndex = 0; syncQuality(); }

  function initMetadata() {
    var extra = '<section class="tool-panel" data-metadata-panel><h2>Lokale Bildinformationen</h2><div class="metadata-table" data-metadata></div><div class="gps-warning" data-gps hidden role="alert"><strong>Achtung: Standortdaten gefunden</strong><span data-gps-text></span></div></section>';
    renderShell('<p class="tool-help">Angezeigt werden nur Informationen, die direkt aus der ausgewählten Datei und der lokalen Browser-Dekodierung gelesen werden.</p>', extra); query('[data-process]').hidden = true;
  }
  function metadataRow(term, value) { var row = document.createElement('div'); var dt = document.createElement('dt'); var dd = document.createElement('dd'); dt.textContent = term; dd.textContent = value === undefined || value === null || value === '' ? 'Nicht vorhanden' : String(value); row.appendChild(dt); row.appendChild(dd); return row; }
  function showMetadata() {
    var metadata = core.readExif(state.bytes); var table = query('[data-metadata]'); table.textContent = ''; var list = document.createElement('dl');
    [['Dateiname', state.file.name], ['MIME-Typ', state.mime], ['Dateigröße', core.formatBytes(state.file.size)], ['Breite', imageWidth(state.image) + ' px'], ['Höhe', imageHeight(state.image) + ' px'], ['Seitenverhältnis', core.ratioLabel(imageWidth(state.image), imageHeight(state.image))], ['Zuletzt geändert', new Date(state.file.lastModified).toLocaleString('de-DE')], ['Ausrichtung (EXIF)', metadata.orientation], ['Kamerahersteller', metadata.make], ['Kameramodell', metadata.model], ['Aufnahmedatum', metadata.dateTaken], ['Belichtungszeit', metadata.exposureTime ? metadata.exposureTime + ' s' : null], ['Blende', metadata.fNumber ? 'f/' + metadata.fNumber : null], ['ISO', metadata.iso], ['Brennweite', metadata.focalLength ? metadata.focalLength + ' mm' : null]].forEach(function (entry) { list.appendChild(metadataRow(entry[0], entry[1])); }); table.appendChild(list);
    var warning = query('[data-gps]'); if (metadata.gps) { setHidden(warning, false); query('[data-gps-text]').textContent = ' GPS: ' + metadata.gps.latitude.toFixed(6) + ', ' + metadata.gps.longitude.toFixed(6) + '. Teile diese Datei nur bewusst.'; } else setHidden(warning, true);
    setStatus(metadata.error || 'Metadaten wurden ausschließlich lokal gelesen.', Boolean(metadata.error));
  }

  function initColor() {
    var extra = '<section class="tool-panel color-panel"><h2>Farbe auswählen</h2><p class="tool-help">Klicke oder tippe auf das Bild. Der vergrößerte Ausschnitt hilft beim genauen Treffen.</p><div class="color-canvas-wrap checkerboard"><canvas data-color-canvas tabindex="0" aria-label="Bild zur Farbauswahl"></canvas><canvas class="magnifier" data-magnifier width="121" height="121" aria-hidden="true"></canvas></div><div class="color-output"><div class="selected-swatch" data-swatch></div><div><span>HEX</span><strong data-hex>#000000</strong><button class="button button-secondary" type="button" data-copy="hex">HEX kopieren</button></div><div><span>RGB</span><strong data-rgb>rgb(0, 0, 0)</strong><button class="button button-secondary" type="button" data-copy="rgb">RGB kopieren</button></div><div><span>HSL</span><strong data-hsl>hsl(0, 0%, 0%)</strong><button class="button button-secondary" type="button" data-copy="hsl">HSL kopieren</button></div></div><p class="tool-help" data-coordinates>Koordinaten: –</p></section>';
    renderShell('<p class="tool-help">Die Pixel werden direkt über Canvas in deinem Browser ausgelesen.</p>', extra); query('[data-process]').hidden = true;
    var canvas = query('[data-color-canvas]'); canvas.addEventListener('pointerdown', samplePointer); canvas.addEventListener('keydown', function (event) { if (!state.image || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Enter',' '].includes(event.key)) return; event.preventDefault(); var x = Number(canvas.dataset.x || Math.floor(canvas.width / 2)); var y = Number(canvas.dataset.y || Math.floor(canvas.height / 2)); if (event.key === 'ArrowLeft') x -= 1; if (event.key === 'ArrowRight') x += 1; if (event.key === 'ArrowUp') y -= 1; if (event.key === 'ArrowDown') y += 1; sampleAt(core.clamp(x, 0, canvas.width - 1), core.clamp(y, 0, canvas.height - 1)); });
    queryAll('[data-copy]').forEach(function (button) { button.addEventListener('click', async function () { var value = query('[data-' + button.dataset.copy + ']').textContent; try { await navigator.clipboard.writeText(value); setStatus(value + ' kopiert.'); } catch (error) { setStatus('Kopieren wurde vom Browser blockiert. Markiere den Wert bitte manuell.', true); } }); });
  }
  function setupColorLoaded() { var canvas = query('[data-color-canvas]'); var scale = Math.min(1, 1200 / imageWidth(state.image), 800 / imageHeight(state.image)); canvas.width = Math.max(1, Math.round(imageWidth(state.image) * scale)); canvas.height = Math.max(1, Math.round(imageHeight(state.image) * scale)); canvas.getContext('2d', { willReadFrequently: true }).drawImage(state.image, 0, 0, canvas.width, canvas.height); sampleAt(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2)); }
  function samplePointer(event) { var canvas = event.currentTarget; var rectangle = canvas.getBoundingClientRect(); sampleAt(Math.floor((event.clientX - rectangle.left) * canvas.width / rectangle.width), Math.floor((event.clientY - rectangle.top) * canvas.height / rectangle.height)); }
  function sampleAt(x, y) { var canvas = query('[data-color-canvas]'); x = core.clamp(x, 0, canvas.width - 1); y = core.clamp(y, 0, canvas.height - 1); canvas.dataset.x = x; canvas.dataset.y = y; var pixel = canvas.getContext('2d').getImageData(x, y, 1, 1).data; var hex = core.rgbaToHex(pixel[0], pixel[1], pixel[2]); var hsl = core.rgbToHsl(pixel[0], pixel[1], pixel[2]); query('[data-hex]').textContent = hex; query('[data-rgb]').textContent = 'rgb(' + pixel[0] + ', ' + pixel[1] + ', ' + pixel[2] + ')'; query('[data-hsl]').textContent = 'hsl(' + hsl.h + ', ' + hsl.s + '%, ' + hsl.l + '%)'; query('[data-swatch]').style.backgroundColor = hex; query('[data-coordinates]').textContent = 'Koordinaten in der Vorschau: ' + x + ', ' + y; var magnifier = query('[data-magnifier]'); var context = magnifier.getContext('2d'); context.imageSmoothingEnabled = false; context.clearRect(0, 0, 121, 121); context.drawImage(canvas, x - 5, y - 5, 11, 11, 0, 0, 121, 121); context.strokeStyle = '#ffffff'; context.lineWidth = 2; context.strokeRect(55, 55, 11, 11); setStatus('Farbe ' + hex + ' ausgewählt.'); }

  function initBatch() {
    root.textContent = ''; root.insertAdjacentHTML('beforeend', '<div class="tool-shell image-tool-app"><section class="tool-panel"><h2>Bilder auswählen</h2><label class="file-drop-zone"><strong>Mehrere Bilder hier ablegen</strong><span>JPEG, PNG oder WebP · Verarbeitung erfolgt nacheinander</span><input class="file-input" type="file" multiple accept="image/jpeg,image/png,image/webp"></label></section><section class="tool-panel"><div class="batch-options"><div class="tool-field"><label for="batch-format">Gemeinsames Ausgabeformat</label><select class="tool-select" id="batch-format" data-format></select></div><div class="tool-field" data-quality-wrap><label for="batch-quality">Qualität: <output data-quality-output>85 %</output></label><input class="image-range" id="batch-quality" data-quality type="range" min="30" max="100" value="85"></div><div class="tool-field"><label for="batch-width">Maximale Breite (optional)</label><input class="tool-input" id="batch-width" data-max-width type="number" min="1" max="16384" placeholder="unverändert"></div><div class="tool-field"><label for="batch-height">Maximale Höhe (optional)</label><input class="tool-input" id="batch-height" data-max-height type="number" min="1" max="16384" placeholder="unverändert"></div></div><div class="tool-actions"><button class="button button-primary" type="button" data-process>Alle lokal verarbeiten</button><button class="button button-secondary" type="button" data-download-all disabled>Alle als ZIP herunterladen</button><button class="button button-secondary" type="button" data-reset>Liste leeren</button></div><progress class="pdf-progress" data-progress max="100" value="0">0 %</progress><p class="status-row" data-status role="status" aria-live="polite"></p><div class="batch-list" data-batch-list></div></section></div>');
    fillFormatOptions(query('[data-format]'), false); query('[data-format]').value = supportsEncoding('image/webp') ? 'image/webp' : 'image/jpeg'; syncQuality(); query('[data-format]').addEventListener('change', syncQuality); query('[data-quality]').addEventListener('input', function () { query('[data-quality-output]').textContent = this.value + ' %'; }); bindDropZone(true, addBatchFiles); query('[data-reset]').addEventListener('click', clearBatch); query('[data-process]').addEventListener('click', processBatch); query('[data-download-all]').addEventListener('click', downloadBatchZip);
  }
  async function addBatchFiles(files) { for (var index = 0; index < files.length; index += 1) { state.batch.push({ file: files[index], status: 'Bereit', blob: null, url: '', error: '' }); } renderBatch(); setStatus(files.length + ' Bild(er) zur Liste hinzugefügt.'); }
  function renderBatch() { var list = query('[data-batch-list]'); list.textContent = ''; state.batch.forEach(function (item, index) { var card = document.createElement('article'); card.className = 'batch-card'; var info = document.createElement('div'); info.className = 'pdf-file-info'; var name = document.createElement('strong'); name.textContent = item.file.name; var detail = document.createElement('span'); detail.textContent = core.formatBytes(item.file.size) + ' · ' + (item.error || item.status); info.appendChild(name); info.appendChild(detail); card.appendChild(info); if (item.blob) { var button = document.createElement('button'); button.className = 'button button-secondary'; button.type = 'button'; button.textContent = 'Herunterladen'; button.addEventListener('click', function () { download(item.blob, item.filename); }); card.appendChild(button); } var remove = document.createElement('button'); remove.className = 'batch-remove'; remove.type = 'button'; remove.textContent = 'Entfernen'; remove.setAttribute('aria-label', item.file.name + ' entfernen'); remove.addEventListener('click', function () { revoke(item.url); state.batch.splice(index, 1); renderBatch(); }); card.appendChild(remove); list.appendChild(card); }); }
  function clearBatch() { state.batch.forEach(function (item) { revoke(item.url); }); state.batch = []; query('.file-input').value = ''; query('[data-progress]').value = 0; query('[data-download-all]').disabled = true; renderBatch(); setStatus('Liste geleert.'); }
  async function processBatch() {
    if (!state.batch.length) { setStatus('Bitte wähle zuerst mindestens ein Bild aus.', true); return; }
    var mime = chosenMime(); var maxWidth = Number(query('[data-max-width]').value) || Infinity; var maxHeight = Number(query('[data-max-height]').value) || Infinity; query('[data-process]').disabled = true; query('[data-download-all]').disabled = true;
    for (var index = 0; index < state.batch.length; index += 1) {
      var item = state.batch[index]; item.status = 'Wird verarbeitet …'; item.error = ''; renderBatch(); setStatus('Bild ' + (index + 1) + ' von ' + state.batch.length + ' wird lokal verarbeitet …');
      try { var decoded = await decodeFile(item.file); var scale = Math.min(1, maxWidth / imageWidth(decoded.image), maxHeight / imageHeight(decoded.image)); var width = Math.max(1, Math.round(imageWidth(decoded.image) * scale)); var height = Math.max(1, Math.round(imageHeight(decoded.image) * scale)); var canvas = createCanvas(width, height); canvas.getContext('2d').drawImage(decoded.image, 0, 0, width, height); item.blob = await canvasBlob(canvas, mime, mime === 'image/png' ? undefined : qualityValue()); item.filename = core.safeBaseName(item.file.name) + '-konvertiert.' + extension(mime); item.status = 'Fertig · ' + core.formatBytes(item.blob.size); revoke(decoded.url); if (decoded.image && typeof decoded.image.close === 'function') decoded.image.close(); canvas.width = canvas.height = 1; } catch (error) { item.status = 'Fehler'; item.error = error.message; }
      query('[data-progress]').value = Math.round((index + 1) / state.batch.length * 100); renderBatch(); await nextFrame();
    }
    query('[data-process]').disabled = false; var successes = state.batch.filter(function (item) { return item.blob; }); query('[data-download-all]').disabled = !successes.length; root.dataset.batchSuccess = String(successes.length); root.dataset.batchMime = mime; setStatus(successes.length + ' von ' + state.batch.length + ' Bildern erfolgreich verarbeitet.', successes.length !== state.batch.length);
  }
  async function downloadBatchZip() { try { var zip = new window.JSZip(); state.batch.forEach(function (item) { if (item.blob) zip.file(item.filename, item.blob); }); setStatus('ZIP-Datei wird lokal erstellt …'); var blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' }, function (metadata) { query('[data-progress]').value = Math.round(metadata.percent); }); root.dataset.zipSize = String(blob.size); download(blob, 'stylepanda-bilder-konvertiert.zip'); setStatus('ZIP-Datei ist bereit.'); } catch (error) { setStatus('ZIP konnte nicht erstellt werden: ' + error.message, true); } }

  function initFavicon() {
    var extra = '<section class="tool-panel" data-favicon-results hidden><div class="image-result-heading"><div><p class="eyebrow">Favicon-Paket</p><h2>PNG-Dateien</h2></div><button class="button button-primary" type="button" data-download-all>Alle als ZIP herunterladen</button></div><div class="favicon-grid" data-favicon-grid></div></section>';
    renderShell('<fieldset><legend>Einpassung</legend><label class="option"><input type="radio" name="fit" value="cover" checked> Quadratisch zuschneiden (füllt die Fläche)</label><label class="option"><input type="radio" name="fit" value="contain"> Ganzes Bild einpassen (transparenter Rand möglich)</label></fieldset><p class="tool-help">Erstellt echte PNG-Dateien in 16, 32, 48, 180, 192 und 512 Pixeln. Es wird keine unechte ICO-Datei erzeugt.</p>', extra); query('[data-process]').textContent = 'Favicons erzeugen'; query('[data-process]').addEventListener('click', processFavicons); query('[data-download-all]').addEventListener('click', downloadFaviconZip);
  }
  async function processFavicons() { var sizes = [16,32,48,180,192,512]; var mode = query('input[name="fit"]:checked').value; (state.favicons || []).forEach(function (item) { revoke(item.url); }); state.favicons = []; setStatus('Favicon-PNGs werden lokal erstellt …'); try { for (var index = 0; index < sizes.length; index += 1) { var size = sizes[index]; var canvas = createCanvas(size, size); var rectangle = core.fitRectangle(imageWidth(state.image), imageHeight(state.image), size, size, mode); canvas.getContext('2d').drawImage(state.image, rectangle.x, rectangle.y, rectangle.width, rectangle.height); var blob = await canvasBlob(canvas, 'image/png'); state.favicons.push({ size: size, blob: blob, filename: 'favicon-' + size + 'x' + size + '.png', url: canvas.toDataURL('image/png') }); canvas.width = canvas.height = 1; await nextFrame(); } renderFavicons(); setHidden(query('[data-favicon-results]'), false); setStatus('Sechs Favicon-PNGs wurden erstellt.'); } catch (error) { setStatus(error.message, true); } }
  function renderFavicons() { var grid = query('[data-favicon-grid]'); grid.textContent = ''; root.dataset.faviconSizes = state.favicons.map(function (item) { return item.size; }).join(','); state.favicons.forEach(function (item) { var card = document.createElement('article'); card.className = 'favicon-card'; var image = document.createElement('img'); image.src = item.url; image.alt = 'Favicon-Vorschau ' + item.size + ' mal ' + item.size + ' Pixel'; var strong = document.createElement('strong'); strong.textContent = item.size + ' × ' + item.size; var button = document.createElement('button'); button.className = 'button button-secondary'; button.type = 'button'; button.textContent = 'PNG herunterladen'; button.addEventListener('click', function () { download(item.blob, item.filename); }); card.appendChild(image); card.appendChild(strong); card.appendChild(button); grid.appendChild(card); }); }
  async function downloadFaviconZip() { try { var zip = new window.JSZip(); state.favicons.forEach(function (item) { zip.file(item.filename, item.blob); }); var blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' }); root.dataset.zipSize = String(blob.size); download(blob, 'stylepanda-favicons-png.zip'); setStatus('Favicon-ZIP ist bereit.'); } catch (error) { setStatus(error.message, true); } }

  try {
    if (!core) throw new Error('Die lokale Bild-Engine konnte nicht geladen werden.');
    if (tool === 'compress') initCompress();
    else if (tool === 'resize') initResize();
    else if (tool === 'crop') initCrop();
    else if (tool === 'rotate') initRotate();
    else if (tool === 'convert') initConvert(false);
    else if (tool === 'batch') initBatch();
    else if (tool === 'metadata') initMetadata();
    else if (tool === 'remove-metadata') initConvert(true);
    else if (tool === 'color') initColor();
    else if (tool === 'favicon') initFavicon();
    else throw new Error('Unbekanntes Bildwerkzeug.');
    root.dataset.imageToolInitialized = 'true';
  } catch (error) {
    root.textContent = ''; var panel = document.createElement('section'); panel.className = 'tool-panel'; var heading = document.createElement('h2'); heading.textContent = 'Bildwerkzeug nicht verfügbar'; var paragraph = document.createElement('p'); paragraph.className = 'form-error'; paragraph.textContent = error.message; panel.appendChild(heading); panel.appendChild(paragraph); root.appendChild(panel);
  }
  window.addEventListener('pagehide', function () { releaseAll(); if (state.image && typeof state.image.close === 'function') state.image.close(); });
}());
