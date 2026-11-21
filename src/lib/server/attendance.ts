import { and, count, eq, max, min, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { scan, user } from '$lib/server/db/schema';
import { MANUAL_SUBJECTS } from '$lib/server/manual-entry';

/**
 * Whose a scan is, for counting and grouping by person: the attendee's, or
 * for a deleted one, the stand-in their scans for that event share (see
 * deleteAttendee). Never a user ID to look anyone up by.
 */
export const scanner = sql<string>`coalesce(${scan.userId}, ${scan.anonymousId})`;

/**
 * Whether a scan says who scanned: anything but typed-in details, or typed-in
 * details an organizer has since linked to an account (see link). A deleted
 * attendee's typed-in scans can't show either any more, so they don't count.
 * `is not`, as `reportedAs` is cleared when the typed-in person is deleted.
 */
export const verified = sql<boolean>`(${scan.method} <> 'manual' or (${scan.userId} is not null and ${scan.userId} is not ${scan.reportedAs}))`;

/**
 * Who came to an event, and when they scanned in and out: an attendee's first
 * scan is their scan-in, their last one their scan-out — if there are two or
 * more. Nobody says which way a scan goes; the order does. Worked out here on
 * each load, never stored, so it can't drift from the scans it comes from.
 *
 * A deleted attendee's row is still there, with no name or email.
 *
 * `manualScans` counts the ones typed in rather than confirmed, `verified`
 * says whether any of the person's scans says who they are (see verified), and
 * `manualEntry` says the person is only someone typed in, not a platform
 * account (see user). `userId` is null for a deleted attendee.
 */
export function attendance(eventId: string) {
	const scannedIn = min(scan.scannedAt);
	return db
		.select({
			scanner,
			userId: scan.userId,
			firstName: user.firstName,
			lastName: user.lastName,
			email: user.email,
			scannedIn,
			last: max(scan.scannedAt),
			scans: count(),
			manualScans: sql<number>`count(case when ${scan.method} = 'manual' then 1 end)`,
			verified: sql<boolean>`max(${verified})`.mapWith(Boolean),
			manualEntry: sql<boolean>`coalesce(${user.ltiSubject} like ${MANUAL_SUBJECTS}, 0)`.mapWith(
				Boolean
			)
		})
		.from(scan)
		.leftJoin(user, eq(user.id, scan.userId))
		.where(eq(scan.eventId, eventId))
		.groupBy(scanner)
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
