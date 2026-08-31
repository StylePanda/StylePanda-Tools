import * as pdfjsLib from '/assets/vendor/pdfjs/pdf.min.js';

const core = window.StylePandaPdfCore;
const PDFLib = window.PDFLib;
const JSZip = window.JSZip;

pdfjsLib.GlobalWorkerOptions.workerSrc = '/assets/vendor/pdfjs/pdf.worker.min.js';

const PDFJS_OPTIONS = {
  cMapUrl: '/assets/vendor/pdfjs/cmaps/', cMapPacked: true,
  standardFontDataUrl: '/assets/vendor/pdfjs/standard_fonts/',
  wasmUrl: '/assets/vendor/pdfjs/wasm/',
  isEvalSupported: false, disableAutoFetch: true, disableStream: true,
  useWorkerFetch: true, verbosity: 0
};

const configurations = {
  merge: { multiple: true, accept: '.pdf,application/pdf', title: 'PDF-Dateien auswählen', action: 'PDF zusammenfügen', files: 'pdf' },
  split: { accept: '.pdf,application/pdf', title: 'PDF-Datei auswählen', action: 'PDF teilen', files: 'pdf' },
  extract: { accept: '.pdf,application/pdf', title: 'PDF-Datei auswählen', action: 'Seiten extrahieren', files: 'pdf', thumbnails: true, selection: true },
  delete: { accept: '.pdf,application/pdf', title: 'PDF-Datei auswählen', action: 'Ausgewählte Seiten löschen', files: 'pdf', thumbnails: true, selection: true },
  rotate: { accept: '.pdf,application/pdf', title: 'PDF-Datei auswählen', action: 'Gedrehtes PDF erzeugen', files: 'pdf', thumbnails: true, selection: true },
  reorder: { accept: '.pdf,application/pdf', title: 'PDF-Datei auswählen', action: 'Neu angeordnetes PDF erzeugen', files: 'pdf', thumbnails: true },
  metadata: { accept: '.pdf,application/pdf', title: 'PDF-Datei auswählen', action: 'Metadaten speichern', files: 'pdf' },
  compress: { accept: '.pdf,application/pdf', title: 'PDF-Datei auswählen', action: 'PDF rasterbasiert komprimieren', files: 'pdf' },
  'extract-images': { accept: '.pdf,application/pdf', title: 'PDF-Datei auswählen', action: 'Eingebettete Bilder analysieren', files: 'pdf' },
  'images-to-pdf': { multiple: true, accept: '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp', title: 'Bilder auswählen', action: 'PDF erzeugen', files: 'image' },
  resize: { accept: '.pdf,application/pdf', title: 'PDF-Datei auswählen', action: 'Seitengröße anwenden', files: 'pdf', thumbnails: true, selection: true },
  'pdf-to-images': { accept: '.pdf,application/pdf', title: 'PDF-Datei auswählen', action: 'Bilder erzeugen', files: 'pdf', thumbnails: true, selection: true }
};

function create(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function button(text, action, primary) {
  const node = create('button', 'button ' + (primary ? 'button-primary' : 'button-secondary'), text);
  node.type = 'button';
  if (action) node.dataset.action = action;
  return node;
}

function field(labelText, type, name, options) {
  const wrap = create('div', 'tool-field');
  const label = create('label', '', labelText);
  const id = 'pdf-' + name;
  label.htmlFor = id;
  let control;
  if (type === 'select') {
    control = create('select', 'tool-select');
    (options || []).forEach(([value, text]) => {
      const option = create('option', '', text); option.value = value; control.appendChild(option);
    });
  } else if (type === 'textarea') {
    control = create('textarea', 'tool-textarea pdf-compact-textarea');
  } else {
    control = create('input', 'tool-input'); control.type = type || 'text';
  }
  control.id = id; control.dataset.field = name;
  wrap.append(label, control);
  return wrap;
}

function checkbox(text, name, checked) {
  const label = create('label', 'option');
  const input = create('input'); input.type = 'checkbox'; input.dataset.field = name; input.checked = Boolean(checked);
  label.append(input, document.createTextNode(text));
  return label;
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('canvas')), type, quality));
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('image'));
    reader.readAsDataURL(blob);
  });
}

async function imageThumbnail(blob, maximumWidth = 320, maximumHeight = 220) {
  let source;
  let revokeSource = false;
  if ('createImageBitmap' in window) source = await createImageBitmap(blob);
  else {
    source = new Image(); source.src = await blobToDataUrl(blob); await source.decode(); revokeSource = true;
  }
  const width = source.width || source.naturalWidth; const height = source.height || source.naturalHeight;
  const scale = Math.min(1, maximumWidth / width, maximumHeight / height);
  const canvas = create('canvas'); canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale));
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/png'); canvas.width = 1; canvas.height = 1;
  if (!revokeSource && source.close) source.close();
  return { width, height, dataUrl };
}

function friendlyError(error) {
  const name = String(error && error.name || '');
  const message = String(error && error.message || '');
  if (name === 'PasswordException' || /password|encrypted/i.test(message)) return 'Diese PDF ist passwortgeschützt oder verschlüsselt.';
  if (/memory|allocation|out of memory/i.test(message)) return 'Der Browser hat nicht genügend Arbeitsspeicher für diese Verarbeitung. Versuche eine kleinere Datei oder niedrigere Auflösung.';
  if (/image/i.test(message)) return 'Das Bild konnte nicht verarbeitet werden. Prüfe Format und Dateiintegrität.';
  return 'Die Datei konnte nicht verarbeitet werden. Sie ist möglicherweise beschädigt oder verwendet nicht unterstützte PDF-Funktionen.';
}

class PdfToolApp {
  constructor(root) {
    this.root = root;
    this.name = root.dataset.pdfTool;
    this.config = configurations[this.name];
    this.files = [];
    this.selected = new Set();
    this.rotations = {};
    this.pageOrder = [];
    this.urls = [];
    this.generation = 0;
    this.loadingTask = null;
    this.pdfJs = null;
    this.thumbnailObserver = null;
    this.thumbnailRenderTasks = new Set();
    this.bytes = null;
    this.password = '';
    this.build();
  }

