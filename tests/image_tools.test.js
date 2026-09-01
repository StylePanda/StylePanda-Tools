'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const core = require('../assets/js/image-tools-core.js');

let assertions = 0;
function equal(actual, expected, label) { assertions += 1; assert.deepStrictEqual(actual, expected, label); }
function ok(value, label) { assertions += 1; assert.ok(value, label); }

equal(core.detectMime(Uint8Array.from([0xff,0xd8,0xff,0,0,0,0,0,0,0,0,0])), 'image/jpeg', 'JPEG-Signatur');
equal(core.detectMime(Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,0])), 'image/png', 'PNG-Signatur');
equal(core.detectMime(Uint8Array.from([82,73,70,70,0,0,0,0,87,69,66,80])), 'image/webp', 'WebP-Signatur');
equal(core.detectMime(Uint8Array.from([71,73,70,56,57,97,0,0,0,0,0,0])), '', 'GIF nicht unterstützt');
ok(core.validateImageFile({ name: 'foto.jpg', type: 'image/jpeg' }, Uint8Array.from([0xff,0xd8,0xff,0,0,0,0,0,0,0,0,0])).ok, 'Gültiges JPEG');
ok(!core.validateImageFile({ name: '<b>.png', type: 'image/png' }, Uint8Array.from([0xff,0xd8,0xff,0,0,0,0,0,0,0,0,0])).ok, 'MIME-/Signatur-Konflikt');
equal(core.validateImageFile({ name: 'falsch.png', type: 'image/png' }, Uint8Array.from([0xff,0xd8,0xff,0,0,0,0,0,0,0,0,0])).code, 'signature_mismatch', 'Signaturkonflikt kategorisiert');
equal(core.validateImageFile({ name: 'kaputt.png', type: 'image/png' }, Uint8Array.from([1,2,3,4,5,6,7,8,9,10,11,12])).code, 'invalid_signature', 'Ungültige Signatur kategorisiert');
equal(core.validateImageFile({ name: 'bild.gif', type: 'image/gif' }, Uint8Array.from([71,73,70,56,57,97,0,0,0,0,0,0])).code, 'unsupported_format', 'Nicht unterstütztes Format kategorisiert');
equal(core.safeBaseName('../../ böse <bild>.png'), '..-..-böse-bild', 'Sicherer Dateiname');
equal(core.aspectDimensions(400, 200, 'width', 100), { width: 100, height: 50 }, 'Seitenverhältnis bei Breite');
equal(core.aspectDimensions(400, 200, 'height', 100), { width: 200, height: 100 }, 'Seitenverhältnis bei Höhe');
equal(core.rotatedDimensions(400, 200, 90), { width: 200, height: 400 }, '90-Grad-Abmessungen');
equal(core.rotatedDimensions(400, 200, 180), { width: 400, height: 200 }, '180-Grad-Abmessungen');
equal(core.rgbaToHex(255, 0, 128), '#FF0080', 'RGB zu HEX');
equal(core.rgbToHsl(255, 0, 0), { h: 0, s: 100, l: 50 }, 'Rot zu HSL');
equal(core.fitRectangle(400, 200, 100, 100, 'contain'), { x: 0, y: 25, width: 100, height: 50 }, 'Contain-Einpassung');
equal(core.fitRectangle(400, 200, 100, 100, 'cover'), { x: -50, y: 0, width: 200, height: 100 }, 'Cover-Einpassung');
ok(Boolean(core.canvasError(20000, 100)), 'Zu breite Canvas abgelehnt');
ok(Boolean(core.canvasError(10000, 10000)), 'Zu viele Pixel abgelehnt');
equal(core.canvasError(1920, 1080), '', 'Normale Canvas akzeptiert');
equal(core.readExif(new ArrayBuffer(20)), {}, 'Bild ohne EXIF liefert keine erfundenen Metadaten');
equal(core.savedPercent(1000, 750), 25, 'Einsparung berechnet');

const app = fs.readFileSync(path.join(__dirname, '../assets/js/image-tools-app.js'), 'utf8');
const application = app + '\n' + fs.readFileSync(path.join(__dirname, '../assets/js/image-tools-core.js'), 'utf8');
for (const pattern of [/\bfetch\s*\(/, /XMLHttpRequest/, /WebSocket/, /sendBeacon/, /FormData/, /https?:\/\//, /\.innerHTML\s*=/, /\beval\s*\(/]) ok(!pattern.test(application), `Verbotenes Bild-Anwendungsmuster: ${pattern}`);
ok(app.includes('URL.revokeObjectURL'), 'Objekt-URLs werden widerrufen');
ok(app.includes('canvas.toBlob'), 'Canvas kodiert lokal in Blob');
ok(app.includes('createImageBitmap(file'), 'Produktionsdecoder liest den ursprünglichen File/Blob direkt');
ok(app.includes('readAsDataURL(file)'), 'CSP-kompatibler Image-Fallback vorhanden');
ok(!app.includes('makeUrl(file)'), 'Bilddecodierung hängt nicht von einer blob:-Bildquelle ab');
ok(app.includes('requestAnimationFrame'), 'Stapelverarbeitung gibt UI-Zeit frei');
ok(app.includes("compression: 'DEFLATE'"), 'Lokales ZIP wird erzeugt');

const productionServer = fs.readFileSync(path.join(__dirname, 'production_like_server.js'), 'utf8');
ok(productionServer.includes("img-src 'self' data:"), 'Produktionsnahe enge Bild-CSP bleibt aktiv');
ok(!productionServer.includes("img-src 'self' data: blob:"), 'Fix benötigt keine zusätzliche blob:-CSP-Freigabe');

const css = fs.readFileSync(path.join(__dirname, '../assets/css/main.css'), 'utf8');
ok(app.includes('class="image-result-layout"'), 'Bild-Ergebnis nutzt eine eigene Shared-Layoutklasse');
ok(css.includes('.image-result-layout { display: grid;'), 'Shared-Ergebnis besitzt ein explizites Grid');
ok(css.includes('grid-template-columns: minmax(260px, .9fr) minmax(390px, 1.2fr) minmax(180px, auto)'), 'Desktop verteilt Vorschau, Metriken und Download bewusst');
ok(css.includes('.image-result-layout .stat-card strong'), 'Metrik-Umbruch ist lokal auf Bild-Ergebnisse begrenzt');

console.log(`IMAGE-TOOLS-TESTS ERFOLGREICH: ${assertions} Prüfungen`);
