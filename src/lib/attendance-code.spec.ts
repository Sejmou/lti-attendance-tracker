import { expect, test } from 'vitest';
import { attendanceCode, sheetDate, sheetNote, toCsv } from './attendance-code';

// 18:00–20:00 in Vienna (UTC+2 in October).
const at = (hhmm: string) => new Date(`2026-10-05T${hhmm}:00+02:00`);
const talk = { startsAt: at('18:00'), endsAt: at('20:00'), allDay: false };
// Without a first scan given, the code was up before the start.
const code = (
	scannedIn: string,
	scannedOut: string | null,
	firstScan = '17:55',
	graceMinutes = 5
) =>
	attendanceCode(talk, at(scannedIn), scannedOut ? at(scannedOut) : null, {
		firstScan: at(firstScan),
		graceMinutes
	}).code;

test('full when in before a quarter of the event passed, scan-out or not', () => {
	expect(code('18:29', null)).toBe('x');
	expect(code('18:30', null)).toBe('.');
	expect(code('17:50', '19:00')).toBe('x');
});

test('partial when in and out for 45 % up to 75 %', () => {
	expect(code('18:30', '19:24')).toBe('y');
	expect(code('18:30', '19:23')).toBe('.');
	expect(code('18:30', '20:00')).toBe('.');
	expect(code('18:31', '20:00')).toBe('y');
});

test('punctual from 97 % on', () => {
	expect(code('18:00', '19:57')).toBe('xp');
	expect(code('18:00', '19:56')).toBe('x');
	expect(code('18:00', null)).toBe('x');
});

test('a code that went up late lets scan-ins up to the grace period after the first scan count from the start', () => {
	expect(code('18:35', '20:00')).toBe('y');
	expect(code('18:35', '20:00', '18:30')).toBe('xp');
	expect(code('18:36', '20:00', '18:30')).toBe('y');
	expect(code('18:35', '20:00', '18:30', 0)).toBe('y');
	// Up before the start: scanning in a little late is just late.
	expect(code('18:04', '20:00', '17:59')).toBe('x');
});

test('the spreadsheet date and note', () => {
	expect(sheetDate(at('18:00'))).toBe('5.10.');
	expect(sheetNote(at('18:03'), at('19:58'), 0.96)).toBe(
		'Automatisch aus Scans erzeugt: ein 18:03, aus 19:58, 96 % anwesend'
	);
	expect(sheetNote(at('18:03'), null, null, { manualIn: true })).toBe(
		'Automatisch aus Scans erzeugt: ein 18:03 (manuell), nicht ausgescannt'
	);
	expect(
		sheetNote(at('18:10'), at('20:00'), 1, { late: true, manualIn: true, manualOut: true })
	).toBe(
		'Automatisch aus Scans erzeugt: ein 18:10 (manuell, Nachfrist, ab Beginn gezählt), aus 20:00 (manuell), 100 % anwesend'
	);
});

test('CSV for Excel: semicolons, every field quoted, quotes doubled', () => {
	expect(
		toCsv([
			['Termin', 'Notizen'],
			['5.10.', 'ein 18:03, "aus" 19:58']
		])
	).toBe('\uFEFF"Termin";"Notizen"\r\n"5.10.";"ein 18:03, ""aus"" 19:58"\r\n');
});
