'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { webcrypto } = require('crypto');
const core = require('../assets/js/developer-tools-core.js');

let assertions = 0;
function equal(actual, expected, label) { assertions += 1; assert.deepStrictEqual(actual, expected, label); }
function ok(value, label) { assertions += 1; assert.ok(value, label); }
async function rejects(fn, code, label) { assertions += 1; await assert.rejects(async () => fn(), (error) => error.code === code, label); }

(async () => {
  equal(core.formatJson('{"a":1,"b":[true]}', 2), '{\n  "a": 1,\n  "b": [\n    true\n  ]\n}', 'JSON mit zwei Leerzeichen formatiert');
  equal(core.formatJson('{"x":1}', 'tab'), '{\n\t"x": 1\n}', 'JSON mit Tab formatiert');
  equal(core.minifyJson('{ "a": 1, "text": "ä" }'), '{"a":1,"text":"ä"}', 'JSON minimiert');
  assert.throws(() => core.formatJson('{"a":}', 2), (error) => error.code === 'invalid_json', 'Ungültiges JSON wird nicht repariert'); assertions += 1;
  equal(core.utf8Length('ä🙂'), 6, 'UTF-8-Bytezahl');

  for (const value of ['ASCII', 'Grüße aus Wien', 'Panda 🐼']) equal(core.decodeBase64(core.encodeBase64(value)), value, `Base64 UTF-8: ${value}`);
  await rejects(() => Promise.resolve(core.decodeBase64('%%%')), 'invalid_base64', 'Malformed Base64');
  equal(core.decodeUrlComponent(core.encodeUrlComponent('München & 東京')), 'München & 東京', 'URL-Komponente Unicode');
  await rejects(() => Promise.resolve(core.decodeUrlComponent('%E0%A4%A')), 'invalid_percent_encoding', 'Malformed Prozentkodierung');
  equal(core.encodeHtmlEntities('<a title="x">Tom & O\'Neil</a>'), '&lt;a title=&quot;x&quot;&gt;Tom &amp; O&#39;Neil&lt;/a&gt;', 'HTML-Sonderzeichen kodiert');
  equal(core.decodeHtmlEntities('&lt;b&gt;&amp;&#x1F43C;&lt;/b&gt;'), '<b>&🐼</b>', 'HTML Entities als Text dekodiert');

  equal((await core.hashText('abc', 'SHA-256', webcrypto)).hex, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', 'SHA-256-Vektor');
  equal((await core.hashText('abc', 'SHA-384', webcrypto)).hex, 'cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed8086072ba1e7cc2358baeca134c825a7', 'SHA-384-Vektor');
  equal((await core.hashText('abc', 'SHA-512', webcrypto)).hex, 'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f', 'SHA-512-Vektor');

  const uuid = core.generateUuid(webcrypto);
  ok(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid), 'UUID-v4-Form');
  const fallbackUuid = core.generateUuid({ getRandomValues(bytes) { bytes.fill(1); return bytes; } });
  equal(fallbackUuid, '01010101-0101-4101-8101-010101010101', 'Kryptografischer Fallback setzt Versionsbits');

  equal(core.timestampToDate('0', 'seconds').iso, '1970-01-01T00:00:00.000Z', 'Unix-Epoche Sekunden');
  equal(core.timestampToDate('1000', 'milliseconds').iso, '1970-01-01T00:00:01.000Z', 'Unix-Epoche Millisekunden');
  equal(core.dateToTimestamp(new Date('2020-01-01T00:00:00.000Z'), 'seconds'), 1577836800, 'Datum zu Sekunden');

  let regex = core.testRegex('(?<word>panda)-(\\d+)', 'gi', 'Panda-12 panda-34');
  equal(regex.matches.length, 2, 'Regex globale Treffer');
  equal(regex.matches[0].captures, ['Panda', '12'], 'Capture Groups');
  equal(regex.matches[0].groups.word, 'Panda', 'Named Capture Group');
  regex = core.testRegex('(?=a)', 'g', 'aa');
  equal(regex.matches.map((match) => match.start), [0, 1], 'Zero-Length-Matches terminieren');
  assert.throws(() => core.testRegex('[', 'g', 'x'), (error) => error.code === 'invalid_regex', 'Ungültige Regex'); assertions += 1;
  assert.throws(() => core.testRegex('(a+)+$', 'g', 'aaaa'), (error) => error.code === 'risky_regex', 'Offensichtlich riskante Regex abgewiesen'); assertions += 1;

  function segment(value) { return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url'); }
  const jwt = segment({ alg: 'none', typ: 'JWT' }) + '.' + segment({ sub: 'Bär 🐼', exp: 0, iat: 1 }) + '.';
  const decoded = core.decodeJwt(jwt);
  equal(decoded.payload.sub, 'Bär 🐼', 'JWT Unicode Payload');
  equal(core.claimDate(decoded.payload.iat), '1970-01-01T00:00:01.000Z', 'JWT Claim-Datum');
  await rejects(() => Promise.resolve(core.decodeJwt('kaputt')), 'invalid_jwt_structure', 'Malformed JWT');

  const application = ['../assets/js/developer-tools-core.js', '../assets/js/developer-tools-app.js'].map((file) => fs.readFileSync(path.join(__dirname, file), 'utf8')).join('\n');
  for (const pattern of [/\bfetch\s*\(/, /XMLHttpRequest/, /WebSocket/, /sendBeacon/, /FormData/, /https?:\/\//, /\beval\s*\(/, /new\s+Function\s*\(/, /Math\.random/, /\.innerHTML\s*=/]) ok(!pattern.test(application), `Verbotenes Entwickler-Anwendungsmuster: ${pattern}`);
  ok(application.includes('textContent'), 'Sichere Textausgabe vorhanden');
  ok(application.includes('canvas.toBlob'), 'QR-PNG wird lokal per Canvas erzeugt');
  ok(fs.existsSync(path.join(__dirname, '../assets/vendor/qrcode-generator/qrcode.js')), 'Lokale QR-Bibliothek vorhanden');
  ok(fs.existsSync(path.join(__dirname, '../assets/vendor/qrcode-generator/qrcode_UTF8.js')), 'Lokale QR-UTF8-Erweiterung vorhanden');
  ok(fs.readFileSync(path.join(__dirname, '../tools/entwickler/jwt-decoder/index.html'), 'utf8').includes('Die Signatur wird nicht überprüft'), 'JWT-Warnung ist eindeutig');

  console.log(`DEVELOPER-TOOLS-TESTS ERFOLGREICH: ${assertions} Prüfungen`);
})().catch((error) => { console.error(error); process.exit(1); });
