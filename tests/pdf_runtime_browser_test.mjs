import * as pdfjsLib from '/assets/vendor/pdfjs/pdf.min.mjs';

const result = document.querySelector('#result');
const keepAlive = setInterval(() => {}, 100);
try {
  result.textContent = 'MODULE';
  if (!window.PDFLib || !window.JSZip || !window.StylePandaPdfCore) throw new Error('Globale Bibliothek fehlt');
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/assets/vendor/pdfjs/pdf.worker.min.mjs';
  const source = await PDFLib.PDFDocument.create();
  const page = source.addPage([300, 200]);
  page.drawText('StylePanda PDF Runtime', { x: 30, y: 100, size: 18 });
  const bytes = await source.save();
  result.textContent = 'CREATED';
  if (!StylePandaPdfCore.isPdfHeader(bytes)) throw new Error('PDF-Signatur ungültig');
  const task = pdfjsLib.getDocument({
    data: bytes.slice(), isEvalSupported: false,
    cMapUrl: '/assets/vendor/pdfjs/cmaps/', cMapPacked: true,
    standardFontDataUrl: '/assets/vendor/pdfjs/standard_fonts/',
    wasmUrl: '/assets/vendor/pdfjs/wasm/'
  });
  const renderedDocument = await task.promise;
  result.textContent = 'PDFJS';
  const renderedPage = await renderedDocument.getPage(1);
  const operatorList = await renderedPage.getOperatorList({ annotationMode: pdfjsLib.AnnotationMode.DISABLE });
  result.textContent = 'OPS=' + operatorList.fnArray.length;
  const viewport = renderedPage.getViewport({ scale: 1 });
  const canvas = document.querySelector('#preview'); canvas.width = viewport.width; canvas.height = viewport.height;
  await renderedPage.render({ canvasContext: canvas.getContext('2d'), viewport, annotationMode: pdfjsLib.AnnotationMode.DISABLE }).promise;
  result.textContent = 'RENDERED';
  const copy = await PDFLib.PDFDocument.create();
  const loaded = await PDFLib.PDFDocument.load(bytes);
  const copied = await copy.copyPages(loaded, [0]); copy.addPage(copied[0]);
  const copiedBytes = await copy.save({ useObjectStreams: true });
  const zip = new JSZip(); zip.file('runtime.pdf', copiedBytes);
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  if (renderedDocument.numPages !== 1 || canvas.width !== 300 || canvas.height !== 200 || zipBlob.size < copiedBytes.length) throw new Error('Runtime-Ergebnis unplausibel');
  await task.destroy();
  result.textContent = 'PASS PDFJS=' + pdfjsLib.version + ' PDFLIB=1.17.1 JSZIP=3.10.1';
} catch (error) {
  result.textContent = 'FAIL ' + error.name + ': ' + error.message;
} finally {
  clearInterval(keepAlive);
}
