import { attendanceShare } from '$lib/attendance-share';
import { wallClock } from '$lib/time';

type Event = { startsAt: Date; endsAt: Date; allDay: boolean };

/**
 * The code an attendance gets in the course's legacy attendance spreadsheet:
 * `x` full, `y` partial, `.` insufficient, with `p` appended for punctual
 * (`xp`). The rules are the ones the spreadsheet was filled in by so far:
 *
 * - full: scanned in before a quarter of the event had passed, scan-out or not
 * - partial: scanned in and out, and there for 45 % up to (not including) 75 %
 * - punctual: scanned in and out, and there for at least 97 %
 *
 * The event's first scan, anyone's, is when the code went up. If that was
 * only after the start, nobody could scan in on time, so a scan-in up to
 * `graceMinutes` after it counts as one at the start (the choir's FAQ: "zum
 * Probenbeginn eingescannt", if close to the others).
 */
export function attendanceCode(
	event: Event,
	scannedIn: Date,
	scannedOut: Date | null,
	{ firstScan, graceMinutes }: { firstScan: Date; graceMinutes: number }
) {
	const start = event.startsAt.getTime();
	const length = event.endsAt.getTime() - start;
	const late =
		firstScan.getTime() > start &&
		scannedIn.getTime() <= firstScan.getTime() + graceMinutes * 60_000;
	const from = late ? event.startsAt : scannedIn;

	const missed = (Math.max(from.getTime(), start) - start) / length;
	const share = attendanceShare(event, from, scannedOut);

	const level = missed < 0.25 ? 'x' : share !== null && share >= 0.45 && share < 0.75 ? 'y' : '.';
	const code = share !== null && share >= 0.97 ? `${level}p` : level;
	return { code, share, late };
}

/** The spreadsheet's column names: German and fixed, like the spreadsheet. */
export const sheetHeader = [
	'Termin',
	'Vorname',
	'Nachname',
	'Anwesenheitscode',
	'Eingescannt',
	'Ausgescannt',
	'Anteil',
	'Beginn',
	'Ende',
	'Anmerkungen'
];

/**
 * Rows as CSV for Excel: semicolons, which German Excel expects, every field
 * quoted, and a byte order mark, without which it reads UTF-8 as Latin-1.
 */
export function toCsv(rows: string[][]) {
	const field = (value: string) => `"${value.replaceAll('"', '""')}"`;
	return '\uFEFF' + rows.map((row) => row.map(field).join(';')).join('\r\n') + '\r\n';
}

/** The event's day as the spreadsheet writes it: `5.10.` */
export function sheetDate(at: Date) {
	const [, month, day] = wallClock(at).date.split('-').map(Number);
	return `${day}.${month}.`;
}

/**
 * The spreadsheet's cells after the name and code, as Excel reads them in any
 * locale: moments as `2026-10-05 18:03`, the share as a whole `96%` (a
 * decimal would need a comma in German Excel), empty when unknown. The notes
 * are always German: the spreadsheet is.
 */
export function sheetValues(
	event: Event,
	scannedIn: Date,
	scannedOut: Date | null,
	share: number | null,
	{ late = false, manualIn = false, manualOut = false } = {}
) {
	const moment = (at: Date) => {
		const { date, time } = wallClock(at);
		return `${date} ${time}`;
	};
	const notes = [
		manualIn && 'Einscannen manuell',
		manualOut && 'Ausscannen manuell',
		late && 'Einscannen in Nachfrist, ab Beginn gezählt'
	].filter(Boolean);
	return [
		moment(scannedIn),
		scannedOut ? moment(scannedOut) : '',
		share === null ? '' : `${Math.round(share * 100)}%`,
		moment(event.startsAt),
		moment(event.endsAt),
		notes.join('; ')
	];
}
