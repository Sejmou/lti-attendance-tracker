import { and, isNotNull, lt, or } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { deviceEnrollment, scan } from '$lib/server/db/schema';

/** How long the data kept against abuse is kept: twelve calendar months. */
export function retentionCutoff(now = new Date()) {
	const cutoff = new Date(now);
	cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 1);
	return cutoff;
}

/**
 * Forgets what is only kept against abuse once it is older than 12 months:
 * the address hash and user agent on scans (the scans themselves stay), and
 * the phone setup log.
 *
 * There is no timer, so like DrizzleDatabaseManager's pruning this runs
 * whenever a scan or a setup is written, and on every admin page, so nothing
 * outlives the limit through a quiet season.
 *
 * ponytail: unthrottled. Both are index range scans over a club's worth of
 * rows; batch it if a page ever feels it.
 */
export function pruneExpired(now = new Date()) {
	const cutoff = retentionCutoff(now);
	db.transaction((tx) => {
		tx.update(scan)
			.set({ ipHash: null, userAgent: null })
			.where(and(lt(scan.scannedAt, cutoff), or(isNotNull(scan.ipHash), isNotNull(scan.userAgent))))
			.run();
		tx.delete(deviceEnrollment).where(lt(deviceEnrollment.enrolledAt, cutoff)).run();
	});
}
