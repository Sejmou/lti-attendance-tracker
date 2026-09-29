import { countDistinct, desc, eq } from 'drizzle-orm';
import QRCode from 'qrcode';
import { env } from '$env/dynamic/private';
import { resolve } from '$app/paths';
import { db } from '$lib/server/db';
import { scan, user } from '$lib/server/db/schema';
import { bucketToken, msUntilNextBucket } from '$lib/server/scan-token';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const scanUrl = new URL(resolve('/scan'), env.ORIGIN);
	// The admin layout already turned away anyone who isn't one.
	scanUrl.searchParams.set('t', bucketToken(event.locals.admin!.id));

	const [qr, [{ present }], recent] = await Promise.all([
		// Rendered here rather than in the browser so the page needs no QR library.
		QRCode.toString(scanUrl.toString(), { type: 'svg', margin: 1, width: 420 }),
		// Distinct: re-entry writes another row, and the headline number is people.
		db.select({ present: countDistinct(scan.userId) }).from(scan),
		db
			.select({
				id: scan.id,
				at: scan.scannedAt,
				firstName: user.firstName,
				lastName: user.lastName
			})
			.from(scan)
			.innerJoin(user, eq(user.id, scan.userId))
			.orderBy(desc(scan.scannedAt))
			.limit(5)
	]);

	// No "of how many": there is no attendee list, only whoever has opened the
	// Moodle activity so far, which says nothing about who is coming.
	return { qr, present, recent, msUntilNextBucket: msUntilNextBucket() };
};
