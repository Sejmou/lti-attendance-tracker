import { and, asc, countDistinct, eq } from 'drizzle-orm';
import type { RequestEvent } from '@sveltejs/kit';
import { direction as directionOf, scanner } from '$lib/server/attendance';
import { publishScan } from '$lib/server/scan-feed';
import { hostScan } from '$lib/server/scan-host';
import { ipHash } from '$lib/server/ip-hash';
import { db } from '$lib/server/db';
import { event as eventTable, scan, user } from '$lib/server/db/schema';
import type { CodeScreen } from '$lib/server/scan-token';

/**
 * How long after scanning in another scan is taken for someone unsure the
 * first one worked, rather than for leaving. Only after the scan-in: once
 * that is past, every scan counts, so one who scanned out too early can
 * always scan out again, and the later one is their scan-out.
 */
export const SCAN_IN_GRACE_MS = 5 * 60_000;

/**
 * A scan-out earlier than this before the event's end may well be a mistake,
 * so the phone says how to undo it: scan again later, the last scan counts.
 */
const EARLY_OUT_MS = 5 * 60_000;

/**
 * Writes the scan for an attendee whose proof has already been checked, under
 * the event the code was for, tells the screens at the door, and files a scan
 * for the admin whose code it came through.
 *
 * Returns the attendee's first name, the event's title and which way the
 * scan counts (their first for the event is a scan-in, a later one their
 * scan-out) — or, for a scan within SCAN_IN_GRACE_MS of their scan-in, that
 * they are already scanned in and since when, with nothing written. Or what
 * is gone: the attendee (deleting
 * one cascades to their key, so this is a race at most), or the event — a
 * manual one can be deleted while its code is still on a screen, as long as
 * nobody has scanned it yet.
 */
export function recordScan(
	request: RequestEvent,
	proof: { userId: string; method: 'device' | 'lti'; codeScanId: string; screen: CodeScreen }
):
	| { firstName: string; eventTitle: string; direction: 'in' | 'out'; early: boolean }
	| { firstName: string; eventTitle: string; alreadyInSince: Date }
	| { gone: 'attendee' | 'event' } {
	const { eventId, hostId } = proof.screen;

	// One transaction, so the event can't be deleted between looking and writing.
	const outcome = db.transaction((tx) => {
		const attendee = tx
			.select({ firstName: user.firstName, lastName: user.lastName })
			.from(user)
			.where(eq(user.id, proof.userId))
			.get();
		if (!attendee) return { gone: 'attendee' as const };

		const event = tx
			.select({ id: eventTable.id, title: eventTable.title, endsAt: eventTable.endsAt })
			.from(eventTable)
			.where(eq(eventTable.id, eventId))
			.get();
		if (!event) return { gone: 'event' as const };

		const scanIn = tx
			.select({ at: scan.scannedAt, codeScanId: scan.codeScanId })
			.from(scan)
			.where(and(eq(scan.userId, proof.userId), eq(scan.eventId, eventId)))
			.orderBy(asc(scan.scannedAt))
			.limit(1)
			.get();
		// The same code scan submitted twice is not a second scan: it reads as
		// the scan-in it is, and the unique index drops it below.
		if (
			scanIn &&
			scanIn.codeScanId !== proof.codeScanId &&
			Date.now() - scanIn.at.getTime() < SCAN_IN_GRACE_MS
		) {
			return { attendee, event, alreadyInSince: scanIn.at };
		}

		// Re-entry later means a new code scan and a new row; a double submit
		// rides the same one and is dropped by the unique index.
		const row = tx
			.insert(scan)
			.values({
				userId: proof.userId,
				eventId,
				method: proof.method,
				codeScanId: proof.codeScanId,
				ipHash: ipHash(eventId, request.getClientAddress()),
				userAgent: request.request.headers.get('user-agent')
			})
			.onConflictDoNothing()
			.returning({ id: scan.id, at: scan.scannedAt })
			.get();
		return { attendee, event, row };
	});
	if (outcome.gone) return { gone: outcome.gone };

	if (outcome.alreadyInSince) {
		const { attendee, event, alreadyInSince } = outcome;
		return { firstName: attendee!.firstName, eventTitle: event!.title, alreadyInSince };
	}

	const { attendee, event, row } = outcome;
	// Counted after writing, so a double submit reads the same as the first.
	const direction = directionOf(proof.userId, eventId);
	if (row) {
		const host = hostScan(hostId, eventId, proof.codeScanId);
		// Counted after both, so the screen's number matches the names under it.
		// Deleted attendees still count: they were there.
		const { present } = db
			.select({ present: countDistinct(scanner) })
			.from(scan)
			.where(eq(scan.eventId, eventId))
			.get()!;
		publishScan({ ...attendee, eventId, id: row.id, at: row.at.getTime(), direction, present });
		// Only ever their first for the event: see hostScan.
		if (host) publishScan({ ...host, direction: 'in', present });
	}
	const early = direction === 'out' && Date.now() < event!.endsAt.getTime() - EARLY_OUT_MS;
	return { firstName: attendee.firstName, eventTitle: event!.title, direction, early };
}
