'use strict';

const assert = require('assert');
const PDFLib = require('../assets/vendor/pdf-lib/pdf-lib.min.js');
const JSZip = require('../assets/vendor/jszip/jszip.min.js');
const core = require('../assets/js/pdf-tools-core.js');

(async function () {
  let assertions = 0;
  function equal(actual, expected, label) { assertions += 1; assert.deepStrictEqual(actual, expected, label); }
  function ok(value, label) { assertions += 1; assert.ok(value, label); }

  const first = await PDFLib.PDFDocument.create();
  first.setTitle('Erstes Dokument');
  first.addPage([300, 200]).drawText('Seite 1');
  first.addPage([400, 300]).drawText('Seite 2');
  const second = await PDFLib.PDFDocument.create();
  second.addPage([500, 500]).drawText('Seite 3');

  const merged = await PDFLib.PDFDocument.create();
  for (const source of [first, second]) {
    const pages = await merged.copyPages(source, source.getPageIndices());
    pages.forEach(page => merged.addPage(page));
  }
  equal(merged.getPageCount(), 3, 'PDF-Merge übernimmt alle Seiten');

  const extracted = await PDFLib.PDFDocument.create();
  const extractedPages = await extracted.copyPages(merged, [0, 2]);
  extractedPages.forEach(page => extracted.addPage(page));
  equal(extracted.getPageCount(), 2, 'Seitenextraktion');
  equal(extracted.getPage(1).getWidth(), 500, 'Extraktionsreihenfolge');

  const rotated = await PDFLib.PDFDocument.create();
  const rotatedPages = await rotated.copyPages(merged, merged.getPageIndices());
  rotatedPages[1].setRotation(PDFLib.degrees(core.normalizeRotation(rotatedPages[1].getRotation().angle + 90)));
  rotatedPages.forEach(page => rotated.addPage(page));
  equal(rotated.getPage(1).getRotation().angle, 90, 'Seitendrehung');

  const reordered = await PDFLib.PDFDocument.create();
  const reorderedPages = await reordered.copyPages(merged, [2, 0, 1]);
  reorderedPages.forEach(page => reordered.addPage(page));
  equal(reordered.getPage(0).getWidth(), 500, 'Seitenreihenfolge');
  equal(reordered.getPage(1).getWidth(), 300, 'Weitere Seitenreihenfolge');

  const resizedPage = reordered.getPage(0);
  const target = core.resolvePageSize('A4', null, null, 'portrait');
  const fit = core.fitRectangle(resizedPage.getWidth(), resizedPage.getHeight(), target.width, target.height, 0);
  resizedPage.scaleContent(fit.scale, fit.scale); resizedPage.translateContent(fit.x, fit.y); resizedPage.setSize(target.width, target.height);
  ok(Math.abs(resizedPage.getWidth() - core.PAGE_SIZES.A4[0]) < 0.01, 'A4-Seitenbreite');

  merged.setAuthor('<Autor>'); merged.setSubject('Sicherer Text'); merged.setKeywords(['eins', 'zwei']);
  const saved = await merged.save({ useObjectStreams: true });
  ok(core.isPdfHeader(saved), 'Erzeugte Datei hat PDF-Signatur');
  const reloaded = await PDFLib.PDFDocument.load(saved, { updateMetadata: false });
  equal(reloaded.getPageCount(), 3, 'Gespeicherte PDF wieder ladbar');
  equal(reloaded.getAuthor(), '<Autor>', 'Metadaten bleiben Text');

  const pngBytes = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+Xf7LAAAAAElFTkSuQmCC', 'base64'));
  const imageDocument = await PDFLib.PDFDocument.create();
  const image = await imageDocument.embedPng(pngBytes); const imagePage = imageDocument.addPage([100, 100]); imagePage.drawImage(image, { x: 0, y: 0, width: 100, height: 100 });
  const imagePdf = await imageDocument.save(); ok(imagePdf.length > 100, 'PNG wird wirklich in PDF eingebettet');

  const zip = new JSZip(); zip.file('zusammengefuegt.pdf', saved); zip.file('bild.pdf', imagePdf);
  const zipBytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  ok(zipBytes[0] === 0x50 && zipBytes[1] === 0x4b, 'ZIP wird wirklich erzeugt');
  const loadedZip = await JSZip.loadAsync(zipBytes); equal(Object.keys(loadedZip.files).sort(), ['bild.pdf', 'zusammengefuegt.pdf'], 'ZIP-Dateien');

  console.log(`PDF-LIBRARY-INTEGRATION ERFOLGREICH: ${assertions} Prüfungen`);
}()).catch(error => { console.error(error); process.exit(1); });
