'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const tools = require('../assets/js/text-tools.js');

let assertions = 0;
function equal(actual, expected, label) {
  assertions += 1;
  assert.deepStrictEqual(actual, expected, label);
}
function ok(value, label) {
  assertions += 1;
  assert.ok(value, label);
}

// Text Counter
equal(tools.countText(''), {
  words: 0, charactersWithSpaces: 0, charactersWithoutSpaces: 0,
  sentences: 0, paragraphs: 0, lines: 0, uniqueWords: 0,
  readingTime: '0 Min.', speakingTime: '0 Min.'
}, 'Leere Statistik');
let stats = tools.countText('Hallo, Welt! Hallo.');
equal(stats.words, 3, 'Normale Wörter');
equal(stats.uniqueWords, 2, 'Eindeutige Wörter ignorieren Großschreibung und Satzzeichen');
equal(stats.sentences, 2, 'Satzheuristik');
equal(tools.countText('eins\nzwei\n').lines, 3, 'Zeilen einschließlich letzter Leerzeile');
equal(tools.countText('Absatz eins.\n\nAbsatz zwei.\n \nAbsatz drei.').paragraphs, 3, 'Absatzblöcke');
stats = tools.countText('Ein Wort');
ok(!String(stats.readingTime).includes('NaN') && !String(stats.speakingTime).includes('Infinity'), 'Endliche Dauerwerte');

// Text Cleaner: each operation and meaningful combinations.
equal(tools.cleanText('  a\n b', { leadingSpaces: true, trimText: false, collapseEmptyLines: false, normalizeLineBreaks: false }), 'a\nb', 'Führende Leerzeichen');
equal(tools.cleanText('a  \nb ', { trailingSpaces: true, trimText: false, collapseEmptyLines: false, normalizeLineBreaks: false }), 'a\nb', 'Leerzeichen am Zeilenende');
equal(tools.cleanText('a   b', { collapseSpaces: true, trimText: false, collapseEmptyLines: false, normalizeLineBreaks: false }), 'a b', 'Mehrfache Leerzeichen');
equal(tools.cleanText('a\n \nb', { removeEmptyLines: true, trimText: false }), 'a\nb', 'Leere Zeilen');
equal(tools.cleanText('a\n\n\n b', { collapseEmptyLines: true, trimText: false }), 'a\n\n b', 'Mehrere Leerzeilen');
equal(tools.cleanText('a\tb', { tabsToSpaces: true, tabWidth: 2, trimText: false, collapseEmptyLines: false, normalizeLineBreaks: false }), 'a  b', 'Tabs');
equal(tools.cleanText('Hallo\nWelt', { removeLineBreaks: true, trimText: false, collapseEmptyLines: false, normalizeLineBreaks: false }), 'Hallo Welt', 'Zeilen verbinden ohne Wörter zu verketten');
equal(tools.cleanText('a\r\nb\rc', { normalizeLineBreaks: true, trimText: false, collapseEmptyLines: false }), 'a\nb\nc', 'Zeilenumbrüche vereinheitlichen');
equal(tools.cleanText('Hallo , Welt !', { removeSpaceBeforePunctuation: true, trimText: false, collapseEmptyLines: false, normalizeLineBreaks: false }), 'Hallo, Welt!', 'Leerzeichen vor Satzzeichen');
equal(tools.cleanText('  a  ', { trimText: true, collapseEmptyLines: false, normalizeLineBreaks: false }), 'a', 'Gesamttrim');
equal(tools.cleanText('', {}), '', 'Leere Bereinigung');
equal(tools.cleanText('\t a  !\n\n\n b ', { tabsToSpaces: true, leadingSpaces: true, trailingSpaces: true, collapseSpaces: true, collapseEmptyLines: true, removeSpaceBeforePunctuation: true, trimText: true }), 'a!\n\nb', 'Kombinierte Bereinigung');

// Case Converter
equal(tools.convertCase('ÄPFEL Text', 'lower'), 'äpfel text', 'Kleinschreibung');
equal(tools.convertCase('Äpfel text', 'upper'), 'ÄPFEL TEXT', 'Großschreibung');
equal(tools.convertCase('hALLO WELT. nÄCHSTER sATZ!', 'sentence'), 'Hallo welt. Nächster satz!', 'Satzanfang');
equal(tools.convertCase('hALLO schöne WELT', 'title'), 'Hallo Schöne Welt', 'Title Case');
equal(tools.convertCase('AbC 12!', 'invert'), 'aBc 12!', 'Schreibung umkehren');
equal(tools.convertCase('mein neuer Wert', 'camel'), 'meinNeuerWert', 'camelCase');
equal(tools.convertCase('mein-neuer_wert', 'pascal'), 'MeinNeuerWert', 'PascalCase');
equal(tools.convertCase('MeinNeuer Wert', 'snake'), 'mein_neuer_wert', 'snake_case');
equal(tools.convertCase('MeinNeuer_Wert', 'kebab'), 'mein-neuer-wert', 'kebab-case');
equal(tools.convertCase('', 'camel'), '', 'Leere Case-Eingabe');

