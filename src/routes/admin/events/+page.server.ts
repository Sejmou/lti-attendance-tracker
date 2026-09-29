import { fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import {
	calendarConfigured,
	lastCalendarSync,
	syncCalendarIfStale,
	syncCalendarNow
} from '$lib/server/calendar-sync';
import { db } from '$lib/server/db';
import { event } from '$lib/server/db/schema';
import { hasScans, listEvents, manualEvent, parseEventForm } from '$lib/server/events';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	// Opening the page is what keeps the calendar fresh; no timer runs otherwise.
	await syncCalendarIfStale();
	return {
		events: listEvents(),
		now: new Date(),
		calendar: calendarConfigured() ? { lastSync: lastCalendarSync() } : null
	};
};

export const actions: Actions = {
	sync: async () => {
		try {
			return { synced: await syncCalendarNow() };
		} catch (error) {
			console.error('Calendar sync failed:', error);
			return fail(502, { syncFailed: true });
		}
	},

	create: async ({ request }) => {
		const { fields, errors, values } = parseEventForm(await request.formData());
		if (!values) return fail(400, { fields, errors });
		db.insert(event)
			.values({ ...values, source: 'manual' })
			.run();
		return { saved: true };
	},

	update: async ({ request }) => {
		const form = await request.formData();
		const target = manualEvent(String(form.get('id')));
		// Calendar events are the calendar's: the next sync would undo an edit.
		if (!target) return fail(404, { missing: true });

		const { fields, errors, values } = parseEventForm(form);
		if (!values) return fail(400, { fields, errors });
		db.update(event).set(values).where(eq(event.id, target.id)).run();
		return { saved: true };
	},

	delete: async ({ request }) => {
		const target = manualEvent(String((await request.formData()).get('id')));
		if (!target) return fail(404, { missing: true });
		// Its scan-ins and scan-outs would go with it.
		if (hasScans(target.id)) return fail(409, { hasScans: true });
		db.delete(event).where(eq(event.id, target.id)).run();
		return { deleted: true };
	}
};
