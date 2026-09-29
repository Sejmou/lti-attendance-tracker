import { calendarStale, syncCalendarInBackground } from '$lib/server/calendar-sync';
import { listEvents, suggestEvent } from '$lib/server/events';
import type { PageServerLoad } from './$types';

const DAY = 24 * 60 * 60_000;

/**
 * Which event the code is for, picked before it goes up: the organizer
 * decides, the page only suggests. Offers what is plausibly meant — from a
 * day back to a month ahead; the events page reaches everything else.
 */
export const load: PageServerLoad = async () => {
	const now = new Date();
	const events = listEvents(now).filter(
		(e) =>
			!e.removedAt &&
			e.endsAt.getTime() > now.getTime() - DAY &&
			e.startsAt.getTime() < now.getTime() + 30 * DAY
	);
	return {
		// Streamed, not awaited: see the events page.
		sync: calendarStale() ? syncCalendarInBackground() : null,
		events,
		suggested: suggestEvent(events, now)?.id ?? null,
		now
	};
};
