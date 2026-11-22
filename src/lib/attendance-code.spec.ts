import { expect, test } from 'vitest';
import { attendanceCode, sheetDate, sheetNote } from './attendance-code';

// 18:00–20:00 in Vienna (UTC+2 in October).
const at = (hhmm: string) => new Date(`2026-10-05T${hhmm}:00+02:00`);
const talk = { startsAt: at('18:00'), endsAt: at('20:00'), allDay: false };
const code = (scannedIn: string, scannedOut: string | null, graceUntil?: string) =>
	attendanceCode(
		talk,
		at(scannedIn),
		scannedOut ? at(scannedOut) : null,
		graceUntil ? at(graceUntil) : null
	).code;

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

test('a late code lets scan-ins up to the grace end count from the start', () => {
	expect(code('18:35', '20:00')).toBe('y');
	expect(code('18:35', '20:00', '18:35')).toBe('xp');
	expect(code('18:36', '20:00', '18:35')).toBe('y');
	// A grace end before the start changes nothing.
	expect(code('18:05', '20:00', '17:59')).toBe('x');
});

test('the spreadsheet date and note', () => {
	expect(sheetDate(at('18:00'))).toBe('5.10.');
	expect(sheetNote(at('18:03'), at('19:58'), 0.96)).toBe(
		'Automatisch aus Scans erzeugt: ein 18:03, aus 19:58, 96 % anwesend'
	);
	expect(sheetNote(at('18:03'), null, null, { manual: true })).toBe(
		'Automatisch aus Scans erzeugt: ein 18:03, nicht ausgescannt, enthält manuelle Eingabe'
	);
});
