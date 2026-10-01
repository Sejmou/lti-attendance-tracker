import { error } from '@sveltejs/kit';
import { countDistinct, desc, eq, sql } from 'drizzle-orm';
import QRCode from 'qrcode';
import { env } from '$env/dynamic/private';
import { resolve } from '$app/paths';
import { scanner } from '$lib/server/attendance';
import { displayNames } from '$lib/server/display-name';
import { db } from '$lib/server/db';
import { event as eventTable, scan, user } from '$lib/server/db/schema';
import { bucketToken, msUntilNextBucket } from '$lib/server/scan-token';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const event = db
		.select({ id: eventTable.id, title: eventTable.title })
		.from(eventTable)
		.where(eq(eventTable.id, params.id))
		.get();
	if (!event) error(404, 'No such event');

	const scanUrl = new URL(resolve('/scan'), env.ORIGIN);
	// The admin layout already turned away anyone who isn't one.
	const screen = { hostId: locals.admin!.id, eventId: event.id };
	scanUrl.searchParams.set('t', bucketToken(screen));

	const [qr, [{ present }], recent] = await Promise.all([
		// Rendered here rather than in the browser so the page needs no QR library.
		QRCode.toString(scanUrl.toString(), { type: 'svg', margin: 1, width: 420 }),
		// Distinct: re-entry writes another row, and the headline number is people,
		// deleted ones included.
		db
			.select({ present: countDistinct(scanner) })
			.from(scan)
			.where(eq(scan.eventId, event.id)),
		db
			.select({
				id: scan.id,
				at: scan.scannedAt,
				userId: user.id,
				// As the live feed says it: out if they have an earlier scan here.
				direction: sql<'in' | 'out'>`case when exists (
					select 1 from ${scan} as earlier
					where coalesce(earlier.user_id, earlier.anonymous_id) = ${scanner}
						and earlier.event_id = ${scan.eventId}
						and earlier.scanned_at < ${scan.scannedAt}
				) then 'out' else 'in' end`
			})
			.from(scan)
			.leftJoin(user, eq(user.id, scan.userId))
			.where(eq(scan.eventId, event.id))
			.orderBy(desc(scan.scannedAt))
			.limit(5)
	]);

	// The same short names the live feed sends: the full name never reaches
	// this screen. Null for a deleted attendee.
	const names = displayNames();
	const arrivals = recent.map(({ userId, ...arrival }) => ({
		...arrival,
		displayName: userId ? names.get(userId)! : null
	}));

	// No "of how many": there is no attendee list, only whoever has opened the
	// Moodle activity so far, which says nothing about who is coming.
	return { event, qr, present, recent: arrivals, msUntilNextBucket: msUntilNextBucket() };
};
