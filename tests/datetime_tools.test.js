'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const core = require('../assets/js/datetime-tools-core.js');
const d = core.parseCivilDate;

assert.strictEqual(core.isLeapYear(2024), true, '2024 Schaltjahr');
assert.strictEqual(core.isLeapYear(2100), false, '2100 kein Schaltjahr');
assert.strictEqual(core.daysInMonth(2024, 2), 29, 'Februar im Schaltjahr');
assert.throws(() => d('2025-02-29'), (error) => error.code === 'invalid_date', 'unmögliches Datum');
assert.throws(() => d(''), (error) => error.code === 'empty_date', 'leeres Datum');

assert.deepStrictEqual(core.calendarDifference(d('2026-01-01'), d('2026-01-01')), { sign: 0, years: 0, months: 0, days: 0, totalDays: 0 }, 'gleiches Datum');
assert.deepStrictEqual(core.calendarDifference(d('2026-01-01'), d('2026-01-08')), { sign: 1, years: 0, months: 0, days: 7, totalDays: 7 }, 'einfache Tagesdifferenz');
assert.deepStrictEqual(core.calendarDifference(d('2026-01-31'), d('2026-02-28')), { sign: 1, years: 0, months: 1, days: 0, totalDays: 28 }, 'Monatsgrenze geklemmt');
assert.deepStrictEqual(core.calendarDifference(d('2025-12-31'), d('2026-01-01')), { sign: 1, years: 0, months: 0, days: 1, totalDays: 1 }, 'Jahresgrenze');
assert.deepStrictEqual(core.calendarDifference(d('2020-02-29'), d('2021-02-28')), { sign: 1, years: 1, months: 0, days: 0, totalDays: 365 }, 'Schaltjahresdifferenz');
assert.deepStrictEqual(core.calendarDifference(d('2020-01-01'), d('2022-03-15')), { sign: 1, years: 2, months: 2, days: 14, totalDays: 804 }, 'Jahre Monate Tage');
assert.deepStrictEqual(core.calendarDifference(d('2026-01-08'), d('2026-01-01')), { sign: -1, years: 0, months: 0, days: 7, totalDays: -7 }, 'umgekehrte Differenz mit Richtung');

assert.strictEqual(core.daysBetween(d('2026-01-01'), d('2026-01-08')), 7, '7 Kalendertage exklusiv');
assert.strictEqual(core.daysBetween(d('2024-02-28'), d('2024-03-01')), 2, 'Schaltjahr zwei Tage');
assert.strictEqual(core.daysBetween(d('2025-02-28'), d('2025-03-01')), 1, 'Normaljahr ein Tag');
assert.strictEqual(core.daysBetween(d('2026-03-28'), d('2026-03-30')), 2, 'DST-nahe Frühlingsdaten');
assert.strictEqual(core.daysBetween(d('2026-10-24'), d('2026-10-26')), 2, 'DST-nahe Herbstdaten');
assert.strictEqual(core.daysBetween(d('2026-01-08'), d('2026-01-01')), -7, 'umgekehrte Tage');

assert.strictEqual(core.toIsoDate(core.addCalendar(d('2026-01-31'), 1, 'months', 'add')), '2026-02-28', '31.01.2026 + 1 Monat');
assert.strictEqual(core.toIsoDate(core.addCalendar(d('2024-01-31'), 1, 'months', 'add')), '2024-02-29', '31.01.2024 + 1 Monat');
assert.strictEqual(core.toIsoDate(core.addCalendar(d('2024-02-29'), 1, 'years', 'add')), '2025-02-28', '29.02.2024 + 1 Jahr');
assert.strictEqual(core.toIsoDate(core.addCalendar(d('2024-03-01'), 1, 'days', 'subtract')), '2024-02-29', '01.03.2024 - 1 Tag');
assert.strictEqual(core.toIsoDate(core.addCalendar(d('2026-01-01'), 3, 'weeks', 'add')), '2026-01-22', 'Wochen addieren');
assert.strictEqual(core.toIsoDate(core.addCalendar(d('2026-05-15'), 40, 'days', 'add')), '2026-06-24', 'Tage addieren');
assert.strictEqual(core.toIsoDate(core.addCalendar(d('2026-05-15'), 2, 'months', 'subtract')), '2026-03-15', 'Monate subtrahieren');
assert.strictEqual(core.toIsoDate(core.addCalendar(d('2026-05-15'), 2, 'years', 'subtract')), '2024-05-15', 'Jahre subtrahieren');
assert.throws(() => core.addCalendar(d('2026-01-01'), -1, 'days', 'add'), (error) => error.code === 'invalid_amount', 'negative Anzahl abgewiesen');

