import { and, isNotNull, lt, or } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { deviceEnrollment, scan } from '$lib/server/db/schema';
import { pruneExpiredLaunches } from '$lib/server/lti/database-manager';

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
 * Runs every hour (see scheduleRetention), and also whenever a scan or a
 * setup is written and on every admin page.
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

const HOUR_MS = 60 * 60_000;

/**
 * Runs every pruning now and then every hour, from server start, so the limits
 * hold whether or not anyone uses the app: the 12 months here, and the 24
 * hours for launches (23 of them valid, plus at most an hour to the next run;
 * see pruneExpiredLaunches). The calls on writes and admin pages only get
 * there sooner.
 *
 * ponytail: setInterval, in-process. One box; a restart starts it over, and
 * starting is a run of its own.
 */
export function scheduleRetention() {
	const run = () => {
		try {
			pruneExpired();
			pruneExpiredLaunches();
		} catch (error) {
			// The next run tries again; a failed one mustn't take the server down.
			console.error('Pruning expired data failed:', error);
		}
	};
	run();
	// Unref'd: a pending run is no reason to keep the process alive.
	setInterval(run, HOUR_MS).unref();
}
