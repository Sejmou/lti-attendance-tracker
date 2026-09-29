import { countDistinct, eq } from 'drizzle-orm';
import type { RequestEvent } from '@sveltejs/kit';
import { publishScan } from '$lib/server/scan-feed';
import { hostScan } from '$lib/server/scan-host';
import { db } from '$lib/server/db';
import { event as eventTable, scan, user } from '$lib/server/db/schema';
import type { CodeScreen } from '$lib/server/scan-token';

/**
 * Writes the scan for an attendee whose proof has already been checked, under
 * the event the code was for, tells the screens at the door, and files a scan
 * for the admin whose code it came through.
 *
 * Returns the attendee's first name, or what is gone: the attendee (deleting
 * one cascades to their key, so this is a race at most), or the event — a
 * manual one can be deleted while its code is still on a screen, as long as
 * nobody has scanned it yet.
 */
export function recordScan(
	request: RequestEvent,
	proof: { userId: string; method: 'device' | 'lti'; codeScanId: string; screen: CodeScreen }
): { firstName: string } | { gone: 'attendee' | 'event' } {
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
			.select({ id: eventTable.id })
			.from(eventTable)
			.where(eq(eventTable.id, eventId))
			.get();
		if (!event) return { gone: 'event' as const };

		// Re-entry later means a new code scan and a new row; a double submit
		// rides the same one and is dropped by the unique index.
		const row = tx
			.insert(scan)
			.values({
				userId: proof.userId,
				eventId,
				method: proof.method,
				codeScanId: proof.codeScanId,
				ipAddress: request.getClientAddress(),
				userAgent: request.request.headers.get('user-agent')
			})
			.onConflictDoNothing()
			.returning({ id: scan.id, at: scan.scannedAt })
			.get();
		return { attendee, row };
	});
	if (outcome.gone) return { gone: outcome.gone };

	const { attendee, row } = outcome;
	if (row) {
		const host = hostScan(hostId, eventId, proof.codeScanId);
		// Counted after both, so the screen's number matches the names under it.
		const { present } = db
			.select({ present: countDistinct(scan.userId) })
			.from(scan)
			.where(eq(scan.eventId, eventId))
			.get()!;
		publishScan({ ...attendee, eventId, id: row.id, at: row.at.getTime(), present });
		if (host) publishScan({ ...host, present });
	}
	return { firstName: attendee.firstName };
}
