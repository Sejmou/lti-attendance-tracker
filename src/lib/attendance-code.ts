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
 * `graceUntil` is for when the code went up late: a scan-in up to then counts
 * as one at the start, since nobody could scan in earlier. Before the start it
 * changes nothing.
 */
export function attendanceCode(
	event: Event,
	scannedIn: Date,
	scannedOut: Date | null,
	graceUntil: Date | null = null
) {
	const start = event.startsAt.getTime();
	const length = event.endsAt.getTime() - start;
	const late = graceUntil !== null && graceUntil.getTime() > start && scannedIn <= graceUntil;
	const from = late ? event.startsAt : scannedIn;

	const missed = (Math.max(from.getTime(), start) - start) / length;
	const share = attendanceShare(event, from, scannedOut);

	const level = missed < 0.25 ? 'x' : share !== null && share >= 0.45 && share < 0.75 ? 'y' : '.';
	const code = share !== null && share >= 0.97 ? `${level}p` : level;
	return { code, share, late };
}

/** The event's day as the spreadsheet writes it: `5.10.` */
export function sheetDate(at: Date) {
	const [, month, day] = wallClock(at).date.split('-').map(Number);
	return `${day}.${month}.`;
}

/**
 * Why a row got its code, for the spreadsheet's notes column. Always German:
 * the spreadsheet is.
 */
export function sheetNote(
	scannedIn: Date,
	scannedOut: Date | null,
	share: number | null,
	{ late = false, manual = false } = {}
) {
	const parts = [
		`ein ${wallClock(scannedIn).time}${late ? ' (Nachfrist, ab Beginn gezählt)' : ''}`,
		scannedOut ? `aus ${wallClock(scannedOut).time}` : 'nicht ausgescannt'
	];
	if (share !== null) parts.push(`${Math.round(share * 100)} % anwesend`);
	if (manual) parts.push('enthält manuelle Eingabe');
	return `Automatisch aus Scans erzeugt: ${parts.join(', ')}`;
}