  build() {
    if (!core || !PDFLib || !JSZip || !this.config) {
      this.root.append(create('p', 'form-error', 'Die lokalen PDF-Komponenten konnten nicht geladen werden.'));
      return;
    }
    this.root.classList.add('tool-shell');
    this.dropPanel = create('section', 'tool-panel');
    const heading = create('h2', '', this.config.title);
    this.dropZone = create('div', 'file-drop-zone');
    this.dropZone.tabIndex = 0;
    this.dropZone.setAttribute('role', 'button');
    this.dropZone.setAttribute('aria-label', this.config.title + ' – Dateiauswahl öffnen');
    this.fileInput = create('input', 'file-input');
    this.fileInput.type = 'file'; this.fileInput.accept = this.config.accept; this.fileInput.multiple = Boolean(this.config.multiple);
    this.fileInput.setAttribute('aria-label', this.config.title);
    this.dropZone.append(create('strong', '', 'Dateien hier ablegen'), create('span', '', 'oder per Dateiauswahl öffnen'), this.fileInput);
    this.fileList = create('div', 'pdf-file-list');
    this.passwordWrap = field('Passwort (nur lokal, wird nicht gespeichert)', 'password', 'password');
    this.passwordWrap.hidden = true;
    this.passwordButton = button('Mit Passwort erneut öffnen', 'password');
    this.passwordWrap.append(this.passwordButton);
    this.dropPanel.append(heading, this.dropZone, this.fileList, this.passwordWrap);
    this.controls = create('section', 'tool-panel pdf-options');
    this.controls.hidden = true;
    this.buildToolControls();
    this.thumbnailPanel = create('section', 'tool-panel');
    this.thumbnailPanel.hidden = true;
    this.thumbnailPanel.append(create('h2', '', this.name === 'reorder' ? 'Seitenreihenfolge' : 'Seitenvorschau'));
    this.selectionBar = create('div', 'tool-actions pdf-selection-actions');
    this.rangeField = field('Seitenbereich, z. B. 1-5, 8', 'text', 'range');
    this.applyRange = button('Bereich auswählen', 'range');
    this.rangeField.append(this.applyRange);
    this.thumbnailGrid = create('div', 'pdf-thumbnail-grid');
    this.thumbnailPanel.append(this.selectionBar, this.rangeField, this.thumbnailGrid);
    this.actionRow = create('div', 'tool-actions');
    this.processButton = button(this.config.action, 'process', true);
    this.resetButton = button('Zurücksetzen', 'reset');
    this.actionRow.append(this.processButton, this.resetButton);
    this.progress = create('progress', 'pdf-progress'); this.progress.hidden = true;
    this.progress.max = 1;
    this.status = create('p', 'status-row'); this.status.setAttribute('role', 'status'); this.status.setAttribute('aria-live', 'polite');
    this.error = create('p', 'form-error'); this.error.setAttribute('role', 'alert');
    this.resultPanel = create('section', 'tool-panel pdf-results'); this.resultPanel.hidden = true;
    this.resultPanel.append(create('h2', '', 'Ergebnis'));
    this.resultContent = create('div', 'result-list'); this.resultPanel.append(this.resultContent);
    this.root.append(this.dropPanel, this.controls, this.thumbnailPanel, this.actionRow, this.progress, this.status, this.error, this.resultPanel);
    this.bind();
    this.updateActionState();
  }

  buildToolControls() {
    const title = create('h2', '', 'Einstellungen'); this.controls.append(title);
    if (this.name === 'merge') {
      this.controls.append(create('p', 'tool-help', 'Die Reihenfolge der Dateien bestimmt die Seitenreihenfolge. Ziehen ist möglich; die Pfeiltasten sind die vollständig unterstützte Alternative.'));
    } else if (this.name === 'split') {
      const mode = field('Teilungsmodus', 'select', 'splitMode', [['ranges', 'Seitenbereiche'], ['each', 'Jede Seite einzeln'], ['every', 'Alle X Seiten']]);
      const ranges = field('Ein Bereich pro Zeile', 'textarea', 'splitRanges'); ranges.querySelector('textarea').placeholder = '1-5\n6-10\n11-14';
      const every = field('Seiten pro Ausgabedatei', 'number', 'splitEvery'); every.querySelector('input').min = '1'; every.querySelector('input').value = '2';
      this.controls.append(mode, ranges, every, create('p', 'tool-help', 'Bereiche werden in Zeilenreihenfolge erzeugt. Überlappungen sind erlaubt und erzeugen die betreffenden Seiten bewusst in mehreren Ausgabedateien.'));
      const updateSplitFields = () => { const value = mode.querySelector('select').value; ranges.hidden = value !== 'ranges'; every.hidden = value !== 'every'; };
      mode.querySelector('select').addEventListener('change', updateSplitFields); updateSplitFields();
    } else if (this.name === 'rotate') {
      const row = create('div', 'tool-actions');
      row.append(button('90° links', 'rotate-left'), button('90° rechts', 'rotate-right'), button('180°', 'rotate-180'));
      this.controls.append(row, create('p', 'tool-help', 'Drehungen werden auf die ausgewählten Seiten angewendet und modulo 360° zusammengefasst.'));
    } else if (this.name === 'metadata') {
      const grid = create('div', 'metadata-grid');
      [['Titel','title'],['Autor','author'],['Thema','subject'],['Schlagwörter','keywords'],['Erstellt mit','creator'],['Produzent','producer'],['Erstellungsdatum','creationDate'],['Änderungsdatum','modificationDate']].forEach(([label,name]) => grid.append(field(label, name.endsWith('Date') ? 'datetime-local' : 'text', name)));
      this.clearMetadataButton = button('Metadaten entfernen', 'clear-metadata');
      this.controls.append(grid, this.clearMetadataButton, create('p', 'notice-inline', 'Bearbeitet werden unterstützte Standard-Dokumentmetadaten. Dies ist keine forensische Anonymisierung: Inhalte, Anmerkungen, Anhänge und andere interne Strukturen können weitere Informationen enthalten.'));
    } else if (this.name === 'compress') {
      this.controls.append(field('Rastermodus', 'select', 'compressionMode', [['gentle','Schonend – 1,5× / JPEG 86 %'],['balanced','Ausgewogen – 1,25× / JPEG 72 %'],['strong','Stark – 1× / JPEG 56 %']]), create('p', 'notice-inline', 'Verlustbehaftete Raster-Komprimierung: Jede Seite wird als JPEG neu aufgebaut. Auswählbarer Text, Vektoren, Formulare, Links, Anmerkungen und weitere PDF-Funktionen gehen verloren. Eine kleinere Datei wird nicht garantiert.'));
    } else if (this.name === 'extract-images') {
      this.controls.append(create('p', 'notice-inline', 'Das Werkzeug rekonstruiert unterstützte eingebettete Bildobjekte über PDF.js als PNG. Es extrahiert keine garantierten Originalbytes; Masken, komplexe Farbräume, Kacheln und manche Inline-Bilder können fehlen oder abweichen. Vollständige Seitenbilder gehören zum Werkzeug „PDF zu Bildern“.'));
    } else if (this.name === 'images-to-pdf') {
      this.controls.append(field('Seitengröße', 'select', 'imagePageSize', [['auto','Automatisch'],['A3','A3'],['A4','A4'],['A5','A5'],['Letter','Letter'],['Legal','Legal']]), field('Ausrichtung', 'select', 'orientation', [['auto','Automatisch'],['portrait','Hochformat'],['landscape','Querformat']]), field('Rand', 'select', 'margin', [['none','Kein Rand'],['small','Klein'],['medium','Mittel']]), create('p', 'tool-help', 'JPEG und PNG werden direkt eingebettet. WebP wird lokal im Browser dekodiert und als PNG eingebettet; Transparenz bleibt erhalten, sofern der Browser sie dekodiert.'));
    } else if (this.name === 'resize') {
      const preset = field('Zielgröße', 'select', 'pageSize', [['A3','A3'],['A4','A4'],['A5','A5'],['Letter','Letter'],['Legal','Legal'],['custom','Benutzerdefiniert']]);
      const dimensions = create('div', 'inline-fields'); dimensions.append(field('Breite in mm', 'number', 'customWidth'), field('Höhe in mm', 'number', 'customHeight'));
      dimensions.querySelectorAll('input').forEach(input => { input.min = '1'; input.max = '5000'; input.step = '0.1'; });
      this.pageInfo = create('p', 'compact-counters', 'Aktuelle Seitengrößen werden nach dem Laden angezeigt.');
      this.controls.append(preset, dimensions, create('p', 'tool-help', 'Modus „Einpassen“ skaliert Seiteninhalt proportional und zentriert ihn ohne absichtliches Beschneiden. Ohne Seitenauswahl werden alle Seiten geändert.'), this.pageInfo);
      const updateCustomFields = () => { dimensions.hidden = preset.querySelector('select').value !== 'custom'; };
      preset.querySelector('select').addEventListener('change', updateCustomFields); updateCustomFields();
    } else if (this.name === 'pdf-to-images') {
      const formatField = field('Bildformat', 'select', 'imageFormat', [['png','PNG'],['jpeg','JPEG'],['webp','WebP']]); const qualityField = field('Qualität für JPEG/WebP (%)', 'range', 'imageQuality');
      this.controls.append(formatField, field('Auflösung', 'select', 'imageScale', [['1','1×'],['1.5','1,5×'],['2','2×'],['3','3×']]), qualityField);
      const quality = qualityField.querySelector('input'); quality.min = '10'; quality.max = '100'; quality.value = '88';
      const updateQuality = () => { qualityField.hidden = formatField.querySelector('select').value === 'png'; };
      formatField.querySelector('select').addEventListener('change', updateQuality); updateQuality();
      this.controls.append(create('p', 'tool-help', 'Ohne Seitenauswahl werden alle Seiten exportiert. PNG verwendet keine verlustbehaftete Qualitätsstufe.'));
    } else {
      this.controls.append(create('p', 'tool-help', this.name === 'delete' ? 'Ausgewählte Seiten werden entfernt; alle übrigen Seiten bleiben in Dokumentreihenfolge erhalten.' : 'Ausgewählte Seiten werden in ursprünglicher Dokumentreihenfolge verarbeitet.'));
    }
  }

