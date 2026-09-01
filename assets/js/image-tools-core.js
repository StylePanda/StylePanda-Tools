(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.StylePandaImageCore = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var MIME = { jpeg: 'image/jpeg', jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
  var EXTENSION = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  var MAX_CANVAS_DIMENSION = 16384;
  var MAX_CANVAS_PIXELS = 67108864;

  function clamp(value, minimum, maximum) { return Math.min(maximum, Math.max(minimum, value)); }
  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return '–';
    if (bytes < 1024) return bytes + ' B';
    var units = ['KB', 'MB', 'GB']; var value = bytes / 1024; var unit = units[0];
    for (var index = 1; value >= 1024 && index < units.length; index += 1) { value /= 1024; unit = units[index]; }
    return value.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' ' + unit;
  }
  function safeBaseName(name) {
    var value = String(name || 'bild').replace(/\.[^.]*$/, '').normalize('NFKC').replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^-+|-+$/g, '');
    return (value || 'bild').slice(0, 90);
  }
  function mimeFromFile(file) {
    var declared = String(file && file.type || '').toLowerCase();
    if (EXTENSION[declared]) return declared;
    var extension = String(file && file.name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
    return extension && MIME[extension[1]] || '';
  }
  function detectMime(bytes) {
    if (!bytes || bytes.length < 12) return '';
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return 'image/png';
    if (String.fromCharCode.apply(null, Array.prototype.slice.call(bytes, 0, 4)) === 'RIFF' && String.fromCharCode.apply(null, Array.prototype.slice.call(bytes, 8, 12)) === 'WEBP') return 'image/webp';
    return '';
  }
  function validateImageFile(file, bytes) {
    var claimed = mimeFromFile(file); var detected = detectMime(bytes);
    if (!claimed) return { ok: false, mime: '', code: 'unsupported_format', error: 'Dieses Format wird nicht unterstützt. Bitte verwende JPEG, PNG oder WebP.' };
    if (!detected) return { ok: false, mime: '', code: 'invalid_signature', error: 'Die Datei besitzt keine gültige JPEG-, PNG- oder WebP-Signatur.' };
    if (claimed !== detected) return { ok: false, mime: '', code: 'signature_mismatch', error: 'Dateityp und Dateiinhalt stimmen nicht überein.' };
    return { ok: true, mime: detected, code: '', error: '' };
  }
  function canvasError(width, height) {
    width = Math.round(Number(width)); height = Math.round(Number(height));
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) return 'Breite und Höhe müssen positive ganze Zahlen sein.';
    if (width > MAX_CANVAS_DIMENSION || height > MAX_CANVAS_DIMENSION || width * height > MAX_CANVAS_PIXELS) return 'Die gewählten Abmessungen sind für eine zuverlässige Browser-Verarbeitung zu groß. Bitte verkleinere Breite oder Höhe.';
    return '';
  }
  function aspectDimensions(width, height, changed, value) {
    width = Number(width); height = Number(height); value = Math.round(Number(value));
    if (!(width > 0 && height > 0 && value > 0)) return null;
    return changed === 'width' ? { width: value, height: Math.max(1, Math.round(value * height / width)) } : { width: Math.max(1, Math.round(value * width / height)), height: value };
  }
  function fitRectangle(sourceWidth, sourceHeight, targetWidth, targetHeight, mode) {
    var scale = mode === 'cover' ? Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight) : Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
    var width = sourceWidth * scale; var height = sourceHeight * scale;
    return { x: (targetWidth - width) / 2, y: (targetHeight - height) / 2, width: width, height: height };
  }
  function rotatedDimensions(width, height, rotation) { return Math.abs(Number(rotation)) % 180 === 90 ? { width: height, height: width } : { width: width, height: height }; }
  function rgbaToHex(red, green, blue) { return '#' + [red, green, blue].map(function (value) { return clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0'); }).join('').toUpperCase(); }
  function rgbToHsl(red, green, blue) {
    red /= 255; green /= 255; blue /= 255;
    var maximum = Math.max(red, green, blue); var minimum = Math.min(red, green, blue); var hue = 0; var saturation = 0; var lightness = (maximum + minimum) / 2; var delta = maximum - minimum;
    if (delta) {
      saturation = lightness > .5 ? delta / (2 - maximum - minimum) : delta / (maximum + minimum);
      if (maximum === red) hue = ((green - blue) / delta + (green < blue ? 6 : 0));
      else if (maximum === green) hue = ((blue - red) / delta + 2);
      else hue = ((red - green) / delta + 4);
      hue /= 6;
    }
    return { h: Math.round(hue * 360), s: Math.round(saturation * 100), l: Math.round(lightness * 100) };
  }
  function ratioLabel(width, height) {
    function gcd(a, b) { while (b) { var next = a % b; a = b; b = next; } return a; }
    var divisor = gcd(Math.round(width), Math.round(height));
    var left = Math.round(width) / divisor; var right = Math.round(height) / divisor;
    return left <= 100 && right <= 100 ? left + ':' + right : (width / height).toLocaleString('de-DE', { maximumFractionDigits: 2 }) + ':1';
  }
  function savedPercent(original, result) { return original > 0 ? Math.round((original - result) / original * 1000) / 10 : 0; }

  function readExif(arrayBuffer) {
    var result = {}; var bytes = new Uint8Array(arrayBuffer || new ArrayBuffer(0));
    if (detectMime(bytes) !== 'image/jpeg') return result;
    var view = new DataView(arrayBuffer); var offset = 2;
    try {
      while (offset + 4 <= view.byteLength) {
        if (view.getUint8(offset) !== 0xff) break;
        var marker = view.getUint8(offset + 1); var length = view.getUint16(offset + 2, false);
        if (marker === 0xe1 && length >= 8 && offset + 2 + length <= view.byteLength && view.getUint32(offset + 4, false) === 0x45786966 && view.getUint16(offset + 8, false) === 0) {
          parseTiff(view, offset + 10, result); break;
        }
        if (length < 2) break; offset += length + 2;
      }
    } catch (error) { result.error = 'EXIF-Daten konnten nicht vollständig gelesen werden.'; }
    return result;
  }
  function parseTiff(view, base, result) {
    var little = view.getUint16(base, false) === 0x4949;
    if (!little && view.getUint16(base, false) !== 0x4d4d) return;
    if (view.getUint16(base + 2, little) !== 42) return;
    var sizes = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
    function valueAt(entry, type, count) {
      var size = sizes[type]; if (!size || count < 1) return null;
      var start = size * count <= 4 ? entry + 8 : base + view.getUint32(entry + 8, little);
      if (start < base || start + size * count > view.byteLength) return null;
      if (type === 2) { var text = ''; for (var i = 0; i < count - 1 && view.getUint8(start + i); i += 1) text += String.fromCharCode(view.getUint8(start + i)); return text.trim(); }
      function one(at) {
        if (type === 1 || type === 7) return view.getUint8(at);
        if (type === 3) return view.getUint16(at, little);
        if (type === 4) return view.getUint32(at, little);
        if (type === 9) return view.getInt32(at, little);
        if (type === 5 || type === 10) { var numerator = type === 5 ? view.getUint32(at, little) : view.getInt32(at, little); var denominator = type === 5 ? view.getUint32(at + 4, little) : view.getInt32(at + 4, little); return denominator ? numerator / denominator : 0; }
        return null;
      }
      if (count === 1) return one(start);
      var values = []; for (var index = 0; index < count; index += 1) values.push(one(start + index * size)); return values;
    }
    function ifd(relative, tags, depth) {
      if (depth > 3 || !relative) return;
      var position = base + relative; if (position + 2 > view.byteLength) return;
      var count = view.getUint16(position, little); if (count > 256 || position + 2 + count * 12 > view.byteLength) return;
      for (var index = 0; index < count; index += 1) {
        var entry = position + 2 + index * 12; var tag = view.getUint16(entry, little); var type = view.getUint16(entry + 2, little); var amount = view.getUint32(entry + 4, little); var value = valueAt(entry, type, amount);
        if (tags[tag]) result[tags[tag]] = value;
        if (tag === 0x8769 && typeof value === 'number') ifd(value, EXIF_TAGS, depth + 1);
        if (tag === 0x8825 && typeof value === 'number') { var gps = {}; ifdGps(value, gps); if (gps.latitude !== undefined && gps.longitude !== undefined) result.gps = gps; }
      }
    }
    function ifdGps(relative, gps) {
      var position = base + relative; if (position + 2 > view.byteLength) return; var count = view.getUint16(position, little); if (count > 64 || position + 2 + count * 12 > view.byteLength) return;
      var raw = {};
      for (var index = 0; index < count; index += 1) { var entry = position + 2 + index * 12; var tag = view.getUint16(entry, little); raw[tag] = valueAt(entry, view.getUint16(entry + 2, little), view.getUint32(entry + 4, little)); }
      function degrees(value, ref) { if (!Array.isArray(value) || value.length < 3) return undefined; var decimal = value[0] + value[1] / 60 + value[2] / 3600; return ref === 'S' || ref === 'W' ? -decimal : decimal; }
      gps.latitude = degrees(raw[2], raw[1]); gps.longitude = degrees(raw[4], raw[3]);
    }
    var TIFF_TAGS = { 0x010f: 'make', 0x0110: 'model', 0x0112: 'orientation', 0x8769: '_exif', 0x8825: '_gps' };
    var EXIF_TAGS = { 0x829a: 'exposureTime', 0x829d: 'fNumber', 0x8827: 'iso', 0x9003: 'dateTaken', 0x920a: 'focalLength', 0xa002: 'pixelWidth', 0xa003: 'pixelHeight' };
    ifd(view.getUint32(base + 4, little), TIFF_TAGS, 0); delete result._exif; delete result._gps;
  }

  return { MIME: MIME, EXTENSION: EXTENSION, MAX_CANVAS_DIMENSION: MAX_CANVAS_DIMENSION, MAX_CANVAS_PIXELS: MAX_CANVAS_PIXELS, clamp: clamp, formatBytes: formatBytes, safeBaseName: safeBaseName, mimeFromFile: mimeFromFile, detectMime: detectMime, validateImageFile: validateImageFile, canvasError: canvasError, aspectDimensions: aspectDimensions, fitRectangle: fitRectangle, rotatedDimensions: rotatedDimensions, rgbaToHex: rgbaToHex, rgbToHsl: rgbToHsl, ratioLabel: ratioLabel, savedPercent: savedPercent, readExif: readExif };
}));
