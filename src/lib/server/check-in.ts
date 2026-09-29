import { eq } from 'drizzle-orm';
import type { RequestEvent } from '@sveltejs/kit';
import { publishCheckIn } from '$lib/server/check-in-events';
import { checkInHost } from '$lib/server/check-in-host';
import { db } from '$lib/server/db';
import { checkIn, user } from '$lib/server/db/schema';

/**
 * Writes the check-in for a guest whose proof has already been checked, tells
 * the screens at the door, and checks in the admin whose code it came through.
 * Returns the guest's first name, or null if they no longer exist.
 */
export async function recordCheckIn(
	event: RequestEvent,
	check: { userId: string; method: 'device' | 'lti'; scanId: string; hostId: string }
) {
	const [guest] = await db
		.select({ firstName: user.firstName, lastName: user.lastName })
		.from(user)
		.where(eq(user.id, check.userId))
		.limit(1);
	// Deleting a guest cascades to their key, so this is a race at most.
	if (!guest) return null;

	// Re-entry later means a new scan and a new row; a double submit rides the
	// same one and is dropped by the unique index.
	const [row] = await db
		.insert(checkIn)
		.values({
			userId: check.userId,
			method: check.method,
			scanId: check.scanId,
			ipAddress: event.getClientAddress(),
			userAgent: event.request.headers.get('user-agent')
		})
		.onConflictDoNothing()
		.returning({ id: checkIn.id, at: checkIn.checkedInAt });

	if (row) {
		publishCheckIn({ ...guest, id: row.id, at: row.at.getTime() });
		const host = checkInHost(check.hostId, check.scanId);
		if (host) publishCheckIn(host);
	}

	return guest.firstName;
}