  bind() {
    this.fileInput.addEventListener('change', () => this.acceptFiles(Array.from(this.fileInput.files || [])));
    this.dropZone.addEventListener('click', event => { if (event.target !== this.fileInput) this.fileInput.click(); });
    this.dropZone.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); this.fileInput.click(); } });
    ['dragenter','dragover'].forEach(type => this.dropZone.addEventListener(type, event => { event.preventDefault(); this.dropZone.classList.add('is-dragging'); }));
    ['dragleave','drop'].forEach(type => this.dropZone.addEventListener(type, event => { event.preventDefault(); this.dropZone.classList.remove('is-dragging'); }));
    this.dropZone.addEventListener('drop', event => this.acceptFiles(Array.from(event.dataTransfer.files || [])));
    this.root.addEventListener('click', event => this.handleAction(event.target.closest('[data-action]')));
  }

  getField(name) { return this.root.querySelector('[data-field="' + name + '"]'); }
  setStatus(text) { this.status.textContent = text || ''; }
  setError(text) { this.error.textContent = text || ''; }
  setBusy(busy, text) {
    this.root.setAttribute('aria-busy', String(busy));
    if (busy) {
      this.disabledStates = new Map();
      this.root.querySelectorAll('button, input, select, textarea').forEach(control => { this.disabledStates.set(control, control.disabled); control.disabled = true; });
    } else if (this.disabledStates) {
      this.disabledStates.forEach((wasDisabled, control) => { if (control.isConnected) control.disabled = wasDisabled; });
      this.disabledStates = null;
    }
    this.progress.hidden = !busy;
    if (busy) { this.progress.removeAttribute('value'); this.setStatus(text || 'Verarbeitung läuft …'); }
  }
  setProgress(current, total, text) {
    this.progress.hidden = false; this.progress.max = total; this.progress.value = current;
    this.setStatus(text || (current + ' von ' + total + ' verarbeitet …'));
  }

  async acceptFiles(files) {
    if (!files.length) return;
    this.setError(''); this.clearResults();
    if (!this.config.multiple) await this.clearDocuments();
    this.setBusy(true, files.length > 1 ? 'Dateien werden geladen …' : 'Datei wird geladen …');
    try {
      for (const file of files) await this.loadFile(file);
      this.renderFileList();
      this.controls.hidden = !this.files.length;
      if (this.config.thumbnails && this.files[0]) await this.buildThumbnails();
      if (this.name === 'metadata' && this.files[0]) this.populateMetadata();
      if (this.name === 'resize' && this.files[0]) this.showPageSizes();
      this.setStatus(this.files.length + (this.files.length === 1 ? ' Datei geladen.' : ' Dateien geladen.'));
    } catch (error) { this.setError(friendlyError(error)); }
    finally { this.fileInput.value = ''; this.setBusy(false); this.updateActionState(); }
  }

  async loadFile(file) {
    if (this.config.files === 'image') {
      if (!core.isSupportedImage(file)) throw new Error('image');
      const dimensions = await this.imageDimensions(file);
      this.files.push({ id: crypto.randomUUID(), file, width: dimensions.width, height: dimensions.height, url: dimensions.url });
      return;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!core.isPdfHeader(bytes)) throw new Error('pdf');
    if (this.config.multiple) {
      let document;
      try { document = await PDFLib.PDFDocument.load(bytes, { updateMetadata: false }); }
      catch (error) { throw new Error(/encrypted/i.test(String(error.message)) ? 'encrypted' : 'pdf'); }
      this.files.push({ id: crypto.randomUUID(), file, bytes, pdfLib: document, pageCount: document.getPageCount() });
      return;
    }
    this.bytes = bytes;
    await this.openPdfJs(file, bytes, this.password);
    let pdfLibDocument = null;
    try { pdfLibDocument = await PDFLib.PDFDocument.load(bytes, { updateMetadata: false }); }
    catch (error) {
      if (!['compress','extract-images','pdf-to-images'].includes(this.name)) throw new Error(/encrypted/i.test(String(error.message)) ? 'encrypted' : 'pdf');
    }
    this.files = [{ id: crypto.randomUUID(), file, bytes, pdfLib: pdfLibDocument, pageCount: this.pdfJs.numPages }];
    this.pageOrder = Array.from({ length: this.pdfJs.numPages }, (_, index) => index + 1);
  }

  async openPdfJs(file, bytes, password) {
    if (this.loadingTask) await this.loadingTask.destroy();
    const data = bytes.slice();
    this.loadingTask = pdfjsLib.getDocument(Object.assign({ data, password: password || undefined }, PDFJS_OPTIONS));
    try { this.pdfJs = await this.loadingTask.promise; this.passwordWrap.hidden = true; }
    catch (error) {
      if (error && error.name === 'PasswordException') {
        this.passwordWrap.hidden = false; this.pendingPasswordFile = { file, bytes };
        throw error;
      }
      throw error;
    }
  }

  async imageDimensions(file) {
    const thumbnail = await imageThumbnail(file, 160, 120);
    return { width: thumbnail.width, height: thumbnail.height, url: thumbnail.dataUrl };
  }

  renderFileList() {
    this.fileList.replaceChildren();
    let totalPages = 0; let totalSize = 0;
    this.files.forEach((entry, index) => {
      totalPages += entry.pageCount || 0; totalSize += entry.file.size;
      const card = create('article', 'pdf-file-card'); card.draggable = this.config.multiple;
      card.dataset.id = entry.id;
      if (entry.url) { const image = create('img', 'file-preview'); image.src = entry.url; image.alt = ''; card.append(image); }
      const info = create('div', 'pdf-file-info'); info.append(create('strong', '', entry.file.name), create('span', '', core.formatBytes(entry.file.size) + (entry.pageCount ? ' · ' + entry.pageCount + ' Seiten' : ' · ' + entry.width + ' × ' + entry.height + ' px')));
      card.append(info);
      if (this.config.multiple) {
        const actions = create('div', 'mini-actions');
        const up = button('↑', 'move-up'); up.setAttribute('aria-label', entry.file.name + ' nach oben verschieben'); up.disabled = index === 0;
        const down = button('↓', 'move-down'); down.setAttribute('aria-label', entry.file.name + ' nach unten verschieben'); down.disabled = index === this.files.length - 1;
        const remove = button('Entfernen', 'remove-file'); remove.setAttribute('aria-label', entry.file.name + ' entfernen');
        actions.append(up, down, remove); card.append(actions);
        card.addEventListener('dragstart', event => event.dataTransfer.setData('text/plain', entry.id));
        card.addEventListener('dragover', event => event.preventDefault());
        card.addEventListener('drop', event => { event.preventDefault(); const source = this.files.findIndex(item => item.id === event.dataTransfer.getData('text/plain')); this.files = core.moveItem(this.files, source, index); this.renderFileList(); });
      }
      this.fileList.append(card);
    });
    if (this.files.length) this.fileList.prepend(create('p', 'compact-counters', this.files.length + ' Datei(en) · ' + core.formatBytes(totalSize) + (totalPages ? ' · ' + totalPages + ' Seiten gesamt' : '')));
  }

  buildSelectionBar() {
    this.selectionBar.replaceChildren();
    if (!this.config.selection) return;
    [['Alle','select-all'],['Keine','select-none'],['Ungerade','select-odd'],['Gerade','select-even']].forEach(([label, action]) => this.selectionBar.append(button(label, action)));
  }

  async buildThumbnails() {
    const token = ++this.generation;
    if (this.thumbnailObserver) this.thumbnailObserver.disconnect();
    this.thumbnailObserver = null;
    this.thumbnailRenderTasks.forEach(task => task.cancel());
    this.thumbnailRenderTasks.clear();
    this.thumbnailPanel.hidden = false;
    this.buildSelectionBar();
    this.rangeField.hidden = !this.config.selection;
    this.thumbnailGrid.replaceChildren();
    const pages = this.name === 'reorder' ? this.pageOrder : Array.from({ length: this.pdfJs.numPages }, (_, index) => index + 1);
    for (let index = 0; index < pages.length; index += 1) {
      const pageNumber = pages[index];
      const card = create(this.config.selection ? 'button' : 'article', 'pdf-thumbnail');
      if (this.config.selection) { card.type = 'button'; card.dataset.action = 'toggle-page'; card.setAttribute('aria-pressed', String(this.selected.has(pageNumber))); }
      card.dataset.page = String(pageNumber); card.dataset.index = String(index);
      const canvas = create('canvas', 'page-canvas'); canvas.setAttribute('aria-hidden', 'true');
      const label = create('span', 'thumbnail-label', (this.name === 'reorder' ? 'Originalseite ' : 'Seite ') + pageNumber);
      card.append(canvas, label);
      if (this.name === 'reorder') {
        const controls = create('span', 'mini-actions');
        const previous = button('←', 'page-left'); previous.setAttribute('aria-label', 'Originalseite ' + pageNumber + ' nach links verschieben'); previous.disabled = index === 0;
        const next = button('→', 'page-right'); next.setAttribute('aria-label', 'Originalseite ' + pageNumber + ' nach rechts verschieben'); next.disabled = index === pages.length - 1;
        controls.append(previous, next); card.append(controls); card.draggable = true;
        card.addEventListener('dragstart', event => event.dataTransfer.setData('text/plain', String(index)));
        card.addEventListener('dragover', event => event.preventDefault());
        card.addEventListener('drop', event => { event.preventDefault(); const source = Number(event.dataTransfer.getData('text/plain')); this.pageOrder = core.moveItem(this.pageOrder, source, index); this.buildThumbnails(); });
      }
      this.thumbnailGrid.append(card);
    }
    const observer = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
      entries.filter(entry => entry.isIntersecting).forEach(entry => { observer.unobserve(entry.target); this.renderThumbnail(entry.target, token); });
    }, { rootMargin: '250px' }) : null;
    this.thumbnailObserver = observer;
    this.thumbnailGrid.querySelectorAll('.pdf-thumbnail').forEach(card => observer ? observer.observe(card) : this.renderThumbnail(card, token));
    this.updateSelectionSummary();
  }

  async renderThumbnail(card, token) {
    if (token !== this.generation || !this.pdfJs) return;
    let page;
    let renderTask;
    try {
      const pageNumber = Number(card.dataset.page); page = await this.pdfJs.getPage(pageNumber);
      if (token !== this.generation) { page.cleanup(); return; }
      const base = page.getViewport({ scale: 1 }); const scale = Math.min(0.32, 160 / base.width);
      const viewport = page.getViewport({ scale }); const canvas = card.querySelector('canvas');
      canvas.width = Math.max(1, Math.floor(viewport.width)); canvas.height = Math.max(1, Math.floor(viewport.height));
      renderTask = page.render({ canvasContext: canvas.getContext('2d', { alpha: false }), viewport, annotationMode: pdfjsLib.AnnotationMode.DISABLE });
      this.thumbnailRenderTasks.add(renderTask);
      await renderTask.promise;
      if (token !== this.generation) return;
      canvas.style.transform = 'rotate(' + (this.rotations[pageNumber] || 0) + 'deg)';
    } catch (error) {
      if (token === this.generation && error && error.name !== 'RenderingCancelledException') { card.classList.add('thumbnail-error'); card.querySelector('.thumbnail-label').textContent += ' – Vorschau nicht möglich'; }
    } finally {
      if (renderTask) this.thumbnailRenderTasks.delete(renderTask);
      if (page) page.cleanup();
    }
  }

  updateSelectionSummary() {
    this.thumbnailGrid.querySelectorAll('.pdf-thumbnail[data-page]').forEach(card => {
      const selected = this.selected.has(Number(card.dataset.page));
      card.classList.toggle('is-selected', selected);
      if (card.tagName === 'BUTTON') card.setAttribute('aria-pressed', String(selected));
      const label = card.querySelector('.thumbnail-label');
      if (label && this.name === 'delete') label.textContent = 'Seite ' + card.dataset.page + (selected ? ' · wird gelöscht' : ' · bleibt erhalten');
      if (label && this.name === 'rotate') label.textContent = 'Seite ' + card.dataset.page + ' · ' + (this.rotations[card.dataset.page] || 0) + '°' + (selected ? ' · ausgewählt' : '');
    });
    if (!this.config.selection) return;
    if (this.name === 'delete') this.setStatus(this.selected.size + ' von ' + this.pdfJs.numPages + ' Seiten werden entfernt.');
    else this.setStatus(this.selected.size + ' von ' + this.pdfJs.numPages + ' Seiten ausgewählt.');
  }

  async handleAction(target) {
    if (!target) return;
    const action = target.dataset.action;
    if (action === 'reset') return this.reset();
    if (action === 'process') return this.process();
    if (action === 'password') return this.retryPassword();
    if (action === 'remove-file' || action === 'move-up' || action === 'move-down') {
      const card = target.closest('[data-id]'); const index = this.files.findIndex(entry => entry.id === card.dataset.id);
      if (action === 'remove-file') this.removeFile(index);
      else this.files = core.moveItem(this.files, index, index + (action === 'move-up' ? -1 : 1));
      this.renderFileList(); this.updateActionState(); return;
    }
    if (action === 'toggle-page') {
      const page = Number(target.dataset.page); this.selected.has(page) ? this.selected.delete(page) : this.selected.add(page); this.updateSelectionSummary(); return;
    }
    if (action && action.startsWith('select-')) {
      this.selected = new Set(core.selectPages(action.replace('select-', ''), this.pdfJs.numPages)); this.updateSelectionSummary(); return;
    }
    if (action === 'range') {
      const parsed = core.parsePageRange(this.getField('range').value, this.pdfJs.numPages);
      if (parsed.error) this.setError(parsed.error); else { this.setError(''); this.selected = new Set(parsed.pages); this.updateSelectionSummary(); }
      return;
    }
    if (action && action.startsWith('rotate-')) {
      if (!this.selected.size) return this.setError('Wähle zuerst mindestens eine Seite aus.');
      const delta = action === 'rotate-left' ? -90 : action === 'rotate-right' ? 90 : 180;
      this.rotations = core.applyRotationMap(this.rotations, Array.from(this.selected), delta); this.setError(''); this.updateSelectionSummary();
      this.thumbnailGrid.querySelectorAll('canvas').forEach(canvas => { canvas.style.transform = 'rotate(' + (this.rotations[canvas.closest('[data-page]').dataset.page] || 0) + 'deg)'; }); return;
    }
    if (action === 'page-left' || action === 'page-right') {
      const card = target.closest('[data-index]'); const index = Number(card.dataset.index);
      this.pageOrder = core.moveItem(this.pageOrder, index, index + (action === 'page-left' ? -1 : 1)); await this.buildThumbnails(); return;
    }
    if (action === 'clear-metadata') {
      this.controls.querySelectorAll('input').forEach(input => { input.value = ''; }); this.controls.dataset.clearMetadata = 'true'; this.setStatus('Unterstützte Standard-Metadaten werden beim Speichern entfernt.');
    }
  }

  async retryPassword() {
    if (!this.pendingPasswordFile) return;
    this.password = this.getField('password').value;
    if (!this.password) return this.setError('Bitte gib das PDF-Passwort ein.');
    this.setBusy(true, 'PDF wird mit Passwort geöffnet …');
    try {
      await this.openPdfJs(this.pendingPasswordFile.file, this.pendingPasswordFile.bytes, this.password);
      if (!['compress','extract-images','pdf-to-images'].includes(this.name)) throw new Error('encrypted');
      this.bytes = this.pendingPasswordFile.bytes; this.files = [{ id: crypto.randomUUID(), file: this.pendingPasswordFile.file, bytes: this.bytes, pdfLib: null, pageCount: this.pdfJs.numPages }];
      this.pageOrder = Array.from({ length: this.pdfJs.numPages }, (_, index) => index + 1);
      this.pendingPasswordFile = null; this.renderFileList(); this.controls.hidden = false;
      if (this.config.thumbnails) await this.buildThumbnails(); this.setError(''); this.setStatus('Passwortgeschützte PDF wurde lokal geöffnet.');
    } catch (error) { this.setError(friendlyError(error) + (['compress','extract-images','pdf-to-images'].includes(this.name) ? ' Prüfe das Passwort.' : ' Strukturänderungen an verschlüsselten PDFs werden nicht unterstützt.')); }
    finally { this.setBusy(false); this.updateActionState(); }
  }

  removeFile(index) {
    const entry = this.files[index]; if (!entry) return;
    this.files.splice(index, 1); this.clearResults(); this.controls.hidden = !this.files.length;
  }

  updateActionState() { if (this.processButton) this.processButton.disabled = !this.files.length; }

  async process() {
    if (!this.files.length) return this.setError('Bitte wähle zuerst mindestens eine Datei aus.');
    this.setError(''); this.clearResults(); this.setBusy(true, 'Verarbeitung wird vorbereitet …');
    try {
      const handlers = {
        merge: () => this.processMerge(), split: () => this.processSplit(), extract: () => this.processSubset(false), delete: () => this.processSubset(true),
        rotate: () => this.processRotate(), reorder: () => this.processReorder(), metadata: () => this.processMetadata(), compress: () => this.processCompression(),
        'extract-images': () => this.processEmbeddedImages(), 'images-to-pdf': () => this.processImagesToPdf(), resize: () => this.processResize(), 'pdf-to-images': () => this.processPdfToImages()
      };
      await handlers[this.name]();
    } catch (error) { this.setError(error.userMessage || friendlyError(error)); }
    finally { this.setBusy(false); this.updateActionState(); }
  }

  userError(message) { const error = new Error(message); error.userMessage = message; return error; }

  async savePdf(document) { return new Blob([await document.save({ useObjectStreams: true, objectsPerTick: 30 })], { type: 'application/pdf' }); }

  async processMerge() {
    if (this.files.length < 2) throw this.userError('Wähle mindestens zwei PDF-Dateien zum Zusammenfügen aus.');
    const output = await PDFLib.PDFDocument.create();
    for (let index = 0; index < this.files.length; index += 1) {
      this.setProgress(index, this.files.length, 'PDF ' + (index + 1) + ' von ' + this.files.length + ' wird übernommen …');
      const source = this.files[index].pdfLib; const pages = await output.copyPages(source, source.getPageIndices()); pages.forEach(page => output.addPage(page));
    }
    this.showDownload(await this.savePdf(output), 'zusammengefuegt.pdf', 'Eine PDF mit ' + output.getPageCount() + ' Seiten wurde erzeugt.');
  }

  async processSplit() {
    const mode = this.getField('splitMode').value;
    const value = mode === 'ranges' ? this.getField('splitRanges').value : this.getField('splitEvery').value;
    const result = core.splitGroups(mode, this.pdfJs.numPages, value);
    if (result.error) throw this.userError(result.error);
    const base = core.safeBaseName(this.files[0].file.name); const outputs = [];
    for (let index = 0; index < result.groups.length; index += 1) {
      this.setProgress(index + 1, result.groups.length, (index + 1) + ' von ' + result.groups.length + ' PDFs werden erzeugt …');
      const document = await PDFLib.PDFDocument.create(); const copied = await document.copyPages(this.files[0].pdfLib, result.groups[index].map(page => page - 1)); copied.forEach(page => document.addPage(page));
      outputs.push({ blob: await this.savePdf(document), name: core.splitFilename(base, index + 1, result.groups.length) });
    }
    await this.showBatch(outputs, base + '-geteilt.zip');
  }

  async processSubset(deleteSelected) {
    if (!this.selected.size) throw this.userError(deleteSelected ? 'Wähle mindestens eine Seite zum Löschen aus.' : 'Wähle mindestens eine Seite zum Extrahieren aus.');
    if (deleteSelected && this.selected.size === this.pdfJs.numPages) throw this.userError('Alle Seiten können nicht gelöscht werden. Mindestens eine Seite muss erhalten bleiben.');
    const pages = Array.from({ length: this.pdfJs.numPages }, (_, index) => index + 1).filter(page => deleteSelected ? !this.selected.has(page) : this.selected.has(page));
    const document = await PDFLib.PDFDocument.create(); const copied = await document.copyPages(this.files[0].pdfLib, pages.map(page => page - 1)); copied.forEach(page => document.addPage(page));
    const suffix = deleteSelected ? '-seiten-geloescht.pdf' : '-seiten-extrahiert.pdf';
    this.showDownload(await this.savePdf(document), core.safeBaseName(this.files[0].file.name) + suffix, document.getPageCount() + ' Seiten wurden in die neue PDF übernommen.');
  }

  async processRotate() {
    const changed = Object.keys(this.rotations).filter(page => this.rotations[page]);
    if (!changed.length) throw this.userError('Drehe zuerst mindestens eine Seite.');
    const document = await PDFLib.PDFDocument.create(); const pages = await document.copyPages(this.files[0].pdfLib, this.files[0].pdfLib.getPageIndices());
    pages.forEach((page, index) => { const delta = this.rotations[index + 1] || 0; if (delta) page.setRotation(PDFLib.degrees(core.normalizeRotation(page.getRotation().angle + delta))); document.addPage(page); });
    this.showDownload(await this.savePdf(document), core.safeBaseName(this.files[0].file.name) + '-gedreht.pdf', changed.length + ' Seite(n) wurden gedreht.');
  }

  async processReorder() {
    const original = Array.from({ length: this.pdfJs.numPages }, (_, index) => index + 1);
    if (this.pageOrder.every((page, index) => page === original[index])) throw this.userError('Die Seitenreihenfolge wurde noch nicht geändert.');
    const document = await PDFLib.PDFDocument.create(); const pages = await document.copyPages(this.files[0].pdfLib, this.pageOrder.map(page => page - 1)); pages.forEach(page => document.addPage(page));
    this.showDownload(await this.savePdf(document), core.safeBaseName(this.files[0].file.name) + '-neu-angeordnet.pdf', 'Die PDF wurde in der gewählten Seitenreihenfolge erzeugt.');
  }

  populateMetadata() {
    const doc = this.files[0].pdfLib; if (!doc) return;
    const values = { title: doc.getTitle(), author: doc.getAuthor(), subject: doc.getSubject(), keywords: doc.getKeywords(), creator: doc.getCreator(), producer: doc.getProducer(), creationDate: doc.getCreationDate(), modificationDate: doc.getModificationDate() };
    Object.entries(values).forEach(([name,value]) => { const input = this.getField(name); if (input) input.value = value instanceof Date && !Number.isNaN(value.getTime()) ? value.toISOString().slice(0,16) : value || ''; });
  }

  async processMetadata() {
    const document = await PDFLib.PDFDocument.load(this.bytes, { updateMetadata: false }); const clear = this.controls.dataset.clearMetadata === 'true';
    const raw = {}; this.controls.querySelectorAll('[data-field]').forEach(input => { raw[input.dataset.field] = input.value; });
    const values = core.metadataValues(raw, clear);
    if (clear) {
      const infoRef = document.context.trailerInfo.Info; const info = infoRef && document.context.lookup(infoRef);
      if (info && typeof info.delete === 'function') ['Title','Author','Subject','Keywords','Creator','Producer','CreationDate','ModDate'].forEach(key => info.delete(PDFLib.PDFName.of(key)));
    } else {
      document.setTitle(values.title); document.setAuthor(values.author); document.setSubject(values.subject); document.setKeywords(values.keywords ? values.keywords.split(/[,;]\s*/) : []); document.setCreator(values.creator); document.setProducer(values.producer);
      if (values.creationDate) document.setCreationDate(values.creationDate); if (values.modificationDate) document.setModificationDate(values.modificationDate);
    }
    this.showDownload(await this.savePdf(document), core.safeBaseName(this.files[0].file.name) + '-metadaten.pdf', clear ? 'Unterstützte Standard-Metadaten wurden entfernt.' : 'Standard-Metadaten wurden aktualisiert.');
  }

  async renderPage(pageNumber, scale, format, quality) {
    const page = await this.pdfJs.getPage(pageNumber); const viewport = page.getViewport({ scale });
    const canvas = create('canvas'); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext('2d', { alpha: format === 'png' });
    if (format !== 'png') { context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); }
    await page.render({ canvasContext: context, viewport, annotationMode: pdfjsLib.AnnotationMode.DISABLE }).promise;
    const mime = format === 'jpg' || format === 'jpeg' ? 'image/jpeg' : 'image/' + format;
    const blob = await canvasToBlob(canvas, mime, quality); const dimensions = { width: canvas.width, height: canvas.height };
    canvas.width = 1; canvas.height = 1; page.cleanup();
    return { blob, dimensions };
  }

  async processCompression() {
    const mode = core.compressionMode(this.getField('compressionMode').value); const document = await PDFLib.PDFDocument.create();
    for (let pageNumber = 1; pageNumber <= this.pdfJs.numPages; pageNumber += 1) {
      this.setProgress(pageNumber, this.pdfJs.numPages, pageNumber + ' von ' + this.pdfJs.numPages + ' Seiten werden rasterisiert …');
      const rendered = await this.renderPage(pageNumber, mode.scale, 'jpeg', mode.quality); const bytes = new Uint8Array(await rendered.blob.arrayBuffer()); const image = await document.embedJpg(bytes);
      const sourcePage = await this.pdfJs.getPage(pageNumber); const viewport = sourcePage.getViewport({ scale: 1 }); const page = document.addPage([viewport.width, viewport.height]); page.drawImage(image, { x: 0, y: 0, width: viewport.width, height: viewport.height }); sourcePage.cleanup();
    }
    const blob = await this.savePdf(document); const report = core.compressionReport(this.files[0].file.size, blob.size);
    const message = 'Original: ' + core.formatBytes(report.original) + ' · Ergebnis: ' + core.formatBytes(report.result) + ' · Differenz: ' + core.formatBytes(Math.abs(report.difference)) + ' (' + Math.abs(report.percent).toFixed(1).replace('.', ',') + ' %)';
    if (!report.smaller) { this.showDownload(blob, core.safeBaseName(this.files[0].file.name) + '-rasterisiert.pdf', message + '. Das Ergebnis ist nicht kleiner; der Download bleibt zum bewussten Vergleich verfügbar.', true); }
    else this.showDownload(blob, core.safeBaseName(this.files[0].file.name) + '-komprimiert.pdf', message + ' kleiner.');
  }

  async imageObjectBlob(image) {
    const canvas = create('canvas'); canvas.width = image.width || (image.bitmap && image.bitmap.width); canvas.height = image.height || (image.bitmap && image.bitmap.height);
    if (!canvas.width || !canvas.height) throw new Error('image'); const context = canvas.getContext('2d');
    if (image.bitmap) context.drawImage(image.bitmap, 0, 0);
    else if (image.data) {
      const pixels = canvas.width * canvas.height; let rgba;
      if (image.data.length === pixels * 4) rgba = new Uint8ClampedArray(image.data);
      else if (image.data.length === pixels * 3) { rgba = new Uint8ClampedArray(pixels * 4); for (let i = 0, j = 0; i < image.data.length; i += 3, j += 4) { rgba[j] = image.data[i]; rgba[j+1] = image.data[i+1]; rgba[j+2] = image.data[i+2]; rgba[j+3] = 255; } }
      else throw new Error('image');
      context.putImageData(new ImageData(rgba, canvas.width, canvas.height), 0, 0);
    } else throw new Error('image');
    const blob = await canvasToBlob(canvas, 'image/png'); canvas.width = 1; canvas.height = 1; return blob;
  }

  async processEmbeddedImages() {
    const outputs = []; const seen = new Set(); const ops = pdfjsLib.OPS;
    for (let pageNumber = 1; pageNumber <= this.pdfJs.numPages; pageNumber += 1) {
      this.setProgress(pageNumber, this.pdfJs.numPages, 'Seite ' + pageNumber + ' von ' + this.pdfJs.numPages + ' wird analysiert …');
      const page = await this.pdfJs.getPage(pageNumber); const list = await page.getOperatorList({ annotationMode: pdfjsLib.AnnotationMode.DISABLE });
      for (let index = 0; index < list.fnArray.length; index += 1) {
        const fn = list.fnArray[index]; let image; let identity;
        try {
          if (fn === ops.paintInlineImageXObject) { image = list.argsArray[index][0]; identity = 'inline-' + pageNumber + '-' + index; }
          else if (fn === ops.paintImageXObject) { const name = list.argsArray[index][0]; identity = pageNumber + '-' + name; image = await new Promise(resolve => page.objs.get(name, resolve)); }
          else continue;
          if (seen.has(identity)) continue; seen.add(identity);
          const blob = await this.imageObjectBlob(image); outputs.push({ blob, name: core.safeBaseName(this.files[0].file.name) + '-seite-' + String(pageNumber).padStart(3,'0') + '-bild-' + String(outputs.length + 1).padStart(3,'0') + '.png', page: pageNumber, width: image.width || image.bitmap.width, height: image.height || image.bitmap.height });
        } catch (error) { /* Unsupported PDF image representation is intentionally skipped. */ }
      }
      page.cleanup();
    }
    if (!outputs.length) throw this.userError('Es wurden keine unterstützten, rekonstruierbaren eingebetteten Bildobjekte gefunden. Die PDF kann dennoch Masken oder komplexe Bildressourcen enthalten.');
    await this.showImageBatch(outputs, core.safeBaseName(this.files[0].file.name) + '-bilder.zip');
  }

  async decodeImage(entry) {
    if (entry.file.type === 'image/jpeg' || /\.jpe?g$/i.test(entry.file.name)) return { type: 'jpeg', bytes: new Uint8Array(await entry.file.arrayBuffer()), width: entry.width, height: entry.height };
    if (entry.file.type === 'image/png' || /\.png$/i.test(entry.file.name)) return { type: 'png', bytes: new Uint8Array(await entry.file.arrayBuffer()), width: entry.width, height: entry.height };
    let image;
    if ('createImageBitmap' in window) image = await createImageBitmap(entry.file);
    else { image = new Image(); image.src = await blobToDataUrl(entry.file); await image.decode(); }
    const canvas = create('canvas'); canvas.width = entry.width; canvas.height = entry.height; canvas.getContext('2d').drawImage(image, 0, 0);
    const blob = await canvasToBlob(canvas, 'image/png'); canvas.width = 1; canvas.height = 1;
    if (image.close) image.close();
    return { type: 'png', bytes: new Uint8Array(await blob.arrayBuffer()), width: entry.width, height: entry.height };
  }

  async processImagesToPdf() {
    const document = await PDFLib.PDFDocument.create(); const preset = this.getField('imagePageSize').value; const orientation = this.getField('orientation').value; const margin = this.getField('margin').value;
    for (let index = 0; index < this.files.length; index += 1) {
      this.setProgress(index + 1, this.files.length, (index + 1) + ' von ' + this.files.length + ' Bildern werden eingebettet …');
      const decoded = await this.decodeImage(this.files[index]); const settings = core.imagePdfSettings(decoded.width, decoded.height, preset, orientation, margin); if (settings.error) throw this.userError(settings.error);
      const embedded = decoded.type === 'jpeg' ? await document.embedJpg(decoded.bytes) : await document.embedPng(decoded.bytes); const page = document.addPage([settings.pageWidth, settings.pageHeight]); page.drawImage(embedded, { x: settings.x, y: settings.y, width: settings.width, height: settings.height });
    }
    this.showDownload(await this.savePdf(document), 'bilder.pdf', this.files.length + ' Bild(er) wurden als PDF-Seiten erzeugt.');
  }

  async showPageSizes() {
    const sizes = [];
    for (let page = 1; page <= this.pdfJs.numPages; page += 1) { const proxy = await this.pdfJs.getPage(page); const view = proxy.getViewport({ scale: 1 }); sizes.push(Math.round(view.width * 25.4 / 72) + ' × ' + Math.round(view.height * 25.4 / 72) + ' mm'); proxy.cleanup(); }
    const unique = Array.from(new Set(sizes)); this.pageInfo.textContent = unique.length === 1 ? 'Aktuell: ' + unique[0] : 'Aktuell verwendete Größen: ' + unique.join(', ');
  }

  async processResize() {
    const target = core.resolvePageSize(this.getField('pageSize').value, this.getField('customWidth').value, this.getField('customHeight').value, 'auto'); if (target.error) throw this.userError(target.error);
    const selected = this.selected.size ? this.selected : new Set(core.selectPages('all', this.pdfJs.numPages));
    const document = await PDFLib.PDFDocument.load(this.bytes, { updateMetadata: false });
    document.getPages().forEach((page, index) => {
      if (!selected.has(index + 1)) return; const width = page.getWidth(); const height = page.getHeight(); const fit = core.fitRectangle(width, height, target.width, target.height, 0);
      page.scaleContent(fit.scale, fit.scale); page.translateContent(fit.x, fit.y); page.setSize(target.width, target.height);
    });
    this.showDownload(await this.savePdf(document), core.safeBaseName(this.files[0].file.name) + '-seitengroesse.pdf', selected.size + ' Seite(n) wurden proportional auf ' + Math.round(target.width * 25.4 / 72) + ' × ' + Math.round(target.height * 25.4 / 72) + ' mm eingepasst.');
  }

  async processPdfToImages() {
    const pages = this.selected.size ? Array.from(this.selected).sort((a,b) => a-b) : core.selectPages('all', this.pdfJs.numPages);
    const settings = core.imageExportSettings(this.getField('imageFormat').value, Number(this.getField('imageScale').value), Number(this.getField('imageQuality').value) / 100); if (settings.error) throw this.userError(settings.error);
    if (settings.format === 'webp') { const test = create('canvas').toDataURL('image/webp'); if (!test.startsWith('data:image/webp')) throw this.userError('Dieser Browser unterstützt keinen WebP-Export. Wähle PNG oder JPEG.'); }
    const outputs = [];
    for (let index = 0; index < pages.length; index += 1) {
      const page = pages[index]; this.setProgress(index + 1, pages.length, (index + 1) + ' von ' + pages.length + ' Seiten werden gerendert …');
      const rendered = await this.renderPage(page, settings.scale, settings.format, settings.quality); outputs.push({ blob: rendered.blob, name: core.pageImageFilename(this.files[0].file.name, page, this.pdfJs.numPages, settings.extension), page, width: rendered.dimensions.width, height: rendered.dimensions.height });
    }
    await this.showImageBatch(outputs, core.safeBaseName(this.files[0].file.name) + '-seitenbilder.zip');
  }

  showDownload(blob, filename, message, warning) {
    const url = URL.createObjectURL(blob); this.urls.push(url); this.resultPanel.hidden = false; this.resultContent.replaceChildren();
    const card = create('article', 'result-card'); card.append(create('strong', '', filename), create('span', '', core.formatBytes(blob.size)), create('p', warning ? 'notice-inline' : 'tool-help', message));
    const link = create('a', 'button button-primary', 'Herunterladen'); link.href = url; link.download = filename; card.append(link); this.resultContent.append(card); this.setStatus('Ergebnis ist zum Download bereit.');
  }

  async showBatch(outputs, zipName) {
    if (outputs.length === 1) return this.showDownload(outputs[0].blob, outputs[0].name, 'Eine Ausgabedatei wurde erzeugt.');
    this.setStatus('ZIP wird erstellt …'); const zip = new JSZip(); outputs.forEach(item => zip.file(item.name, item.blob));
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } }, metadata => this.setProgress(metadata.percent, 100, 'ZIP wird erstellt: ' + Math.round(metadata.percent) + ' %'));
    this.showDownload(blob, zipName, outputs.length + ' Dateien sind im lokalen ZIP enthalten.');
    const list = create('ul', 'generated-files'); outputs.forEach(item => list.append(create('li', '', item.name + ' · ' + core.formatBytes(item.blob.size)))); this.resultContent.append(list);
  }

  async showImageBatch(outputs, zipName) {
    this.clearResults(); this.resultPanel.hidden = false; this.resultContent.replaceChildren();
    const grid = create('div', 'image-result-grid');
    for (let index = 0; index < outputs.length; index += 1) {
      const item = outputs[index]; const url = URL.createObjectURL(item.blob); this.urls.push(url); const card = create('article', 'image-result-card'); const image = create('img'); image.src = (await imageThumbnail(item.blob)).dataUrl; image.alt = item.page ? 'Extrahiertes Bild von Seite ' + item.page : 'Erzeugtes Seitenbild';
      const link = create('a', 'button button-secondary', 'Einzeln herunterladen'); link.href = url; link.download = item.name;
      card.append(image, create('strong', '', item.name), create('span', '', item.width + ' × ' + item.height + ' px · ' + core.formatBytes(item.blob.size)));
      if (this.name === 'extract-images') {
        const choice = checkbox('Für ZIP auswählen', 'image-' + index, true); choice.querySelector('input').dataset.imageIndex = String(index); card.append(choice);
      }
      card.append(link); grid.append(card);
    }
    this.resultContent.append(grid);
    if (outputs.length > 1) {
      if (this.name === 'extract-images') {
        const actions = create('div', 'tool-actions'); const all = button('Alle auswählen'); const none = button('Auswahl aufheben'); const zipButton = button('Auswahl als ZIP vorbereiten', '', true);
        all.addEventListener('click', () => grid.querySelectorAll('[data-image-index]').forEach(input => { input.checked = true; }));
        none.addEventListener('click', () => grid.querySelectorAll('[data-image-index]').forEach(input => { input.checked = false; }));
        zipButton.addEventListener('click', async () => {
          const selected = Array.from(grid.querySelectorAll('[data-image-index]:checked')).map(input => outputs[Number(input.dataset.imageIndex)]);
          if (!selected.length) return this.setError('Wähle mindestens ein Bild für das ZIP aus.');
          zipButton.disabled = true; this.setError(''); this.setStatus('ZIP wird erstellt …');
          try {
            const zip = new JSZip(); selected.forEach(item => zip.file(item.name, item.blob)); const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } }); const url = URL.createObjectURL(blob); this.urls.push(url);
            const link = create('a', 'button button-primary', 'ZIP herunterladen'); link.href = url; link.download = zipName; actions.append(link); this.setStatus(selected.length + ' Bild(er) wurden lokal als ZIP verpackt.');
          } catch (error) { this.setError('Das ZIP konnte nicht erzeugt werden. Möglicherweise reicht der Browser-Arbeitsspeicher nicht aus.'); }
          finally { zipButton.disabled = false; }
        });
        actions.append(all, none, zipButton); this.resultContent.prepend(actions);
      } else {
        this.setStatus('ZIP wird erstellt …'); const zip = new JSZip(); outputs.forEach(item => zip.file(item.name, item.blob)); const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } }); const url = URL.createObjectURL(blob); this.urls.push(url);
        const link = create('a', 'button button-primary', 'Alle als ZIP herunterladen'); link.href = url; link.download = zipName; this.resultContent.prepend(link);
      }
    }
    this.setStatus(outputs.length + ' Bild(er) sind zum Download bereit.');
  }

  clearResults() { this.urls.forEach(url => URL.revokeObjectURL(url)); this.urls = []; if (this.resultPanel) { this.resultPanel.hidden = true; this.resultContent.replaceChildren(); } }

  async clearDocuments() {
    this.generation += 1; this.clearResults();
    if (this.thumbnailObserver) this.thumbnailObserver.disconnect();
    this.thumbnailObserver = null;
    this.thumbnailRenderTasks.forEach(task => task.cancel());
    this.thumbnailRenderTasks.clear();
    if (this.loadingTask) { try { await this.loadingTask.destroy(); } catch (error) { /* already destroyed */ } }
    this.loadingTask = null; this.pdfJs = null; this.bytes = null; this.files = []; this.selected.clear(); this.rotations = {}; this.pageOrder = []; this.password = ''; this.pendingPasswordFile = null;
    const passwordInput = this.getField('password'); if (passwordInput) passwordInput.value = '';
  }

  async reset() {
    await this.clearDocuments(); this.fileInput.value = ''; this.fileList.replaceChildren(); this.controls.hidden = true; this.thumbnailPanel.hidden = true; this.thumbnailGrid.replaceChildren(); this.passwordWrap.hidden = true;
    this.controls.querySelectorAll('input, textarea').forEach(input => { input.value = input.type === 'range' ? '88' : ''; });
    const splitEvery = this.getField('splitEvery'); if (splitEvery) splitEvery.value = '2';
    this.controls.querySelectorAll('select').forEach(select => { select.selectedIndex = 0; select.dispatchEvent(new Event('change')); }); delete this.controls.dataset.clearMetadata;
    this.setError(''); this.setStatus(''); this.progress.hidden = true; this.updateActionState(); this.dropZone.focus();
  }
}

function showInitializationError(root, error) {
  root.replaceChildren();
  const panel = create('section', 'tool-panel pdf-app-fallback');
  panel.setAttribute('role', 'alert');
  panel.append(
    create('h2', '', 'PDF-Werkzeug nicht verfügbar'),
    create('p', '', 'Das PDF-Werkzeug konnte nicht geladen werden. Bitte lade die Seite neu. Falls der Fehler weiterhin auftritt, prüfe die Browser-Konsole.')
  );
  root.append(panel);
  console.error('StylePanda PDF Tools: Initialisierung fehlgeschlagen.', error);
}

function initializePdfTools() {
  document.querySelectorAll('[data-pdf-tool]').forEach(root => {
    try {
      if (!core || !PDFLib || !JSZip) throw new Error('Lokale PDF-Komponente fehlt.');
      root.replaceChildren();
      new PdfToolApp(root);
      root.dataset.pdfToolInitialized = 'true';
    } catch (error) {
      showInitializationError(root, error);
    }
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initializePdfTools, { once: true });
else initializePdfTools();
