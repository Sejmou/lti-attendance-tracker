import { error } from '@sveltejs/kit';
import { desc, eq } from 'drizzle-orm';
import { attendance, scanner } from '$lib/server/attendance';
import { db } from '$lib/server/db';
import { event as eventTable, scan, user } from '$lib/server/db/schema';
import { annotate } from '$lib/server/scan-log';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const event = db
		.select({
			id: eventTable.id,
			source: eventTable.source,
			title: eventTable.title,
			location: eventTable.location,
			startsAt: eventTable.startsAt,
			endsAt: eventTable.endsAt,
			allDay: eventTable.allDay,
			removedAt: eventTable.removedAt
		})
		.from(eventTable)
		.where(eq(eventTable.id, params.id))
		.get();
	if (!event) error(404, 'No such event');

	// ponytail: the whole log in one query on one page. An event is hundreds of
	// rows; add paging when a venue makes that untrue.
	const rows = db
		.select({
			at: scan.scannedAt,
			method: scan.method,
			ipAddress: scan.ipAddress,
			userAgent: scan.userAgent,
			codeScanId: scan.codeScanId,
			scanner,
			firstName: user.firstName,
			lastName: user.lastName,
			email: user.email
		})
		.from(scan)
		.leftJoin(user, eq(user.id, scan.userId))
		.where(eq(scan.eventId, event.id))
		.orderBy(desc(scan.scannedAt))
		.all();

	return { event, attendance: attendance(event.id), log: annotate(rows) };
};
