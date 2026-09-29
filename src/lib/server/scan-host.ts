import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { scan, user } from '$lib/server/db/schema';

/**
 * Files a scan for the admin showing the code, once an attendee has got in through
 * it — someone at the door just scanned their screen, so they are evidently
 * there. Only if they have no scan yet: they don't step out and back in with
 * the screen, and a second row would count as their scan-out.
 *
 * Filed as `method: 'host'` — the admin hosting the screen — under the code
 * scan that triggered it, so the log pairs it with that attendee's row. `host`
 * proves less than `device`: nobody confirmed the admin's identity, only that
 * an attendee scanned the code their session was showing. No address or device:
 * the request in hand is the attendee's, not the screen's.
 *
 * One transaction, so two attendees arriving at once can't both find no row.
 * Returns the new row for the code screens, or null if none was written.
 */
export function hostScan(hostId: string, codeScanId: string) {
	return db.transaction((tx) => {
		const host = tx
			.select({ firstName: user.firstName, lastName: user.lastName })
			.from(user)
			// Only an admin session can show a code, and the code is signed, so
			// whoever it names was an organizer then. Deleted since, they're nobody.
			.where(eq(user.id, hostId))
			.get();
		if (!host) return null;

		const already = tx
			.select({ id: scan.id })
			.from(scan)
			.where(eq(scan.userId, hostId))
			.limit(1)
			.get();
		if (already) return null;

		const row = tx
			.insert(scan)
			.values({ userId: hostId, method: 'host', codeScanId })
			.returning({ id: scan.id, at: scan.scannedAt })
			.get();
		return { ...host, id: row.id, at: row.at.getTime() };
	});
}
