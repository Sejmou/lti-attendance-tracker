import { eq } from 'drizzle-orm';
import type { RequestEvent } from '@sveltejs/kit';
import { publishScan } from '$lib/server/scan-feed';
import { hostScan } from '$lib/server/scan-host';
import { db } from '$lib/server/db';
import { scan, user } from '$lib/server/db/schema';

/**
 * Writes the scan for an attendee whose proof has already been checked, tells the
 * screens at the door, and files a scan for the admin whose code it came
 * through. Returns the attendee's first name, or null if they no longer exist.
 */
export async function recordScan(
	event: RequestEvent,
	proof: { userId: string; method: 'device' | 'lti'; codeScanId: string; hostId: string }
) {
	const [attendee] = await db
		.select({ firstName: user.firstName, lastName: user.lastName })
		.from(user)
		.where(eq(user.id, proof.userId))
		.limit(1);
	// Deleting an attendee cascades to their key, so this is a race at most.
	if (!attendee) return null;

	// Re-entry later means a new code scan and a new row; a double submit rides
	// the same one and is dropped by the unique index.
	const [row] = await db
		.insert(scan)
		.values({
			userId: proof.userId,
			method: proof.method,
			codeScanId: proof.codeScanId,
			ipAddress: event.getClientAddress(),
			userAgent: event.request.headers.get('user-agent')
		})
		.onConflictDoNothing()
		.returning({ id: scan.id, at: scan.scannedAt });

	if (row) {
		publishScan({ ...attendee, id: row.id, at: row.at.getTime() });
		const host = hostScan(proof.hostId, proof.codeScanId);
		if (host) publishScan(host);
	}

	return attendee.firstName;
}
