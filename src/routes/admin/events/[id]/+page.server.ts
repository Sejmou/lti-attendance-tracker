import { error, fail } from '@sveltejs/kit';
import { desc, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { attendance } from '$lib/server/attendance';
import { db } from '$lib/server/db';
import { event as eventTable, scan, user } from '$lib/server/db/schema';
import { annotate } from '$lib/server/scan-log';
import { link, linkSuggestions, unlink } from '$lib/server/manual-entry';
import type { Actions, PageServerLoad } from './$types';

const typedIn = alias(user, 'typed_in');
const keyOwner = alias(user, 'key_owner');

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
			userId: scan.userId,
			firstName: user.firstName,
			lastName: user.lastName,
			email: user.email,
			browserId: scan.browserId,
			reportedAs: scan.reportedAs,
			// What was typed in, for a scan since linked to a platform account.
			typedEmail: typedIn.email,
			deviceKeyUserId: scan.deviceKeyUserId,
			keyOwnerFirstName: keyOwner.firstName,
			keyOwnerLastName: keyOwner.lastName
		})
		.from(scan)
		.innerJoin(user, eq(user.id, scan.userId))
		.leftJoin(typedIn, eq(typedIn.id, scan.reportedAs))
		.leftJoin(keyOwner, eq(keyOwner.id, scan.deviceKeyUserId))
		.where(eq(scan.eventId, event.id))
		.orderBy(desc(scan.scannedAt))
		.all();
	const log = annotate(rows);

	// Per attendee: whether the log flags any of their scans, and whom they
	// were typed in as, if their scans have since been linked to them.
	const flagged = new Set<string>();
	const linked = new Map<string, Map<string, string>>();
	for (const row of log.rows) {
		if (row.sharedBrowser || row.otherPersonsPhone) flagged.add(row.userId);
		if (row.reportedAs && row.reportedAs !== row.userId && row.typedEmail) {
			if (!linked.has(row.userId)) linked.set(row.userId, new Map());
			linked.get(row.userId)!.set(row.reportedAs, row.typedEmail);
		}
	}

	const rowsOfAttendees = attendance(event.id);
	const suggestions = linkSuggestions(
		rowsOfAttendees.filter((row) => row.manualEntry).map((row) => row.userId)
	);

	return {
		event,
		attendance: rowsOfAttendees.map((row) => ({
			...row,
			flagged: flagged.has(row.userId),
			suggestions: suggestions.get(row.userId) ?? [],
			linkedFrom: [...(linked.get(row.userId) ?? [])].map(([reportedAs, email]) => ({
				reportedAs,
				email
			}))
		})),
		log
	};
};

export const actions: Actions = {
	/** Files what someone typed in under a platform account: see `link`. */
	// Only for organizers, like every admin action: see handleAdminSession.
	link: async ({ params, request }) => {
		const form = await request.formData();
		const reportedAs = form.get('reportedAs');
		const userId = form.get('userId');
		if (typeof reportedAs !== 'string' || typeof userId !== 'string') {
			return fail(400, { linkFailed: true });
		}
		if (!link(params.id, reportedAs, userId)) return fail(409, { linkFailed: true });
		return { linked: true };
	},

	unlink: async ({ params, request }) => {
		const reportedAs = (await request.formData()).get('reportedAs');
		if (typeof reportedAs !== 'string') return fail(400, { linkFailed: true });
		unlink(params.id, reportedAs);
		return { unlinked: true };
	}
};
