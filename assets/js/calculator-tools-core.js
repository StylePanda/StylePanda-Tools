(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.StylePandaCalculatorCore = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function fail(message, code) { var error = new Error(message); error.code = code || 'invalid_input'; return error; }

  function parseNumber(value, label) {
    var text = String(value === undefined || value === null ? '' : value).trim();
    if (!text) throw fail((label || 'Der Wert') + ' darf nicht leer sein.', 'empty_value');
    if ((text.indexOf(',') !== -1 && text.indexOf('.') !== -1) || (text.match(/,/g) || []).length > 1 || (text.match(/\./g) || []).length > 1) {
      throw fail((label || 'Der Wert') + ' enthält ein mehrdeutiges Zahlenformat. Bitte verwende nur ein Dezimaltrennzeichen und keine Tausendertrennzeichen.', 'ambiguous_number');
    }
    if (!/^[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)(?:e[+-]?\d+)?$/i.test(text)) throw fail((label || 'Der Wert') + ' ist keine gültige Zahl.', 'invalid_number');
    var number = Number(text.replace(',', '.'));
    if (!Number.isFinite(number)) throw fail((label || 'Der Wert') + ' liegt außerhalb des unterstützten Zahlenbereichs.', 'invalid_number');
    return number;
  }

  function finite(value) { if (!Number.isFinite(value)) throw fail('Das Ergebnis liegt außerhalb des unterstützten Zahlenbereichs.', 'non_finite_result'); return value; }
  function zeroGuard(value, label) { if (value === 0) throw fail((label || 'Der Nenner') + ' darf nicht 0 sein.', 'division_by_zero'); }
  function range(value, minimum, maximum, label) { if (value < minimum || value > maximum) throw fail((label || 'Der Wert') + ' muss zwischen ' + minimum + ' und ' + maximum + ' liegen.', 'out_of_range'); return value; }

  function formatNumber(value, options) {
    finite(value);
    var absolute = Math.abs(value);
    var scientific = absolute >= 1e12 || (absolute > 0 && absolute < 1e-9);
    var settings = Object.assign({ maximumFractionDigits: 10 }, options || {});
    if (scientific) Object.assign(settings, { notation: 'scientific', maximumFractionDigits: 8 });
    var normalized = Math.abs(value) < 1e-14 ? 0 : value;
    return new Intl.NumberFormat('de-DE', settings).format(normalized);
  }
  function formatCurrency(value) { return formatNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'; }

  function percentOf(percent, base) { return finite(base * percent / 100); }
  function whatPercent(part, total) { zeroGuard(total, 'Der Grundwert'); return finite(part / total * 100); }
  function percentChange(oldValue, newValue) { zeroGuard(oldValue, 'Der Ausgangswert'); return finite((newValue - oldValue) / oldValue * 100); }
  function adjustPercent(value, percent, direction) { var factor = direction === 'decrease' ? 1 - percent / 100 : 1 + percent / 100; return finite(value * factor); }
  function ruleOfThree(a, b, c) { zeroGuard(a, 'A'); return finite(b * c / a); }

  function discount(original, percent) {
    if (original < 0) throw fail('Der ursprüngliche Preis darf nicht negativ sein.', 'negative_price');
    range(percent, 0, 100, 'Der Rabatt');
    var amount = finite(original * percent / 100);
    return { original: original, percent: percent, discount: amount, final: finite(original - amount) };
  }

  function vat(amount, rate, mode) {
    if (amount < 0) throw fail('Der Betrag darf nicht negativ sein.', 'negative_amount');
    range(rate, 0, 100, 'Der Mehrwertsteuersatz');
    if (mode === 'gross-to-net') {
      var net = finite(amount / (1 + rate / 100));
      return { net: net, vat: finite(amount - net), gross: amount, rate: rate };
    }
    var tax = finite(amount * rate / 100);
    return { net: amount, vat: tax, gross: finite(amount + tax), rate: rate };
  }

  var UNIT_CATEGORIES = {
    length: { label: 'Länge', base: 'm', units: { mm: ['Millimeter', 0.001], cm: ['Zentimeter', 0.01], m: ['Meter', 1], km: ['Kilometer', 1000], in: ['Zoll', 0.0254], ft: ['Fuß', 0.3048], yd: ['Yard', 0.9144], mi: ['Meile', 1609.344] } },
    mass: { label: 'Masse', base: 'kg', units: { mg: ['Milligramm', 0.000001], g: ['Gramm', 0.001], kg: ['Kilogramm', 1], t: ['Tonne', 1000], oz: ['Unze', 0.028349523125], lb: ['Pfund', 0.45359237] } },
    area: { label: 'Fläche', base: 'm²', units: { mm2: ['mm²', 0.000001], cm2: ['cm²', 0.0001], m2: ['m²', 1], km2: ['km²', 1000000], ha: ['Hektar', 10000], acre: ['acre', 4046.8564224] } },
    volume: { label: 'Volumen', base: 'l', units: { ml: ['Milliliter', 0.001], l: ['Liter', 1], m3: ['Kubikmeter', 1000], usfloz: ['US fluid ounce', 0.0295735295625], uscup: ['US cup', 0.2365882365], usgal: ['US gallon', 3.785411784] } }
  };

  var DATA_UNITS = {
    B: ['Byte (B)', 1], kB: ['Kilobyte (kB, SI)', 1000], MB: ['Megabyte (MB, SI)', 1000000], GB: ['Gigabyte (GB, SI)', 1000000000], TB: ['Terabyte (TB, SI)', 1000000000000],
    KiB: ['Kibibyte (KiB, IEC)', 1024], MiB: ['Mebibyte (MiB, IEC)', 1048576], GiB: ['Gibibyte (GiB, IEC)', 1073741824], TiB: ['Tebibyte (TiB, IEC)', 1099511627776]
  };
  var TEMPERATURE_UNITS = { C: 'Celsius (°C)', F: 'Fahrenheit (°F)', K: 'Kelvin (K)' };
  var SPEED_UNITS = { ms: ['Meter pro Sekunde (m/s)', 1], kmh: ['Kilometer pro Stunde (km/h)', 1 / 3.6], mph: ['Meilen pro Stunde (mph)', 0.44704], knot: ['Knoten (kn)', 0.5144444444444445] };

  function convertByFactors(value, source, target, definitions) {
    if (!definitions[source] || !definitions[target]) throw fail('Die ausgewählte Einheit wird nicht unterstützt.', 'invalid_unit');
    return finite(value * definitions[source][1] / definitions[target][1]);
  }
  function convertUnit(category, value, source, target) {
    var definition = UNIT_CATEGORIES[category];
    if (!definition) throw fail('Die Einheitenkategorie wird nicht unterstützt.', 'invalid_category');
    return convertByFactors(value, source, target, definition.units);
  }
  function convertData(value, source, target) { return convertByFactors(value, source, target, DATA_UNITS); }
  function toKelvin(value, source) {
    if (source === 'C') return value + 273.15;
    if (source === 'F') return (value - 32) * 5 / 9 + 273.15;
    if (source === 'K') return value;
    throw fail('Die Temperatureinheit wird nicht unterstützt.', 'invalid_unit');
  }
  function convertTemperature(value, source, target) {
    var kelvin = toKelvin(value, source);
    if (kelvin < -1e-10) throw fail('Diese Temperatur liegt unter dem absoluten Nullpunkt (0 K).', 'below_absolute_zero');
    if (Math.abs(kelvin) < 1e-10) kelvin = 0;
    if (target === 'K') return kelvin;
    if (target === 'C') return finite(kelvin - 273.15);
    if (target === 'F') return finite((kelvin - 273.15) * 9 / 5 + 32);
    throw fail('Die Temperatureinheit wird nicht unterstützt.', 'invalid_unit');
  }
  function convertSpeed(value, source, target) { return convertByFactors(value, source, target, SPEED_UNITS); }

  return {
    parseNumber: parseNumber, formatNumber: formatNumber, formatCurrency: formatCurrency,
    percentOf: percentOf, whatPercent: whatPercent, percentChange: percentChange, adjustPercent: adjustPercent,
    ruleOfThree: ruleOfThree, discount: discount, vat: vat,
    UNIT_CATEGORIES: UNIT_CATEGORIES, DATA_UNITS: DATA_UNITS, TEMPERATURE_UNITS: TEMPERATURE_UNITS, SPEED_UNITS: SPEED_UNITS,
    convertUnit: convertUnit, convertData: convertData, convertTemperature: convertTemperature, convertSpeed: convertSpeed
  };
}));
