'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const core = require('../assets/js/calculator-tools-core.js');

function close(actual, expected, tolerance = 1e-9, label = 'Wert') { assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} statt ${expected}`); }

assert.strictEqual(core.parseNumber('12.5'), 12.5, 'Dezimalpunkt');
assert.strictEqual(core.parseNumber('12,5'), 12.5, 'Dezimalkomma');
assert.strictEqual(core.parseNumber(' -0,25 '), -0.25, 'Vorzeichen und Whitespace');
assert.strictEqual(core.parseNumber('1e3'), 1000, 'wissenschaftliche Eingabe');
assert.throws(() => core.parseNumber(''), (error) => error.code === 'empty_value', 'leere Eingabe');
assert.throws(() => core.parseNumber('abc'), (error) => error.code === 'invalid_number', 'ungültiger Text');
assert.throws(() => core.parseNumber('1.234,56'), (error) => error.code === 'ambiguous_number', 'deutsches Tausenderformat nicht geraten');
assert.throws(() => core.parseNumber('1,234.56'), (error) => error.code === 'ambiguous_number', 'englisches Tausenderformat nicht geraten');
assert.ok(!core.formatNumber(0.1 + 0.2).includes('0000000000000004'), 'Floating-Point-Rauschen formatiert');

assert.strictEqual(core.percentOf(20, 150), 30, '20 % von 150');
assert.strictEqual(core.whatPercent(30, 150), 20, '30 von 150');
assert.strictEqual(core.percentChange(100, 120), 20, '100 auf 120');
close(core.percentChange(120, 100), -100 / 6, 1e-12, 'Reduktion 120 auf 100');
assert.strictEqual(core.adjustPercent(100, 20, 'increase'), 120, 'um 20 % erhöhen');
assert.strictEqual(core.adjustPercent(100, 20, 'decrease'), 80, 'um 20 % verringern');
assert.throws(() => core.whatPercent(30, 0), (error) => error.code === 'division_by_zero', 'Prozent-Nenner 0');
assert.throws(() => core.percentChange(0, 20), (error) => error.code === 'division_by_zero', 'Veränderung von 0');

assert.strictEqual(core.ruleOfThree(2, 10, 5), 25, 'bekannter Dreisatz');
close(core.ruleOfThree(2.5, 7.5, 1.2), 3.6, 1e-12, 'Dreisatz Dezimalwerte');
assert.throws(() => core.ruleOfThree(0, 10, 5), (error) => error.code === 'division_by_zero', 'Dreisatz Nenner 0');

assert.deepStrictEqual(core.discount(100, 20), { original: 100, percent: 20, discount: 20, final: 80 }, 'Rabatt 20 %');
assert.deepStrictEqual(core.discount(100, 0), { original: 100, percent: 0, discount: 0, final: 100 }, 'Rabatt 0 %');
assert.deepStrictEqual(core.discount(100, 100), { original: 100, percent: 100, discount: 100, final: 0 }, 'Rabatt 100 %');
assert.throws(() => core.discount(100, 101), (error) => error.code === 'out_of_range', 'Rabatt über 100 %');
assert.throws(() => core.discount(-1, 20), (error) => error.code === 'negative_price', 'negativer Preis');

assert.deepStrictEqual(core.vat(100, 20, 'net-to-gross'), { net: 100, vat: 20, gross: 120, rate: 20 }, '100 netto bei 20 %');
const reverseVat = core.vat(120, 20, 'gross-to-net'); close(reverseVat.net, 100, 1e-12, '120 brutto netto'); close(reverseVat.vat, 20, 1e-12, '20 MwSt.');
assert.strictEqual(core.vat(100, 10, 'net-to-gross').gross, 110, '10 % MwSt.');
assert.strictEqual(core.vat(100, 13, 'net-to-gross').gross, 113, '13 % MwSt.');
close(core.vat(42.75, 17.5, 'net-to-gross').gross, 50.23125, 1e-12, 'individueller Satz');
assert.throws(() => core.vat(100, 120, 'net-to-gross'), (error) => error.code === 'out_of_range', 'MwSt. außerhalb Bereich');

assert.strictEqual(core.convertUnit('length', 1, 'km', 'm'), 1000, '1 km = 1000 m');
close(core.convertUnit('length', 1, 'in', 'cm'), 2.54, 1e-12, '1 Zoll = 2,54 cm');
close(core.convertUnit('length', 1, 'mi', 'km'), 1.609344, 1e-12, '1 Meile');
assert.strictEqual(core.convertUnit('mass', 1, 'kg', 'g'), 1000, '1 kg = 1000 g');
assert.strictEqual(core.convertUnit('area', 1, 'ha', 'm2'), 10000, '1 Hektar');
close(core.convertUnit('area', 1, 'acre', 'm2'), 4046.8564224, 1e-8, '1 acre');
assert.strictEqual(core.convertUnit('volume', 1, 'm3', 'l'), 1000, '1 m³ = 1000 l');
close(core.convertUnit('volume', 1, 'usgal', 'l'), 3.785411784, 1e-12, 'US gallon');
assert.throws(() => core.convertUnit('length', 1, 'kg', 'm'), (error) => error.code === 'invalid_unit', 'Dimensionen nicht gemischt');

assert.strictEqual(core.convertData(1, 'MB', 'B'), 1000000, '1 MB SI');
assert.strictEqual(core.convertData(1, 'MiB', 'B'), 1048576, '1 MiB IEC');
assert.strictEqual(core.convertData(1, 'GiB', 'MiB'), 1024, '1 GiB = 1024 MiB');
close(core.convertData(1, 'GB', 'GiB'), 1000000000 / 1073741824, 1e-12, 'SI nach IEC');

assert.strictEqual(core.convertTemperature(0, 'C', 'F'), 32, '0 °C');
assert.strictEqual(core.convertTemperature(100, 'C', 'F'), 212, '100 °C');
assert.strictEqual(core.convertTemperature(0, 'C', 'K'), 273.15, '0 °C in K');
assert.strictEqual(core.convertTemperature(-273.15, 'C', 'K'), 0, 'absoluter Nullpunkt');
assert.throws(() => core.convertTemperature(-273.16, 'C', 'K'), (error) => error.code === 'below_absolute_zero', 'unter absolutem Nullpunkt Celsius');
assert.throws(() => core.convertTemperature(-1, 'K', 'C'), (error) => error.code === 'below_absolute_zero', 'negative Kelvin');

close(core.convertSpeed(1, 'ms', 'kmh'), 3.6, 1e-12, '1 m/s');
close(core.convertSpeed(100, 'kmh', 'mph'), 62.1371192237, 1e-9, '100 km/h in mph');
close(core.convertSpeed(1, 'knot', 'kmh'), 1.852, 1e-12, '1 Knoten');

const application = ['calculator-tools-core.js', 'calculator-tools-app.js'].map((file) => fs.readFileSync(path.join(__dirname, '../assets/js', file), 'utf8')).join('\n');
assert.ok(!/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|FormData|https?:\/\//i.test(application), 'keine Netzwerklogik');
assert.ok(!/localStorage|sessionStorage|indexedDB|document\.cookie/i.test(application), 'keine Persistenz');
assert.ok(!/console\.(?:log|debug|info|warn|error)/i.test(application), 'kein Eingabe-Logging');

console.log('CALCULATOR-TOOLS ERFOLGREICH: Parsing, Prozent, Dreisatz, Rabatt, MwSt. und vier Konverter');