// Line Sorter
equal(tools.sortLines('Banane\nApfel\nCitrone', 'az', { ignoreCase: true }), 'Apfel\nBanane\nCitrone', 'A–Z');
equal(tools.sortLines('Banane\nApfel\nCitrone', 'za', { ignoreCase: true }), 'Citrone\nBanane\nApfel', 'Z–A');
equal(tools.sortLines('aaa\nb\ncc', 'shortest', {}), 'b\ncc\naaa', 'Nach Länge aufsteigend');
equal(tools.sortLines('aaa\nb\ncc', 'longest', {}), 'aaa\ncc\nb', 'Nach Länge absteigend');
equal(tools.sortLines('10\nText\n2\n3', 'numeric-asc', {}), '2\n3\n10\nText', 'Numerisch und Nichtzahlen erhalten');
equal(tools.sortLines('10\nText\n2', 'numeric-desc', {}), '10\n2\nText', 'Numerisch absteigend');
equal(tools.sortLines('a\nb\nc', 'reverse', {}), 'c\nb\na', 'Reihenfolge umkehren');
equal(tools.sortLines('b\nA\na', 'az', { ignoreCase: true }), 'A\na\nb', 'Großschreibung beim Vergleich ignorieren und stabil bleiben');
equal(tools.sortLines(' b\na', 'az', { trimCompare: true }), 'a\n b', 'Äußere Leerzeichen nur beim Vergleich ignorieren');
equal(tools.sortLines('a\n\nb', 'az', { ignoreEmpty: true }), 'a\nb', 'Leere Zeilen ignorieren');
equal(tools.sortLines('', 'az', {}), '', 'Leere Sortiereingabe');
equal(tools.sortLines('a\nb\nc', 'random', {}, () => 0), 'b\nc\na', 'Deterministischer Fisher-Yates-Test');

// Duplicate Line Remover
equal(tools.removeDuplicateLines('Apfel\napfel\nBirne\nApfel', {}).text, 'Apfel\nBirne', 'Standard-Deduplizierung');
equal(tools.removeDuplicateLines('Apfel\napfel', { caseSensitive: true }).text, 'Apfel\napfel', 'Großschreibung beachten');
equal(tools.removeDuplicateLines(' Apfel\nApfel', { whitespaceSensitive: true }).text, ' Apfel\nApfel', 'Leerzeichen beachten');
equal(tools.removeDuplicateLines('a\n\n\nb', { removeEmpty: true }), { text: 'a\nb', before: 4, after: 2, removed: 2 }, 'Leerzeilen und Zähler');
equal(tools.removeDuplicateLines('b\na\nb\nc', {}).text, 'b\na\nc', 'Originalreihenfolge');
equal(tools.removeDuplicateLines('', {}), { text: '', before: 0, after: 0, removed: 0 }, 'Leere Duplikat-Eingabe');

// Find & Replace
equal(tools.findAndReplace('Panda Panda', 'Panda', 'Koala', { replaceAll: false, caseSensitive: true }).text, 'Koala Panda', 'Ersten Treffer ersetzen');
equal(tools.findAndReplace('Panda Panda', 'Panda', 'Koala', { replaceAll: true, caseSensitive: true }).text, 'Koala Koala', 'Alle Treffer ersetzen');
equal(tools.findAndReplace('Panda panda', 'panda', 'X', { replaceAll: true, caseSensitive: true }).matches, 1, 'Großschreibung beachten');
equal(tools.findAndReplace('Panda panda', 'panda', 'X', { replaceAll: true, caseSensitive: false }).matches, 2, 'Großschreibung ignorieren');
equal(tools.findAndReplace('Panda Pandabär Panda', 'Panda', 'X', { replaceAll: true, wholeWord: true }).text, 'X Pandabär X', 'Nur ganze Wörter');
equal(tools.findAndReplace('A1 B2', '([A-Z])(\\d)', '$2$1', { replaceAll: true, regex: true, caseSensitive: true }).text, '1A 2B', 'Regex und Ersetzungssemantik');
ok(Boolean(tools.findAndReplace('Text', '[', 'X', { regex: true }).error), 'Ungültiger Regex');
equal(tools.findAndReplace('Text', 'nicht', 'X', { replaceAll: true }).replacements, 0, 'Keine Treffer');
ok(Boolean(tools.findAndReplace('Text', '', 'X', {}).error), 'Leerer Suchbegriff');

// Privacy and security invariants for production Text Tool JavaScript.
const source = fs.readFileSync(path.join(__dirname, '../assets/js/text-tools.js'), 'utf8');
const forbidden = [
  /\bfetch\s*\(/, /XMLHttpRequest/, /WebSocket/, /EventSource/, /sendBeacon/,
  /localStorage/, /sessionStorage/, /indexedDB/i, /document\.cookie/,
  /location\.(?:search|hash)\s*=/, /history\.(?:pushState|replaceState)/,
  /\beval\s*\(/, /new\s+Function\s*\(/
];
for (const pattern of forbidden) ok(!pattern.test(source), `Verbotenes Text-Tool-Muster: ${pattern}`);

console.log(`TEXT-TOOLS-TESTS ERFOLGREICH: ${assertions} Prüfungen`);
