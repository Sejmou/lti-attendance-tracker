import { and, count, eq, max, min } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { scan, user } from '$lib/server/db/schema';

/**
 * Who came to an event, and when they scanned in and out: an attendee's first
 * scan is their scan-in, their last one their scan-out — if there are two or
 * more. Nobody says which way a scan goes; the order does. Worked out here on
 * each load, never stored, so it can't drift from the scans it comes from.
 */
export function attendance(eventId: string) {
	const scannedIn = min(scan.scannedAt);
	return db
		.select({
			userId: scan.userId,
			firstName: user.firstName,
			lastName: user.lastName,
			email: user.email,
			scannedIn,
			last: max(scan.scannedAt),
			scans: count()
		})
		.from(scan)
		.innerJoin(user, eq(user.id, scan.userId))
		.where(eq(scan.eventId, eventId))
		.groupBy(scan.userId)
		.orderBy(scannedIn)
		.all()
		.map(({ last, ...row }) => ({
			...row,
			scannedIn: row.scannedIn!,
			scannedOut: row.scans >= 2 ? last : null
		}));
}

/**
 * Which way the attendee's latest scan for the event counts, as things stand:
 * their first is a scan-in, anything after it their scan-out — until they
 * scan again, when the newer one is.
 */
export function direction(userId: string, eventId: string): 'in' | 'out' {
	const { scans } = db
		.select({ scans: count() })
		.from(scan)
		.where(and(eq(scan.userId, userId), eq(scan.eventId, eventId)))
		.get()!;
	return scans >= 2 ? 'out' : 'in';
}
