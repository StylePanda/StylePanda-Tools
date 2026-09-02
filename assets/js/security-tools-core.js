(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.StylePandaSecurityCore = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var TEXT_PREFIX = 'SPENC-TEXT-1.';
  var FILE_MAGIC = 'SPENCFILE\n';
  var FORMAT_VERSION = 1;
  var PBKDF2_ITERATIONS = 310000;
  var SALT_BYTES = 16;
  var IV_BYTES = 12;
  var AES_KEY_BITS = 256;
  var MAX_FILE_BYTES = 512 * 1024 * 1024;
  var LARGE_FILE_WARNING_BYTES = 100 * 1024 * 1024;
  var GROUPS = {
    lower: 'abcdefghijklmnopqrstuvwxyz',
    upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    digits: '0123456789',
    symbols: '!#$%&()*+,-./:;<=>?@[]^_{|}~'
  };
  var RANDOM_ALPHABETS = {
    lower: GROUPS.lower,
    upper: GROUPS.upper,
    digits: GROUPS.digits,
    symbols: GROUPS.symbols,
    hex: '0123456789abcdef',
    base64url: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
  };

  function fail(message, code) {
    var error = new Error(message);
    error.code = code || 'invalid_input';
    return error;
  }

  function provider(cryptoObject) {
    var value = cryptoObject || (typeof crypto !== 'undefined' ? crypto : null);
    if (!value || typeof value.getRandomValues !== 'function' || !value.subtle) {
      throw fail('Web Crypto ist in diesem Browser nicht verfügbar.', 'crypto_unavailable');
    }
    return value;
  }

  function randomProvider(cryptoObject) {
    var value = cryptoObject || (typeof crypto !== 'undefined' ? crypto : null);
    if (!value || typeof value.getRandomValues !== 'function') {
      throw fail('Kryptografische Zufallszahlen sind in diesem Browser nicht verfügbar.', 'crypto_unavailable');
    }
    return value;
  }

  function utf8(value) { return new TextEncoder().encode(String(value)); }
  function decodeUtf8(bytes, fatal) { return new TextDecoder('utf-8', { fatal: Boolean(fatal) }).decode(bytes); }

  function bytesToBinary(bytes) {
    var chunks = [];
    for (var offset = 0; offset < bytes.length; offset += 0x8000) {
      chunks.push(String.fromCharCode.apply(null, bytes.subarray(offset, offset + 0x8000)));
    }
    return chunks.join('');
  }

  function bytesToBase64(bytes) { return btoa(bytesToBinary(bytes)); }
  function base64ToBytes(value) {
    var compact = String(value).replace(/\s+/g, '');
    if (!compact || compact.length % 4 === 1 || !/^[A-Za-z0-9+/]*={0,2}$/.test(compact)) throw fail('Ungültige Base64-Daten.', 'invalid_container');
    var binary;
    try { binary = atob(compact + '='.repeat((4 - compact.length % 4) % 4)); }
    catch (error) { throw fail('Ungültige Base64-Daten.', 'invalid_container'); }
    var bytes = new Uint8Array(binary.length);
    for (var index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  function bytesToHex(bytes) {
    return Array.prototype.map.call(bytes, function (byte) { return byte.toString(16).padStart(2, '0'); }).join('');
  }

  function concatBytes() {
    var arrays = Array.prototype.slice.call(arguments);
    var length = arrays.reduce(function (sum, item) { return sum + item.length; }, 0);
    var result = new Uint8Array(length);
    var offset = 0;
    arrays.forEach(function (item) { result.set(item, offset); offset += item.length; });
    return result;
  }

  function checkedInteger(value, minimum, maximum, label) {
    var number = Number(value);
    if (!Number.isInteger(number) || number < minimum || number > maximum) {
      throw fail((label || 'Der Wert') + ' muss zwischen ' + minimum + ' und ' + maximum + ' liegen.', 'invalid_range');
    }
    return number;
  }

  function randomInt(maximum, cryptoObject) {
    checkedInteger(maximum, 1, 0xffffffff, 'Die Alphabetgröße');
    var source = randomProvider(cryptoObject);
    var limit = Math.floor(0x100000000 / maximum) * maximum;
    var buffer = new Uint32Array(1);
    do { source.getRandomValues(buffer); } while (buffer[0] >= limit);
    return buffer[0] % maximum;
  }

  function randomCharacter(alphabet, cryptoObject) {
    if (!alphabet) throw fail('Mindestens eine Zeichengruppe muss ausgewählt sein.', 'no_alphabet');
    return alphabet.charAt(randomInt(alphabet.length, cryptoObject));
  }

  function secureShuffle(values, cryptoObject) {
    for (var index = values.length - 1; index > 0; index -= 1) {
      var swap = randomInt(index + 1, cryptoObject);
      var temporary = values[index]; values[index] = values[swap]; values[swap] = temporary;
    }
    return values;
  }

  function selectedGroups(selection) {
    var names = ['lower', 'upper', 'digits', 'symbols'].filter(function (name) { return selection && selection[name]; });
    if (!names.length) throw fail('Wähle mindestens eine Zeichengruppe aus.', 'no_groups');
    return names;
  }

  function generatePassword(options, cryptoObject) {
    var settings = options || {};
    var length = checkedInteger(settings.length, 8, 128, 'Die Passwortlänge');
    var names = selectedGroups(settings.groups || settings);
    if (length < names.length) throw fail('Die Länge ist kleiner als die Anzahl ausgewählter Gruppen.', 'length_too_short');
    var alphabet = names.map(function (name) { return GROUPS[name]; }).join('');
    var characters = names.map(function (name) { return randomCharacter(GROUPS[name], cryptoObject); });
    while (characters.length < length) characters.push(randomCharacter(alphabet, cryptoObject));
    secureShuffle(characters, cryptoObject);
    return { value: characters.join(''), length: length, alphabetSize: alphabet.length, entropyBits: length * Math.log2(alphabet.length), groups: names };
  }

  function randomAlphabet(options) {
    var settings = options || {};
    if (settings.mode === 'hex') return RANDOM_ALPHABETS.hex;
    if (settings.mode === 'base64url') return RANDOM_ALPHABETS.base64url;
    return selectedGroups(settings.groups || settings).map(function (name) { return RANDOM_ALPHABETS[name]; }).join('');
  }

  function generateRandomStrings(options, cryptoObject) {
    var settings = options || {};
    var length = checkedInteger(settings.length, 1, 512, 'Die Stringlänge');
    var count = checkedInteger(settings.count === undefined ? 1 : settings.count, 1, 100, 'Die Anzahl');
    var alphabet = randomAlphabet(settings);
    var values = [];
    for (var row = 0; row < count; row += 1) {
      var value = '';
      for (var index = 0; index < length; index += 1) value += randomCharacter(alphabet, cryptoObject);
      values.push(value);
    }
    return { values: values, length: length, count: count, alphabetSize: alphabet.length, entropyBitsPerString: length * Math.log2(alphabet.length) };
  }

  function passwordStrength(value) {
    var password = String(value || '');
    if (!password) return { score: 0, label: 'Keine Eingabe', entropyBits: 0, feedback: ['Gib ein Passwort ein, um eine lokale Einschätzung zu erhalten.'] };
    var pool = 0;
    if (/[a-z]/.test(password)) pool += 26;
    if (/[A-Z]/.test(password)) pool += 26;
    if (/\d/.test(password)) pool += 10;
    if (/[^A-Za-z0-9]/.test(password)) pool += 33;
    if (/[^\x00-\x7f]/.test(password)) pool += 40;
    var raw = password.length * Math.log2(Math.max(pool, 1));
    var multiplier = 1;
    var feedback = [];
    var lower = password.toLowerCase();
    var obvious = /(?:0123|1234|2345|3456|4567|5678|6789|abcd|bcde|cdef|qwert|asdf|passwort|password|admin|letmein)/i.test(password);
    var repeated = /(.{1,8})\1{1,}/i.test(password);
    var same = /^(.)\1+$/.test(password);
    var runs = /(.)\1{2,}/.test(password);
    if (password.length < 12) feedback.push('Mehr Länge verbessert die Widerstandsfähigkeit meist stärker als zusätzliche Pflichtzeichen.');
    if (obvious) { multiplier *= 0.38; feedback.push('Offensichtliche Wörter oder Zeichenfolgen sind leicht vorhersehbar.'); }
    if (repeated) { multiplier *= 0.48; feedback.push('Wiederholte Muster verringern die geschätzte Stärke deutlich.'); }
    if (runs) { multiplier *= 0.72; feedback.push('Mehrfach wiederholte Zeichen sind vorhersehbar.'); }
    if (same) multiplier *= 0.12;
    if (/^[A-Za-z]+\d{1,4}[!?.]?$/.test(password)) { multiplier *= 0.62; feedback.push('Ein Wort mit angehängten Zahlen oder Zeichen ist ein häufiges Muster.'); }
    var uniqueRatio = new Set(Array.from(password)).size / Array.from(password).length;
    if (uniqueRatio < 0.45) multiplier *= 0.7;
    var entropy = Math.max(0, Math.min(raw * multiplier, raw));
    var score = entropy < 28 ? 1 : entropy < 45 ? 2 : entropy < 70 ? 3 : entropy < 100 ? 4 : 5;
    if (password.length < 8) score = Math.min(score, 1);
    if (password.length < 12) score = Math.min(score, 2);
    if (obvious || repeated) score = Math.min(score, 2);
    var labels = ['Sehr schwach', 'Sehr schwach', 'Schwach', 'Mittel', 'Stark geschätzt', 'Sehr stark geschätzt'];
    if (!feedback.length) feedback.push('Die Länge und geringe erkennbare Vorhersagbarkeit wirken sich positiv auf die Schätzung aus.');
    feedback.push('Nutze für jedes Konto ein einzigartiges Passwort und möglichst einen Passwortmanager.');
    return { score: score, label: labels[score], entropyBits: entropy, rawEntropyBits: raw, feedback: feedback, length: Array.from(password).length };
  }

  async function deriveKey(passphrase, salt, iterations, cryptoObject, usage) {
    if (!String(passphrase)) throw fail('Bitte gib ein Passwort ein.', 'missing_passphrase');
    var source = provider(cryptoObject);
    var baseKey = await source.subtle.importKey('raw', utf8(passphrase), 'PBKDF2', false, ['deriveKey']);
    return source.subtle.deriveKey({ name: 'PBKDF2', salt: salt, iterations: iterations, hash: 'SHA-256' }, baseKey, { name: 'AES-GCM', length: AES_KEY_BITS }, false, [usage]);
  }

  function randomBytes(length, cryptoObject) { return randomProvider(cryptoObject).getRandomValues(new Uint8Array(length)); }

  function validateMetadata(metadata, expectedType) {
    if (!metadata || metadata.version !== FORMAT_VERSION) throw fail('Diese Formatversion wird nicht unterstützt.', 'unsupported_version');
    if (metadata.type !== expectedType || metadata.algorithm !== 'AES-256-GCM' || metadata.kdf !== 'PBKDF2-SHA-256') throw fail('Der verschlüsselte Container ist ungültig.', 'invalid_container');
    if (!Number.isInteger(metadata.iterations) || metadata.iterations < 100000 || metadata.iterations > 5000000) throw fail('Die KDF-Parameter sind ungültig.', 'invalid_container');
  }

  async function encryptText(plaintext, passphrase, options) {
    var settings = options || {};
    var source = provider(settings.crypto);
    var salt = settings.salt ? new Uint8Array(settings.salt) : randomBytes(SALT_BYTES, source);
    var iv = settings.iv ? new Uint8Array(settings.iv) : randomBytes(IV_BYTES, source);
    if (salt.length !== SALT_BYTES || iv.length !== IV_BYTES) throw fail('Testparameter haben eine ungültige Länge.', 'invalid_parameters');
    var iterations = settings.iterations || PBKDF2_ITERATIONS;
    var key = await deriveKey(passphrase, salt, iterations, source, 'encrypt');
    var ciphertext = new Uint8Array(await source.subtle.encrypt({ name: 'AES-GCM', iv: iv, tagLength: 128 }, key, utf8(plaintext)));
    var metadata = { version: FORMAT_VERSION, type: 'StylePanda encrypted text', algorithm: 'AES-256-GCM', kdf: 'PBKDF2-SHA-256', iterations: iterations, salt: bytesToBase64(salt), iv: bytesToBase64(iv), ciphertext: bytesToBase64(ciphertext) };
    return TEXT_PREFIX + bytesToBase64(utf8(JSON.stringify(metadata)));
  }

  function parseTextContainer(container) {
    var value = String(container || '').trim();
    if (!value.startsWith(TEXT_PREFIX)) throw fail('Das verschlüsselte Textformat ist ungültig.', 'invalid_container');
    var metadata;
    try { metadata = JSON.parse(decodeUtf8(base64ToBytes(value.slice(TEXT_PREFIX.length)), true)); }
    catch (error) { if (error.code) throw error; throw fail('Das verschlüsselte Textformat ist ungültig.', 'invalid_container'); }
    validateMetadata(metadata, 'StylePanda encrypted text');
    return metadata;
  }

  async function decryptText(container, passphrase, options) {
    var settings = options || {};
    var metadata = parseTextContainer(container);
    var source = provider(settings.crypto);
    try {
      var key = await deriveKey(passphrase, base64ToBytes(metadata.salt), metadata.iterations, source, 'decrypt');
      var plaintext = await source.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(metadata.iv), tagLength: 128 }, key, base64ToBytes(metadata.ciphertext));
      return decodeUtf8(new Uint8Array(plaintext), true);
    } catch (error) {
      if (error.code === 'missing_passphrase') throw error;
      throw fail('Entschlüsselung fehlgeschlagen. Passwort oder verschlüsselte Daten sind nicht korrekt.', 'authentication_failed');
    }
  }

  function safeFilename(name) {
    var cleaned = String(name || 'datei').replace(/[\u0000-\u001f<>:"/\\|?*]/g, '_').replace(/[. ]+$/g, '').slice(0, 240);
    return cleaned || 'datei';
  }

  function assertFileSize(size) {
    if (!Number.isFinite(size) || size < 0) throw fail('Die Dateigröße ist ungültig.', 'invalid_file');
    if (size > MAX_FILE_BYTES) throw fail('Diese Datei überschreitet die Sicherheitsgrenze von 512 MiB. Web Crypto benötigt den Dateiinhalt vollständig im Arbeitsspeicher.', 'file_too_large');
  }

  async function encryptFile(data, filename, mime, passphrase, options) {
    var bytes = new Uint8Array(data);
    assertFileSize(bytes.byteLength);
    var settings = options || {};
    var source = provider(settings.crypto);
    var salt = settings.salt ? new Uint8Array(settings.salt) : randomBytes(SALT_BYTES, source);
    var iv = settings.iv ? new Uint8Array(settings.iv) : randomBytes(IV_BYTES, source);
    var iterations = settings.iterations || PBKDF2_ITERATIONS;
    var metadata = { version: FORMAT_VERSION, type: 'StylePanda encrypted file', algorithm: 'AES-256-GCM', kdf: 'PBKDF2-SHA-256', iterations: iterations, salt: bytesToBase64(salt), iv: bytesToBase64(iv), filename: safeFilename(filename), mime: String(mime || 'application/octet-stream').slice(0, 200), size: bytes.byteLength };
    var header = utf8(JSON.stringify(metadata));
    var headerLength = new Uint8Array(4); new DataView(headerLength.buffer).setUint32(0, header.length, false);
    var additionalData = concatBytes(utf8(FILE_MAGIC), headerLength, header);
    var key = await deriveKey(passphrase, salt, iterations, source, 'encrypt');
    var ciphertext = new Uint8Array(await source.subtle.encrypt({ name: 'AES-GCM', iv: iv, additionalData: additionalData, tagLength: 128 }, key, bytes));
    return { data: concatBytes(additionalData, ciphertext), filename: safeFilename(filename) + '.spenc', metadata: metadata };
  }

  function parseFileContainer(data) {
    var bytes = new Uint8Array(data);
    var magic = utf8(FILE_MAGIC);
    if (bytes.length < magic.length + 4 + 16) throw fail('Die verschlüsselte Datei ist zu kurz oder ungültig.', 'invalid_container');
    for (var index = 0; index < magic.length; index += 1) if (bytes[index] !== magic[index]) throw fail('Die Datei ist kein StylePanda-Dateicontainer.', 'invalid_container');
    var headerLength = new DataView(bytes.buffer, bytes.byteOffset + magic.length, 4).getUint32(0, false);
    var headerStart = magic.length + 4; var ciphertextStart = headerStart + headerLength;
    if (headerLength < 2 || ciphertextStart + 16 > bytes.length || headerLength > 65536) throw fail('Der Dateiheader ist ungültig.', 'invalid_container');
    var metadata;
    try { metadata = JSON.parse(decodeUtf8(bytes.subarray(headerStart, ciphertextStart), true)); }
    catch (error) { throw fail('Der Dateiheader ist ungültig.', 'invalid_container'); }
    validateMetadata(metadata, 'StylePanda encrypted file');
    return { metadata: metadata, additionalData: bytes.subarray(0, ciphertextStart), ciphertext: bytes.subarray(ciphertextStart) };
  }

  async function decryptFile(data, passphrase, options) {
    var parsed = parseFileContainer(data);
    assertFileSize(Number(parsed.metadata.size));
    var source = provider(options && options.crypto);
    try {
      var key = await deriveKey(passphrase, base64ToBytes(parsed.metadata.salt), parsed.metadata.iterations, source, 'decrypt');
      var plaintext = new Uint8Array(await source.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(parsed.metadata.iv), additionalData: parsed.additionalData, tagLength: 128 }, key, parsed.ciphertext));
      if (plaintext.byteLength !== parsed.metadata.size) throw new Error('size');
      return { data: plaintext, filename: safeFilename(parsed.metadata.filename), mime: String(parsed.metadata.mime || 'application/octet-stream') };
    } catch (error) {
      if (error.code === 'missing_passphrase') throw error;
      throw fail('Entschlüsselung fehlgeschlagen. Passwort oder verschlüsselte Daten sind nicht korrekt.', 'authentication_failed');
    }
  }

  async function checksum(data, algorithm, cryptoObject) {
    var selected = String(algorithm || 'SHA-256').toUpperCase();
    if (['SHA-256', 'SHA-384', 'SHA-512'].indexOf(selected) === -1) throw fail('Dieser Prüfsummen-Algorithmus wird nicht unterstützt.', 'invalid_algorithm');
    var bytes = new Uint8Array(data);
    assertFileSize(bytes.byteLength);
    var digest = new Uint8Array(await provider(cryptoObject).subtle.digest(selected, bytes));
    return { algorithm: selected, hex: bytesToHex(digest), base64: bytesToBase64(digest) };
  }

  function compareChecksum(expected, actualHex, actualBase64) {
    var normalized = String(expected || '').replace(/\s+/g, '');
    if (!normalized) return { valid: false, match: false, format: null, message: 'Gib eine erwartete Prüfsumme ein.' };
    if (/^[0-9a-f]+$/i.test(normalized)) return { valid: true, match: normalized.toLowerCase() === String(actualHex || '').toLowerCase(), format: 'hex' };
    if (/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) return { valid: true, match: normalized.replace(/=+$/, '') === String(actualBase64 || '').replace(/=+$/, ''), format: 'base64' };
    return { valid: false, match: false, format: null, message: 'Die erwartete Prüfsumme ist weder gültiges Hex noch Base64.' };
  }

  return {
    FORMAT_VERSION: FORMAT_VERSION, TEXT_PREFIX: TEXT_PREFIX, FILE_MAGIC: FILE_MAGIC,
    PBKDF2_ITERATIONS: PBKDF2_ITERATIONS, SALT_BYTES: SALT_BYTES, IV_BYTES: IV_BYTES,
    AES_KEY_BITS: AES_KEY_BITS, MAX_FILE_BYTES: MAX_FILE_BYTES, LARGE_FILE_WARNING_BYTES: LARGE_FILE_WARNING_BYTES,
    GROUPS: GROUPS, RANDOM_ALPHABETS: RANDOM_ALPHABETS,
    randomInt: randomInt, generatePassword: generatePassword, generateRandomStrings: generateRandomStrings,
    passwordStrength: passwordStrength, encryptText: encryptText, decryptText: decryptText, parseTextContainer: parseTextContainer,
    encryptFile: encryptFile, decryptFile: decryptFile, parseFileContainer: parseFileContainer,
    checksum: checksum, compareChecksum: compareChecksum, safeFilename: safeFilename,
    bytesToBase64: bytesToBase64, base64ToBytes: base64ToBytes, bytesToHex: bytesToHex
  };
}));
