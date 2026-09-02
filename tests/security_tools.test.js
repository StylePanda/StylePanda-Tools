'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { webcrypto } = require('crypto');
const core = require('../assets/js/security-tools-core.js');

function fixedRandomCrypto(bytes) {
  let offset = 0;
  return {
    subtle: webcrypto.subtle,
    getRandomValues(target) {
      const view = new Uint8Array(target.buffer, target.byteOffset, target.byteLength);
      for (let index = 0; index < view.length; index += 1) view[index] = bytes[offset++ % bytes.length];
      return target;
    }
  };
}

function textMetadata(container) {
  return JSON.parse(Buffer.from(container.slice(core.TEXT_PREFIX.length), 'base64').toString('utf8'));
}

function textContainer(metadata) {
  return core.TEXT_PREFIX + Buffer.from(JSON.stringify(metadata), 'utf8').toString('base64');
}

function tamperFile(data) {
  const changed = new Uint8Array(data);
  changed[changed.length - 2] ^= 1;
  return changed;
}

(async function () {
  const source = fs.readFileSync(path.join(__dirname, '../assets/js/security-tools-core.js'), 'utf8');
  assert.ok(source.includes('getRandomValues'), 'kryptografische Zufallsquelle vorhanden');
  assert.ok(!source.includes('Math.random'), 'kein Math.random im Security-Core');

  const random = fixedRandomCrypto([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 127, 253]);
  const password = core.generatePassword({ length: 64, groups: { lower: true, upper: true, digits: true, symbols: true } }, random);
  assert.strictEqual(password.value.length, 64, 'Passwortlänge');
  assert.ok(/[a-z]/.test(password.value) && /[A-Z]/.test(password.value) && /\d/.test(password.value) && /[^A-Za-z0-9]/.test(password.value), 'jede Gruppe garantiert');
  assert.ok(Array.from(password.value).every((character) => Object.values(core.GROUPS).join('').includes(character)), 'nur ausgewählte Alphabete');
  assert.throws(() => core.generatePassword({ length: 7, groups: { lower: true } }, random), /8 und 128/, 'untere Längengrenze');
  assert.throws(() => core.generatePassword({ length: 129, groups: { lower: true } }, random), /8 und 128/, 'obere Längengrenze');
  assert.throws(() => core.generatePassword({ length: 20, groups: {} }, random), /mindestens eine/i, 'mindestens eine Gruppe');

  assert.strictEqual(core.passwordStrength('').score, 0, 'leere Eingabe');
  assert.strictEqual(core.passwordStrength('abc').score, 1, 'sehr kurze Eingabe');
  assert.ok(core.passwordStrength('abcabcabcabcabcabc').score <= 2, 'wiederholtes Muster abgestraft');
  assert.ok(core.passwordStrength('1234567890abcdef').score <= 2, 'offensichtliche Sequenz abgestraft');
  assert.ok(core.passwordStrength('wT7!mQ2#vL9@xR4$kP8&nC6*').score >= 4, 'langer zufällig wirkender Wert');

  const strings = core.generateRandomStrings({ length: 80, count: 4, mode: 'hex' }, random);
  assert.strictEqual(strings.values.length, 4, 'mehrere Strings');
  strings.values.forEach((value) => { assert.strictEqual(value.length, 80, 'Stringlänge'); assert.ok(/^[0-9a-f]+$/.test(value), 'Hex-Alphabet'); });
  const urlStrings = core.generateRandomStrings({ length: 40, count: 2, mode: 'base64url' }, random);
  urlStrings.values.forEach((value) => assert.ok(/^[A-Za-z0-9_-]+$/.test(value), 'Base64url-Alphabet'));

  const salt = Uint8Array.from({ length: 16 }, (_, index) => index);
  const iv = Uint8Array.from({ length: 12 }, (_, index) => index + 20);
  const plain = 'Grüße aus Wien 🐼\nMehrzeilig.';
  const encrypted = await core.encryptText(plain, 'korrektes passwort', { crypto: webcrypto, salt, iv, iterations: 100000 });
  assert.ok(encrypted.startsWith(core.TEXT_PREFIX), 'versionierter Textpräfix');
  assert.strictEqual(await core.decryptText(encrypted, 'korrektes passwort', { crypto: webcrypto }), plain, 'Text-Roundtrip mit Umlauten und Emoji');
  const randomEncrypted1 = await core.encryptText(plain, 'korrektes passwort', { crypto: webcrypto, iterations: 100000 });
  const randomEncrypted2 = await core.encryptText(plain, 'korrektes passwort', { crypto: webcrypto, iterations: 100000 });
  assert.notStrictEqual(randomEncrypted1, randomEncrypted2, 'frische Salt/IV erzeugen anderes Chiffrat');
  await assert.rejects(() => core.decryptText(encrypted, 'falsch', { crypto: webcrypto }), (error) => error.code === 'authentication_failed', 'falsches Passwort scheitert');
  const tamperedText = textMetadata(encrypted); const cipherBytes = Buffer.from(tamperedText.ciphertext, 'base64'); cipherBytes[0] ^= 1; tamperedText.ciphertext = cipherBytes.toString('base64');
  await assert.rejects(() => core.decryptText(textContainer(tamperedText), 'korrektes passwort', { crypto: webcrypto }), (error) => error.code === 'authentication_failed', 'Textmanipulation authentifiziert abgewiesen');
  const unsupportedText = textMetadata(encrypted); unsupportedText.version = 99;
  assert.throws(() => core.parseTextContainer(textContainer(unsupportedText)), (error) => error.code === 'unsupported_version', 'unbekannte Textversion abgewiesen');

  const binary = Uint8Array.from([0, 255, 1, 2, 3, 128, 10, 13, 42]);
  const encryptedFile = await core.encryptFile(binary, 'täst 🐼.bin', 'application/octet-stream', 'dateipasswort', { crypto: webcrypto, salt, iv, iterations: 100000 });
  assert.ok(Buffer.from(encryptedFile.data).subarray(0, Buffer.byteLength(core.FILE_MAGIC)).equals(Buffer.from(core.FILE_MAGIC)), 'Datei-Magic');
  const decryptedFile = await core.decryptFile(encryptedFile.data, 'dateipasswort', { crypto: webcrypto });
  assert.deepStrictEqual(Array.from(decryptedFile.data), Array.from(binary), 'binärer Datei-Roundtrip');
  assert.strictEqual(decryptedFile.filename, 'täst 🐼.bin', 'Originaldateiname');
  assert.strictEqual(decryptedFile.mime, 'application/octet-stream', 'MIME-Metadaten');
  await assert.rejects(() => core.decryptFile(encryptedFile.data, 'falsch', { crypto: webcrypto }), (error) => error.code === 'authentication_failed', 'falsches Dateipasswort');
  await assert.rejects(() => core.decryptFile(tamperFile(encryptedFile.data), 'dateipasswort', { crypto: webcrypto }), (error) => error.code === 'authentication_failed', 'Dateimanipulation authentifiziert abgewiesen');
  assert.throws(() => core.parseFileContainer(Uint8Array.from([1, 2, 3])), (error) => error.code === 'invalid_container', 'ungültiger Dateicontainer');
  const unsupportedFile = new Uint8Array(encryptedFile.data); const magicLength = Buffer.byteLength(core.FILE_MAGIC); const headerLength = new DataView(unsupportedFile.buffer, unsupportedFile.byteOffset + magicLength, 4).getUint32(0, false); const metadata = JSON.parse(Buffer.from(unsupportedFile.subarray(magicLength + 4, magicLength + 4 + headerLength)).toString('utf8')); metadata.version = 2; const changedHeader = Buffer.from(JSON.stringify(metadata)); assert.strictEqual(changedHeader.length, headerLength, 'Testheader gleich lang'); unsupportedFile.set(changedHeader, magicLength + 4);
  assert.throws(() => core.parseFileContainer(unsupportedFile), (error) => error.code === 'unsupported_version', 'unbekannte Dateiversion abgewiesen');

  const abc = Buffer.from('abc');
  const sha256 = await core.checksum(abc, 'SHA-256', webcrypto); const sha384 = await core.checksum(abc, 'SHA-384', webcrypto); const sha512 = await core.checksum(abc, 'SHA-512', webcrypto);
  assert.strictEqual(sha256.hex, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', 'SHA-256 Vektor');
  assert.strictEqual(sha384.hex, 'cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed8086072ba1e7cc2358baeca134c825a7', 'SHA-384 Vektor');
  assert.strictEqual(sha512.hex, 'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f', 'SHA-512 Vektor');
  assert.strictEqual(core.compareChecksum(' BA78 16BF\n' + sha256.hex.slice(8).toUpperCase(), sha256.hex, sha256.base64).match, true, 'Hex-Normalisierung');
  assert.strictEqual(core.compareChecksum(sha256.base64, sha256.hex, sha256.base64).match, true, 'Base64-Vergleich');
  assert.strictEqual(core.compareChecksum('00'.repeat(32), sha256.hex, sha256.base64).match, false, 'Mismatch');

  console.log('SECURITY-TOOLS ERFOLGREICH: Zufall, Heuristik, AES-GCM/PBKDF2, Dateicontainer und SHA-2');
}()).catch((error) => { console.error(error); process.exit(1); });
