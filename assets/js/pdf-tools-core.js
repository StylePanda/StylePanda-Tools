(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.StylePandaPdfCore = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var PAGE_SIZES = {
    A3: [841.89, 1190.55], A4: [595.28, 841.89], A5: [419.53, 595.28],
    Letter: [612, 792], Legal: [612, 1008]
  };
  var IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
  var COMPRESSION_MODES = {
    gentle: { scale: 1.5, quality: 0.86, label: 'Schonend' },
    balanced: { scale: 1.25, quality: 0.72, label: 'Ausgewogen' },
    strong: { scale: 1, quality: 0.56, label: 'Stark' }
  };

  function parsePageRange(input, maximum) {
    var value = String(input == null ? '' : input).trim();
    if (!value) return { pages: [], error: 'Bitte gib mindestens eine Seite oder einen Seitenbereich ein.' };
    if (!Number.isInteger(maximum) || maximum < 1) return { pages: [], error: 'Die Seitenzahl des Dokuments ist ungültig.' };
    var result = new Set();
    var parts = value.split(',');
    for (var index = 0; index < parts.length; index += 1) {
      var part = parts[index].trim();
      if (!/^\d+(?:\s*-\s*\d+)?$/.test(part)) return { pages: [], error: 'Ungültige Seitenangabe: „' + part + '“.' };
      var bounds = part.split('-').map(function (item) { return Number(item.trim()); });
      var start = bounds[0];
      var end = bounds.length === 2 ? bounds[1] : start;
      if (start < 1 || end < 1) return { pages: [], error: 'Seite 0 und negative Seiten sind nicht erlaubt.' };
      if (start > end) return { pages: [], error: 'Umgekehrte Bereiche sind nicht erlaubt: „' + part + '“.' };
      if (end > maximum) return { pages: [], error: 'Seite ' + end + ' liegt außerhalb des Dokuments mit ' + maximum + ' Seiten.' };
      for (var page = start; page <= end; page += 1) result.add(page);
    }
    return { pages: Array.from(result).sort(function (a, b) { return a - b; }), error: '' };
  }

  function selectPages(mode, maximum, existing) {
    var current = new Set(existing || []);
    if (mode === 'none') return [];
    if (mode === 'all') return Array.from({ length: maximum }, function (_, index) { return index + 1; });
    if (mode === 'odd' || mode === 'even') {
      return Array.from({ length: maximum }, function (_, index) { return index + 1; })
        .filter(function (page) { return page % 2 === (mode === 'odd' ? 1 : 0); });
    }
    return Array.from(current).filter(function (page) { return page >= 1 && page <= maximum; }).sort(function (a, b) { return a - b; });
  }

  function moveItem(items, fromIndex, toIndex) {
    var copy = items.slice();
    if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex) || fromIndex < 0 || toIndex < 0 || fromIndex >= copy.length || toIndex >= copy.length || fromIndex === toIndex) return copy;
    var item = copy.splice(fromIndex, 1)[0];
    copy.splice(toIndex, 0, item);
    return copy;
  }

  function normalizeRotation(value) {
    return ((Number(value) % 360) + 360) % 360;
  }

  function applyRotationMap(rotations, pages, delta) {
    var result = Object.assign({}, rotations || {});
    pages.forEach(function (page) { result[page] = normalizeRotation((result[page] || 0) + delta); });
    return result;
  }

  function splitGroups(mode, maximum, value) {
    if (!Number.isInteger(maximum) || maximum < 1) return { groups: [], error: 'Das Dokument enthält keine gültigen Seiten.' };
    if (mode === 'each') return { groups: Array.from({ length: maximum }, function (_, index) { return [index + 1]; }), error: '' };
    if (mode === 'every') {
      var size = Number(value);
      if (!Number.isInteger(size) || size < 1) return { groups: [], error: 'Die Gruppengröße muss eine ganze Zahl größer als 0 sein.' };
      var groups = [];
      for (var start = 1; start <= maximum; start += size) groups.push(Array.from({ length: Math.min(size, maximum - start + 1) }, function (_, index) { return start + index; }));
      return { groups: groups, error: '' };
    }
    var lines = String(value == null ? '' : value).split(/\r?\n/).map(function (line) { return line.trim(); }).filter(Boolean);
    if (!lines.length) return { groups: [], error: 'Bitte gib mindestens einen Seitenbereich ein.' };
    var parsed = [];
    for (var index = 0; index < lines.length; index += 1) {
      var result = parsePageRange(lines[index], maximum);
      if (result.error) return { groups: [], error: 'Zeile ' + (index + 1) + ': ' + result.error };
      parsed.push(result.pages);
    }
    return { groups: parsed, error: '' };
  }

  function pad(number, width) { return String(number).padStart(width, '0'); }
  function safeBaseName(filename) {
    var base = String(filename || 'dokument').replace(/\.[^.]+$/, '').normalize('NFKC').replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^-+|-+$/g, '');
    return base || 'dokument';
  }
  function splitFilename(base, index, count) { return safeBaseName(base) + '-teil-' + pad(index, String(count).length) + '.pdf'; }
  function pageImageFilename(base, page, count, extension) { return safeBaseName(base) + '-seite-' + pad(page, Math.max(3, String(count).length)) + '.' + extension; }
  function formatBytes(bytes) {
    var value = Number(bytes) || 0;
    if (value < 1024) return value + ' B';
    if (value < 1048576) return (value / 1024).toFixed(1).replace('.', ',') + ' KB';
    return (value / 1048576).toFixed(1).replace('.', ',') + ' MB';
  }
  function isPdfHeader(bytes) {
    if (!bytes || bytes.length < 5) return false;
    return String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4]) === '%PDF-';
  }
  function isSupportedImage(file) {
    var type = String(file && file.type || '').toLocaleLowerCase('en');
    var name = String(file && file.name || '').toLocaleLowerCase('en');
    return IMAGE_TYPES.has(type) || /\.(?:jpe?g|png|webp)$/.test(name);
  }

  function mmToPoints(value) { return Number(value) * 72 / 25.4; }
  function resolvePageSize(preset, customWidth, customHeight, orientation) {
    var size;
    if (preset === 'custom') {
      var width = Number(customWidth); var height = Number(customHeight);
      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || width > 5000 || height > 5000) return { error: 'Breite und Höhe müssen zwischen 0 und 5000 mm liegen.' };
      size = [mmToPoints(width), mmToPoints(height)];
    } else {
      size = PAGE_SIZES[preset] && PAGE_SIZES[preset].slice();
      if (!size) return { error: 'Unbekannte Seitengröße.' };
    }
    if (orientation === 'landscape' && size[0] < size[1]) size.reverse();
    if (orientation === 'portrait' && size[0] > size[1]) size.reverse();
    return { width: size[0], height: size[1], error: '' };
  }

  function fitRectangle(sourceWidth, sourceHeight, targetWidth, targetHeight, margin) {
    var availableWidth = Math.max(0, targetWidth - margin * 2);
    var availableHeight = Math.max(0, targetHeight - margin * 2);
    if ([sourceWidth, sourceHeight, availableWidth, availableHeight].some(function (value) { return !Number.isFinite(value) || value <= 0; })) return { error: 'Die Abmessungen sind ungültig.' };
    var scale = Math.min(availableWidth / sourceWidth, availableHeight / sourceHeight);
    var width = sourceWidth * scale; var height = sourceHeight * scale;
    return { x: (targetWidth - width) / 2, y: (targetHeight - height) / 2, width: width, height: height, scale: scale, error: '' };
  }

  function imagePdfSettings(imageWidth, imageHeight, preset, orientation, marginName) {
    var margins = { none: 0, small: mmToPoints(8), medium: mmToPoints(16) };
    var margin = margins[marginName];
    if (margin == null) return { error: 'Unbekannte Randeinstellung.' };
    var page;
    if (preset === 'auto') {
      // Browser pixels are interpreted at the CSS reference density of 96 dpi.
      page = { width: imageWidth * 72 / 96 + margin * 2, height: imageHeight * 72 / 96 + margin * 2, error: '' };
      if (orientation === 'portrait' && page.width > page.height) { var p = page.width; page.width = page.height; page.height = p; }
      if (orientation === 'landscape' && page.width < page.height) { var l = page.width; page.width = page.height; page.height = l; }
    } else page = resolvePageSize(preset, null, null, orientation);
    if (page.error) return page;
    var fit = fitRectangle(imageWidth, imageHeight, page.width, page.height, margin);
    return Object.assign({ pageWidth: page.width, pageHeight: page.height, margin: margin }, fit);
  }

  function metadataValues(values, clear) {
    var keys = ['title', 'author', 'subject', 'keywords', 'creator', 'producer'];
    var result = {};
    keys.forEach(function (key) { result[key] = clear ? '' : String(values && values[key] || '').trim(); });
    ['creationDate', 'modificationDate'].forEach(function (key) {
      var raw = clear ? '' : String(values && values[key] || '').trim();
      result[key] = raw && !Number.isNaN(Date.parse(raw)) ? new Date(raw) : null;
    });
    return result;
  }

  function compressionReport(originalSize, resultSize) {
    var original = Number(originalSize) || 0; var result = Number(resultSize) || 0;
    var difference = original - result;
    return { original: original, result: result, difference: difference, percent: original ? (difference / original) * 100 : 0, smaller: result < original };
  }
  function compressionMode(name) { return COMPRESSION_MODES[name] ? Object.assign({}, COMPRESSION_MODES[name]) : null; }
  function imageExportSettings(format, scale, quality) {
    var normalized = String(format).toLowerCase();
    if (!['png', 'jpeg', 'webp'].includes(normalized)) return { error: 'Nicht unterstütztes Bildformat.' };
    var factor = Number(scale);
    if (![1, 1.5, 2, 3].includes(factor)) return { error: 'Nicht unterstützte Auflösung.' };
    var result = { format: normalized, scale: factor, mime: 'image/' + normalized, extension: normalized === 'jpeg' ? 'jpg' : normalized, quality: null, error: '' };
    if (normalized !== 'png') {
      var q = Number(quality);
      if (!Number.isFinite(q) || q < 0.1 || q > 1) return { error: 'Die Bildqualität muss zwischen 10 % und 100 % liegen.' };
      result.quality = q;
    }
    return result;
  }

  return {
    PAGE_SIZES: PAGE_SIZES, COMPRESSION_MODES: COMPRESSION_MODES,
    parsePageRange: parsePageRange, selectPages: selectPages, moveItem: moveItem,
    normalizeRotation: normalizeRotation, applyRotationMap: applyRotationMap,
    splitGroups: splitGroups, safeBaseName: safeBaseName, splitFilename: splitFilename,
    pageImageFilename: pageImageFilename, formatBytes: formatBytes, isPdfHeader: isPdfHeader,
    isSupportedImage: isSupportedImage, mmToPoints: mmToPoints, resolvePageSize: resolvePageSize,
    fitRectangle: fitRectangle, imagePdfSettings: imagePdfSettings, metadataValues: metadataValues,
    compressionReport: compressionReport, compressionMode: compressionMode,
    imageExportSettings: imageExportSettings
  };
}));
