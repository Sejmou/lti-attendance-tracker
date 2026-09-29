import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { checkIn, user } from '$lib/server/db/schema';

/**
 * Checks in the admin showing the code, once a guest has got in through it —
 * someone at the door just scanned their screen, so they are evidently there.
 * Only if they have no check-in yet: they don't step out and back in with the
 * screen, and a second row would flag them as a repeat in the log.
 *
 * Filed as `method: 'host'` — the admin hosting the screen — under the scan
 * that triggered it, so the log pairs it with that guest's row. `host` proves
 * less than `device`: nobody confirmed the admin's identity, only
 * that a guest scanned the code their session was showing. No address or
 * device: the request in hand is the guest's, not the screen's.
 *
 * One transaction, so two guests arriving at once can't both find no row.
 * Returns the new row for the check-in screens, or null if none was written.
 */
export function checkInHost(hostId: string, scan: string) {
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
			.select({ id: checkIn.id })
			.from(checkIn)
			.where(eq(checkIn.userId, hostId))
			.limit(1)
			.get();
		if (already) return null;

		const row = tx
			.insert(checkIn)
			.values({ userId: hostId, method: 'host', scanId: scan })
			.returning({ id: checkIn.id, at: checkIn.checkedInAt })
			.get();
		return { ...host, id: row.id, at: row.at.getTime() };
	});
}
