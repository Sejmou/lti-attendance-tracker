/**
 * How much of an event someone was there for, from 0 to 1: the part of its
 * start to end that lies between their scan-in and scan-out. Arriving early or
 * leaving late adds nothing, so it never exceeds 1. Stepping out in between
 * isn't subtracted: only the first and last scan count, as everywhere else.
 *
 * Null without a scan-out, which says nothing about how long they stayed, and
 * for all-day events, whose length has nothing to do with the event's.
 */
export function attendanceShare(
	event: { startsAt: Date; endsAt: Date; allDay: boolean },
	scannedIn: Date,
	scannedOut: Date | null
) {
	if (!scannedOut || event.allDay) return null;
	const length = event.endsAt.getTime() - event.startsAt.getTime();
	if (length <= 0) return null;
	const from = Math.max(scannedIn.getTime(), event.startsAt.getTime());
	const to = Math.min(scannedOut.getTime(), event.endsAt.getTime());
	return Math.max(0, to - from) / length;
}