let age = core.calculateAge(d('2000-09-02'), d('2026-09-02')); assert.deepStrictEqual([age.years, age.months, age.days, age.daysUntilBirthday], [26, 0, 0, 0], 'Geburtstag heute');
age = core.calculateAge(d('2000-09-03'), d('2026-09-02')); assert.strictEqual(age.years, 25, 'Geburtstag morgen noch nicht erreicht'); assert.strictEqual(age.daysUntilBirthday, 1, 'ein Tag bis Geburtstag');
age = core.calculateAge(d('2000-08-01'), d('2026-09-02')); assert.strictEqual(age.years, 26, 'Geburtstag bereits vorbei');
age = core.calculateAge(d('2000-02-29'), d('2025-02-28')); assert.strictEqual(age.years, 25, 'Schalttag-Konvention Alter'); assert.strictEqual(age.daysUntilBirthday, 0, '28. Februar als Geburtstag im Nichtschaltjahr'); assert.strictEqual(age.leapDayConvention, true, 'Konvention markiert');
age = core.calculateAge(d('1990-05-20'), d('2026-09-02')); assert.deepStrictEqual([age.years, age.months, age.days], [36, 3, 13], 'bekanntes Kalenderalter');
assert.throws(() => core.calculateAge(d('2027-01-01'), d('2026-09-02')), (error) => error.code === 'future_birth', 'zukünftiges Geburtsdatum');

let week = core.isoWeek(d('2021-01-01')); assert.deepStrictEqual([week.year, week.week], [2020, 53], '01.01.2021 = 2020-W53');
week = core.isoWeek(d('2021-01-04')); assert.deepStrictEqual([week.year, week.week], [2021, 1], '04.01.2021 = 2021-W01');
week = core.isoWeek(d('2020-12-31')); assert.deepStrictEqual([week.year, week.week], [2020, 53], '31.12.2020 = 2020-W53');
assert.strictEqual(core.isoWeeksInYear(2020), 53, 'bekanntes 53-Wochen-Jahr');
assert.strictEqual(core.isoWeeksInYear(2021), 52, 'bekanntes 52-Wochen-Jahr');
assert.throws(() => core.isoWeekRange(2021, 53), (error) => error.code === 'invalid_iso_week', 'ungültige W53');
const range = core.isoWeekRange(2020, 53); assert.strictEqual(core.toIsoDate(range.monday), '2020-12-28', 'W53 Montag'); assert.strictEqual(core.toIsoDate(range.sunday), '2021-01-03', 'W53 Sonntag'); assert.deepStrictEqual([core.isoWeek(range.monday).year, core.isoWeek(range.monday).week], [2020, 53], 'ISO-Wochen-Roundtrip');

assert.deepStrictEqual(core.timeDuration('08:30', '16:15', false), { totalMinutes: 465, totalHours: 7.75, totalDays: 0, hours: 7, minutes: 45 }, '08:30 bis 16:15');
assert.deepStrictEqual(core.timeDuration('22:00', '06:00', true), { totalMinutes: 480, totalHours: 8, totalDays: 0, hours: 8, minutes: 0 }, 'über Mitternacht explizit');
assert.strictEqual(core.timeDuration('08:30', '08:30', false).totalMinutes, 0, 'gleiche Uhrzeit');
assert.throws(() => core.timeDuration('16:15', '08:30', false), (error) => error.code === 'reversed_duration', 'umgekehrte Uhrzeit ohne Folgetag');
let duration = core.dateTimeDuration(d('2026-09-02'), core.parseTime('08:30'), d('2026-09-02'), core.parseTime('16:15')); assert.deepStrictEqual([duration.totalMinutes, duration.hours, duration.minutes], [465, 7, 45], 'Datum/Uhrzeit gleicher Tag');
duration = core.dateTimeDuration(d('2026-09-01'), core.parseTime('22:00'), d('2026-09-03'), core.parseTime('01:30')); assert.deepStrictEqual([duration.totalMinutes, duration.totalDays, duration.hours, duration.minutes], [1650, 1, 3, 30], 'Datum/Uhrzeit mehrere Tage');
assert.throws(() => core.dateTimeDuration(d('2026-09-03'), core.parseTime('10:00'), d('2026-09-02'), core.parseTime('10:00')), (error) => error.code === 'reversed_duration', 'umgekehrte Datum/Uhrzeit');

const application = ['datetime-tools-core.js', 'datetime-tools-app.js'].map((file) => path.join(__dirname, '../assets/js', file)).filter(fs.existsSync).map((file) => fs.readFileSync(file, 'utf8')).join('\n');
if (application) { assert.ok(!/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|FormData|https?:\/\//i.test(application), 'keine Netzwerklogik'); assert.ok(!/localStorage|sessionStorage|indexedDB|document\.cookie/i.test(application), 'keine Persistenz'); assert.ok(!/console\.(?:log|debug|info|warn|error)/i.test(application), 'kein Logging'); }

console.log('DATETIME-TOOLS ERFOLGREICH: Civil Dates, Kalenderarithmetik, ISO-Wochen, Alter und Dauer');
