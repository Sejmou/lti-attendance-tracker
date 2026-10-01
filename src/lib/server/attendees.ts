import { and, count, eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { deviceKey, scan, user } from '$lib/server/db/schema';

/**
 * Everyone who has launched either tool, organizers included, with when they
 * first and last did, how many scans they have and whether a phone is linked.
 *
 * ponytail: one page, no paging. A club is hundreds of people at most.
 */
export function listAttendees() {
	const scans = db
		.select({ userId: scan.userId, scans: count().as('scans') })
		.from(scan)
		.groupBy(scan.userId)
		.as('scans');
	return db
		.select({
			id: user.id,
			firstName: user.firstName,
			lastName: user.lastName,
			email: user.email,
			createdAt: user.createdAt,
			lastSeenAt: user.lastSeenAt,
			scans: sql<number>`coalesce(${scans.scans}, 0)`,
			linked: sql<boolean>`${deviceKey.id} is not null`.mapWith(Boolean)
		})
		.from(user)
		.leftJoin(scans, eq(scans.userId, user.id))
		.leftJoin(deviceKey, eq(deviceKey.userId, user.id))
		.orderBy(user.lastName, user.firstName)
		.all();
}

/**
 * Deletes an attendee and everything that identifies them, keeping their
 * scans for the events' statistics. Each event's scans of theirs get a random
 * `anonymousId` of their own, so their scan-in, scan-out and count for it
 * survive, but nothing ties those to them or to each other across events.
 * The address and device go, and `codeScanId` is replaced, as it would match
 * the host scan that rode in on the same code scan.
 *
 * Their device key goes with the `user` row, by cascade. Returns whether
 * there was anyone to delete.
 */
export function deleteAttendee(userId: string) {
	return db.transaction((tx) => {
		const events = tx
			.selectDistinct({ eventId: scan.eventId })
			.from(scan)
			.where(eq(scan.userId, userId))
			.all();
		// Before the user row goes: the cascade would take these scans with it.
		for (const { eventId } of events) {
			tx.update(scan)
				.set({
					anonymousId: crypto.randomUUID(),
					userId: null,
					ipHash: null,
					userAgent: null,
					// Per row, the length of a real one.
					codeScanId: sql`lower(hex(randomblob(8)))`
				})
				.where(and(eq(scan.userId, userId), eq(scan.eventId, eventId)))
				.run();
		}
		return tx.delete(user).where(eq(user.id, userId)).run().changes > 0;
	});
}
