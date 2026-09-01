(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.StylePandaDeveloperCore = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MAX_REGEX_INPUT = 50000;
  var MAX_REGEX_MATCHES = 1000;

  function inputError(message, code) {
    var error = new Error(message);
    error.code = code || 'invalid_input';
    return error;
  }

  function jsonLocation(text, error) {
    var match = String(error && error.message || '').match(/(?:position|at position)\s+(\d+)/i);
    if (!match) return null;
    var position = Math.min(Number(match[1]), text.length);
    var before = text.slice(0, position);
    var lines = before.split(/\r\n?|\n/);
    return { position: position, line: lines.length, column: lines[lines.length - 1].length + 1 };
  }

  function parseJson(text) {
    try { return { value: JSON.parse(text), location: null }; }
    catch (error) {
      var location = jsonLocation(text, error);
      var suffix = location ? ' (Zeile ' + location.line + ', Spalte ' + location.column + ')' : '';
      var wrapped = inputError('Ungültiges JSON: ' + error.message + suffix, 'invalid_json');
      wrapped.location = location;
      throw wrapped;
    }
  }

  function formatJson(text, indentation) {
    var space = indentation === 'tab' ? '\t' : Number(indentation) === 4 ? 4 : 2;
    return JSON.stringify(parseJson(text).value, null, space);
  }

  function minifyJson(text) { return JSON.stringify(parseJson(text).value); }
  function utf8Bytes(text) { return new TextEncoder().encode(String(text)); }
  function utf8Length(text) { return utf8Bytes(text).length; }

  function bytesToBinary(bytes) {
    var parts = [];
    for (var offset = 0; offset < bytes.length; offset += 0x8000) {
      parts.push(String.fromCharCode.apply(null, bytes.subarray(offset, offset + 0x8000)));
    }
    return parts.join('');
  }

  function binaryToBytes(binary) {
    var bytes = new Uint8Array(binary.length);
    for (var index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  function encodeBase64(text) { return btoa(bytesToBinary(utf8Bytes(text))); }

  function decodeBase64(value) {
    var compact = String(value).replace(/\s+/g, '');
    if (!compact || compact.length % 4 === 1 || !/^[A-Za-z0-9+/]*={0,2}$/.test(compact)) {
      throw inputError('Die Eingabe ist kein gültiges Base64.', 'invalid_base64');
    }
    var padded = compact + '='.repeat((4 - compact.length % 4) % 4);
    var binary;
    try { binary = atob(padded); }
    catch (error) { throw inputError('Die Eingabe ist kein gültiges Base64.', 'invalid_base64'); }
    try { return new TextDecoder('utf-8', { fatal: true }).decode(binaryToBytes(binary)); }
    catch (error) { throw inputError('Base64 enthält keinen gültigen UTF-8-Text.', 'invalid_utf8'); }
  }

  function encodeUrlComponent(value) { return encodeURIComponent(String(value)); }
  function decodeUrlComponent(value) {
    try { return decodeURIComponent(String(value)); }
    catch (error) { throw inputError('Die Prozentkodierung ist ungültig oder unvollständig.', 'invalid_percent_encoding'); }
  }

  function encodeHtmlEntities(value) {
    return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function decodeHtmlEntities(value, documentObject) {
    var text = String(value);
    var doc = documentObject || (typeof document !== 'undefined' ? document : null);
    if (doc && doc.implementation && typeof DOMParser !== 'undefined') {
      var safe = text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
      var parsed = new DOMParser().parseFromString('<!doctype html><textarea>' + safe + '</textarea>', 'text/html');
      return parsed.querySelector('textarea').value;
    }
    var named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' };
    return text.replace(/&(#(?:x[0-9a-f]+|\d+)|[a-z][a-z0-9]+);/gi, function (whole, entity) {
      if (entity[0] !== '#') return Object.prototype.hasOwnProperty.call(named, entity.toLowerCase()) ? named[entity.toLowerCase()] : whole;
      var hex = entity[1].toLowerCase() === 'x';
      var code = parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      try { return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole; }
      catch (error) { return whole; }
    });
  }

  function bytesToHex(bytes) {
    return Array.prototype.map.call(bytes, function (byte) { return byte.toString(16).padStart(2, '0'); }).join('');
  }

  async function hashText(text, algorithm, cryptoObject) {
    var selected = String(algorithm || 'SHA-256').toUpperCase();
    if (['SHA-256', 'SHA-384', 'SHA-512'].indexOf(selected) === -1) throw inputError('Hash-Algorithmus wird nicht unterstützt.', 'invalid_algorithm');
    var provider = cryptoObject || (typeof crypto !== 'undefined' ? crypto : null);
    if (!provider || !provider.subtle) throw inputError('Web Crypto ist in diesem Browser nicht verfügbar.', 'crypto_unavailable');
    var digest = new Uint8Array(await provider.subtle.digest(selected, utf8Bytes(text)));
    return { hex: bytesToHex(digest), base64: btoa(bytesToBinary(digest)), algorithm: selected };
  }

  function generateUuid(cryptoObject) {
    var provider = cryptoObject || (typeof crypto !== 'undefined' ? crypto : null);
    if (!provider) throw inputError('Kryptografische Zufallszahlen sind nicht verfügbar.', 'crypto_unavailable');
    if (typeof provider.randomUUID === 'function') return provider.randomUUID();
    if (typeof provider.getRandomValues !== 'function') throw inputError('Kryptografische Zufallszahlen sind nicht verfügbar.', 'crypto_unavailable');
    var bytes = provider.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    var hex = bytesToHex(bytes);
    return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
  }

  function timestampToDate(value, unit) {
    var number = Number(String(value).trim());
    if (!Number.isFinite(number)) throw inputError('Bitte gib einen gültigen Unix-Timestamp ein.', 'invalid_timestamp');
    var milliseconds = unit === 'milliseconds' ? number : number * 1000;
    var date = new Date(milliseconds);
    if (!Number.isFinite(date.getTime())) throw inputError('Der Timestamp liegt außerhalb des unterstützten Bereichs.', 'timestamp_out_of_range');
    return { date: date, milliseconds: date.getTime(), seconds: Math.trunc(date.getTime() / 1000), iso: date.toISOString() };
  }

  function dateToTimestamp(value, unit) {
    var date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) throw inputError('Bitte wähle ein gültiges Datum mit Uhrzeit.', 'invalid_date');
    return unit === 'milliseconds' ? date.getTime() : Math.trunc(date.getTime() / 1000);
  }

  function normalizeFlags(flags) {
    var unique = '';
    String(flags || '').split('').forEach(function (flag) {
      if ('gimsuy'.indexOf(flag) === -1) throw inputError('Unbekanntes Regex-Flag: ' + flag, 'invalid_regex_flags');
      if (unique.indexOf(flag) === -1) unique += flag;
    });
    return unique;
  }

  function looksRiskyRegex(pattern) {
    var source = String(pattern);
    return /\([^)]*[+*][^)]*\)[+*{]/.test(source) || /\([^)]*\|[^)]*\)[+*{]/.test(source) || /\.\*[+*{]/.test(source);
  }

  function testRegex(pattern, flags, text) {
    var sourceText = String(text);
    if (sourceText.length > MAX_REGEX_INPUT) throw inputError('Der Testtext darf für die interaktive Prüfung höchstens ' + MAX_REGEX_INPUT.toLocaleString('de-DE') + ' Zeichen enthalten.', 'regex_input_too_large');
    if (looksRiskyRegex(pattern)) throw inputError('Das Muster enthält eine offensichtlich riskante verschachtelte Wiederholung. Bitte vereinfache es, um langes Blockieren zu vermeiden.', 'risky_regex');
    var normalized = normalizeFlags(flags);
    var expression;
    try { expression = new RegExp(pattern, normalized); }
    catch (error) { throw inputError('Ungültiger regulärer Ausdruck: ' + error.message, 'invalid_regex'); }
    var scanFlags = normalized.indexOf('g') === -1 ? normalized + 'g' : normalized;
    var scanner = new RegExp(pattern, scanFlags);
    var matches = [];
    var match;
    while ((match = scanner.exec(sourceText)) !== null && matches.length < MAX_REGEX_MATCHES) {
      matches.push({ value: match[0], start: match.index, end: match.index + match[0].length, captures: match.slice(1), groups: match.groups || null });
      if (match[0].length === 0) scanner.lastIndex += 1;
      if (normalized.indexOf('g') === -1 && normalized.indexOf('y') === -1) break;
    }
    return { matches: matches, truncated: matches.length === MAX_REGEX_MATCHES, flags: normalized };
  }

  function decodeBase64Url(value) {
    var input = String(value).replace(/-/g, '+').replace(/_/g, '/');
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(input)) throw inputError('Ungültige Base64url-Kodierung im JWT.', 'invalid_jwt_base64');
    return decodeBase64(input);
  }

  function decodeJwt(token) {
    var parts = String(token).trim().split('.');
    if (parts.length !== 3 || !parts[0] || !parts[1]) throw inputError('Ein JWT muss aus genau drei durch Punkte getrennten Teilen bestehen.', 'invalid_jwt_structure');
    var headerText = decodeBase64Url(parts[0]);
    var payloadText = decodeBase64Url(parts[1]);
    var header;
    var payload;
    try { header = JSON.parse(headerText); payload = JSON.parse(payloadText); }
    catch (error) { throw inputError('Header oder Payload enthalten kein gültiges JSON.', 'invalid_jwt_json'); }
    return { header: header, payload: payload, headerText: JSON.stringify(header, null, 2), payloadText: JSON.stringify(payload, null, 2), signature: parts[2] };
  }

  function claimDate(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    try { return new Date(value * 1000).toISOString(); }
    catch (error) { return null; }
  }

  return {
    MAX_REGEX_INPUT: MAX_REGEX_INPUT,
    MAX_REGEX_MATCHES: MAX_REGEX_MATCHES,
    parseJson: parseJson,
    formatJson: formatJson,
    minifyJson: minifyJson,
    utf8Length: utf8Length,
    encodeBase64: encodeBase64,
    decodeBase64: decodeBase64,
    encodeUrlComponent: encodeUrlComponent,
    decodeUrlComponent: decodeUrlComponent,
    encodeHtmlEntities: encodeHtmlEntities,
    decodeHtmlEntities: decodeHtmlEntities,
    hashText: hashText,
    generateUuid: generateUuid,
    timestampToDate: timestampToDate,
    dateToTimestamp: dateToTimestamp,
    normalizeFlags: normalizeFlags,
    looksRiskyRegex: looksRiskyRegex,
    testRegex: testRegex,
    decodeBase64Url: decodeBase64Url,
    decodeJwt: decodeJwt,
    claimDate: claimDate
  };
}));
