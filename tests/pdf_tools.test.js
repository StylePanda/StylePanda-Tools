'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const core = require('../assets/js/pdf-tools-core.js');

let assertions = 0;
function equal(actual, expected, label) { assertions += 1; assert.deepStrictEqual(actual, expected, label); }
function ok(value, label) { assertions += 1; assert.ok(value, label); }
function close(actual, expected, tolerance, label) { assertions += 1; assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} ≠ ${expected}`); }

// Page range parser
equal(core.parsePageRange('1', 20), { pages: [1], error: '' }, 'Einzelseite');
equal(core.parsePageRange('1-5', 20).pages, [1,2,3,4,5], 'Bereich');
equal(core.parsePageRange('1-5,8,12-15', 20).pages, [1,2,3,4,5,8,12,13,14,15], 'Kombinierte Bereiche');
equal(core.parsePageRange(' 1 - 3 , 5 ', 10).pages, [1,2,3,5], 'Leerzeichen');
equal(core.parsePageRange('1,1,1-3,2', 10).pages, [1,2,3], 'Duplikate werden entfernt');
ok(Boolean(core.parsePageRange('0', 10).error), 'Seite 0');
ok(Boolean(core.parsePageRange('-1', 10).error), 'Negative/ungültige Syntax');
ok(Boolean(core.parsePageRange('abc', 10).error), 'Textsyntax');
ok(Boolean(core.parsePageRange('11', 10).error), 'Außerhalb des Dokuments');
ok(Boolean(core.parsePageRange('5-2', 10).error), 'Umgekehrter Bereich wird abgelehnt');
ok(Boolean(core.parsePageRange('', 10).error), 'Leerer Bereich');

// Selection
equal(core.selectPages('all', 5), [1,2,3,4,5], 'Alle Seiten');
equal(core.selectPages('none', 5), [], 'Keine Seiten');
equal(core.selectPages('odd', 6), [1,3,5], 'Ungerade Seiten');
equal(core.selectPages('even', 6), [2,4,6], 'Gerade Seiten');
equal(core.selectPages('current', 5, [4,2,2,8,1]), [1,2,4], 'Deterministisch, dedupliziert und im Bereich');

// Reordering keeps identity, including duplicate values.
equal(core.moveItem(['a','b','c'], 0, 1), ['b','a','c'], 'Erstes Element vorwärts');
equal(core.moveItem(['a','b','c'], 2, 1), ['a','c','b'], 'Letztes Element rückwärts');
equal(core.moveItem(['a','b'], -1, 1), ['a','b'], 'Ungültiger Start');
equal(core.moveItem(['a','b'], 0, 3), ['a','b'], 'Ungültiges Ziel');
equal(core.moveItem([1,2,3,4], 3, 0), [4,1,2,3], 'Vollständiges Verschieben');
equal(core.moveItem(['x','x','y'], 1, 2), ['x','y','x'], 'Doppelte Identität als Position behandelt');
const originalOrder = [1,2,3]; equal(core.moveItem(originalOrder, 0, 2), [2,3,1], 'Neue Reihenfolge'); equal(originalOrder, [1,2,3], 'Original bleibt unverändert');

// Rotation
equal(core.normalizeRotation(90), 90, '+90');
equal(core.normalizeRotation(-90), 270, '-90');
equal(core.normalizeRotation(180), 180, '180');
equal(core.normalizeRotation(450), 90, 'Modulo 360 positiv');
equal(core.normalizeRotation(-450), 270, 'Modulo 360 negativ');
let rotations = core.applyRotationMap({}, [1,3], 90); equal(rotations, {1:90,3:90}, 'Mehrere Seiten drehen');
rotations = core.applyRotationMap(rotations, [1], 180); equal(rotations[1], 270, 'Wiederholte Drehung');
rotations = core.applyRotationMap(rotations, [1], 90); equal(rotations[1], 0, 'Rotation zurück auf 0');

// Split logic
equal(core.splitGroups('ranges', 10, '1-3\n4-6').groups, [[1,2,3],[4,5,6]], 'Explizite Bereiche');
equal(core.splitGroups('each', 3, '').groups, [[1],[2],[3]], 'Jede Seite');
equal(core.splitGroups('every', 7, '3').groups, [[1,2,3],[4,5,6],[7]], 'Alle N mit kurzer Endgruppe');
ok(Boolean(core.splitGroups('every', 7, '0').error), 'Ungültiges N');
equal(core.splitGroups('every', 6, '2').groups.flat(), [1,2,3,4,5,6], 'Vollständige Seitenabdeckung');
equal(core.splitFilename('Mein Dokument.pdf', 2, 12), 'Mein-Dokument-teil-02.pdf', 'Deterministischer Teil-Dateiname');

// Metadata
let metadata = core.metadataValues({ title: '  Titel  ', author: '<b>Ada</b>', keywords: '' }, false);
equal(metadata.title, 'Titel', 'Metadaten trimmen');
equal(metadata.author, '<b>Ada</b>', 'Metadaten bleiben reiner Text und werden nicht interpretiert');
equal(metadata.keywords, '', 'Leerer Wert');
metadata = core.metadataValues({ title: 'Titel', creationDate: '2026-08-31T12:30' }, true);
equal(metadata.title, '', 'Metadaten löschen'); equal(metadata.creationDate, null, 'Datum löschen');
metadata = core.metadataValues({ creationDate: '2026-08-31T12:30', modificationDate: 'ungültig' }, false);
ok(metadata.creationDate instanceof Date, 'Gültiges Datum'); equal(metadata.modificationDate, null, 'Ungültiges Datum');

// Images to PDF
ok(core.isSupportedImage({ type: 'image/jpeg', name: 'a.bin' }), 'JPEG MIME');
ok(core.isSupportedImage({ type: '', name: 'bild.PNG' }), 'PNG Erweiterung');
ok(core.isSupportedImage({ type: 'image/webp', name: 'bild.webp' }), 'WebP');
ok(!core.isSupportedImage({ type: 'image/gif', name: 'bild.gif' }), 'Ungültiges Bildformat');
let imageSettings = core.imagePdfSettings(1200, 800, 'A4', 'portrait', 'small');
ok(!imageSettings.error, 'A4-Bildeinstellungen');
close(imageSettings.width / imageSettings.height, 1.5, 0.001, 'Seitenverhältnis bleibt erhalten');
close(imageSettings.x * 2 + imageSettings.width, imageSettings.pageWidth, 0.001, 'Horizontal zentriert');
imageSettings = core.imagePdfSettings(1200, 800, 'auto', 'auto', 'none');
close(imageSettings.pageWidth, 900, 0.001, 'Automatik bei 96 dpi – Breite');
close(imageSettings.pageHeight, 600, 0.001, 'Automatik bei 96 dpi – Höhe');
imageSettings = core.imagePdfSettings(1200, 800, 'A4', 'landscape', 'medium');
ok(imageSettings.pageWidth > imageSettings.pageHeight, 'Querformat');

// Page sizes and fitting
for (const preset of ['A3','A4','A5','Letter','Legal']) {
  const size = core.resolvePageSize(preset, null, null, 'portrait'); ok(!size.error && size.width > 0 && size.height > size.width, preset);
}
let custom = core.resolvePageSize('custom', 210, 297, 'auto'); close(custom.width, 595.276, 0.01, 'Benutzerdefinierte mm-Breite');
ok(Boolean(core.resolvePageSize('custom', 0, 100, 'auto').error), 'Nullbreite ungültig');
ok(Boolean(core.resolvePageSize('custom', -1, 100, 'auto').error), 'Negative Breite ungültig');
let fit = core.fitRectangle(1000, 500, 500, 500, 0); equal({width:fit.width,height:fit.height,x:fit.x,y:fit.y}, {width:500,height:250,x:0,y:125}, 'Proportional einpassen');
let landscape = core.resolvePageSize('A4', null, null, 'landscape'); ok(landscape.width > landscape.height, 'Preset Querformat');

// PDF-to-image settings
equal(core.imageExportSettings('png', 1, 0.5), { format:'png', scale:1, mime:'image/png', extension:'png', quality:null, error:'' }, 'PNG ohne Qualitätswert');
equal(core.imageExportSettings('jpeg', 1.5, 0.8).extension, 'jpg', 'JPEG');
equal(core.imageExportSettings('webp', 3, 0.7).mime, 'image/webp', 'WebP');
ok(Boolean(core.imageExportSettings('gif', 1, 0.8).error), 'Ungültiges Exportformat');
ok(Boolean(core.imageExportSettings('png', 4, 0.8).error), 'Ungültige Auflösung');
ok(Boolean(core.imageExportSettings('jpeg', 2, 2).error), 'Ungültige Qualität');
equal(core.pageImageFilename('Dokument.pdf', 2, 80, 'png'), 'Dokument-seite-002.png', 'Dateiname mit mindestens drei Stellen');
equal(core.pageImageFilename('Dokument.pdf', 2, 10000, 'jpg'), 'Dokument-seite-00002.jpg', 'Dateiname passend zur Seitenzahl');

// Compression configuration and reporting
equal(core.compressionMode('gentle'), { scale:1.5, quality:0.86, label:'Schonend' }, 'Schonender Modus');
equal(core.compressionMode('balanced'), { scale:1.25, quality:0.72, label:'Ausgewogen' }, 'Ausgewogener Modus');
equal(core.compressionMode('strong'), { scale:1, quality:0.56, label:'Stark' }, 'Starker Modus');
equal(core.compressionMode('unknown'), null, 'Ungültiger Modus');
let report = core.compressionReport(1000, 700); equal(report.difference, 300, 'Größendifferenz'); close(report.percent, 30, 0.001, 'Prozent kleiner'); ok(report.smaller, 'Kleiner erkannt');
report = core.compressionReport(1000, 1200); equal(report.difference, -200, 'Größeres Ergebnis'); close(report.percent, -20, 0.001, 'Prozent größer'); ok(!report.smaller, 'Größer erkannt');

// Validation helpers
ok(core.isPdfHeader(Uint8Array.from([37,80,68,70,45,49])), 'PDF-Signatur');
ok(!core.isPdfHeader(Uint8Array.from([80,68,70])), 'Falsche Signatur');
equal(core.safeBaseName('../../ böse <datei>.pdf'), '..-..-böse-datei', 'Sicherer lokaler Dateiname');
equal(core.formatBytes(1024), '1,0 KB', 'Dateigröße');

// Privacy/security audit targets application code, not PDF.js local asset loading.
const appSource = fs.readFileSync(path.join(__dirname, '../assets/js/pdf-tools-app.js'), 'utf8');
const coreSource = fs.readFileSync(path.join(__dirname, '../assets/js/pdf-tools-core.js'), 'utf8');
const applicationSource = appSource + '\n' + coreSource;
const forbidden = [/XMLHttpRequest/, /WebSocket/, /EventSource/, /sendBeacon/, /localStorage/, /sessionStorage/, /indexedDB/i, /document\.cookie/, /caches\.(?:open|match)/, /\beval\s*\(/, /new\s+Function\s*\(/, /document\.write/, /\.innerHTML\s*=/, /location\.(?:search|hash)\s*=/, /history\.(?:pushState|replaceState)/];
for (const pattern of forbidden) ok(!pattern.test(applicationSource), `Verbotenes Anwendungsmuster: ${pattern}`);
ok(!/\bfetch\s*\(/.test(applicationSource), 'Anwendung überträgt keine Nutzerdokumente per fetch');
ok(appSource.includes("getDocument(Object.assign({ data"), 'PDF.js erhält lokale Binärdaten statt einer Dokument-URL');
ok(appSource.includes('isEvalSupported: false'), 'PDF-Auswertung ist deaktiviert');
ok(appSource.includes("'/assets/vendor/pdfjs/pdf.worker.min.js'"), 'Worker ist gleichursprünglich und lokal');
ok(appSource.includes('showInitializationError'), 'Gemeinsame Initialisierung besitzt eine Fehlergrenze');
ok(appSource.includes('URL.revokeObjectURL'), 'Objekt-URLs werden widerrufen');
ok(!/https?:\/\//.test(applicationSource), 'Keine externen Anwendungsendpunkte');

console.log(`PDF-TOOLS-TESTS ERFOLGREICH: ${assertions} Prüfungen`);
