import { count, eq, gte } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { event, scan } from '$lib/server/db/schema';
import type { EventFieldErrors, EventFields } from '$lib/event-form';
import { fromWallClock } from '$lib/time';

/** How far back the events page lists events. */
const LISTED_PAST_MS = 30 * 24 * 60 * 60_000;

/**
 * The form's fields, and either the row to write or what is wrong with them.
 * Dates and times are read in TIMEZONE, whichever zone the organizer's
 * device is set to.
 */
export function parseEventForm(form: FormData) {
	const field = (name: keyof EventFields) => String(form.get(name) ?? '').trim();
	const fields: EventFields = {
		title: field('title'),
		location: field('location'),
		startDate: field('startDate'),
		startTime: field('startTime'),
		endDate: field('endDate'),
		endTime: field('endTime')
	};

	const errors: EventFieldErrors = {};
	if (!fields.title) errors.title = 'required';
	const startsAt = fromWallClock(fields.startDate, fields.startTime);
	const endsAt = fromWallClock(fields.endDate, fields.endTime);
	if (!startsAt) errors.start = fields.startDate && fields.startTime ? 'invalid' : 'required';
	if (!endsAt) errors.end = fields.endDate && fields.endTime ? 'invalid' : 'required';
	else if (startsAt && endsAt <= startsAt) errors.end = 'before_start';

	if (Object.keys(errors).length > 0) return { fields, errors, values: null };
	return {
		fields,
		errors: null,
		values: {
			title: fields.title,
			location: fields.location || null,
			startsAt: startsAt!,
			endsAt: endsAt!
		}
	};
}

/**
 * Events from 30 days ago on, soonest first, each with how many scans it has:
 * one that has any can't be deleted.
 *
 * ponytail: everything since then on one page. A calendar with hundreds of
 * events ahead would want paging or a date filter.
 */
export function listEvents(now = new Date()) {
	const scans = db
		.select({ eventId: scan.eventId, scans: count().as('scans') })
		.from(scan)
		.groupBy(scan.eventId)
		.as('scans');

	return db
		.select({
			id: event.id,
			source: event.source,
			title: event.title,
			location: event.location,
			startsAt: event.startsAt,
			endsAt: event.endsAt,
			allDay: event.allDay,
			removedAt: event.removedAt,
			scans: scans.scans
		})
		.from(event)
		.leftJoin(scans, eq(scans.eventId, event.id))
		.where(gte(event.endsAt, new Date(now.getTime() - LISTED_PAST_MS)))
		.orderBy(event.startsAt)
		.all()
		.map((row) => ({ ...row, scans: row.scans ?? 0 }));
}

type Timed = { startsAt: Date; endsAt: Date; removedAt: Date | null };

/**
 * The event an organizer most likely wants to show the code for: one that is
 * running, the latest to start if several overlap (a talk rather than the
 * all-day conference around it), or else the one nearest in time — by its
 * start if it is ahead, by its end if it is over. Never one removed from the
 * calendar. Only a suggestion: the organizer picks.
 */
export function suggestEvent<T extends Timed>(events: T[], now = new Date()) {
	const candidates = events.filter((e) => !e.removedAt);
	const running = candidates.filter((e) => e.startsAt <= now && now < e.endsAt);
	if (running.length > 0) {
		return running.reduce((a, b) => (b.startsAt > a.startsAt ? b : a));
	}
	const distance = (e: T) =>
		e.startsAt > now ? e.startsAt.getTime() - now.getTime() : now.getTime() - e.endsAt.getTime();
	return candidates.reduce<T | null>(
		(best, e) => (best === null || distance(e) < distance(best) ? e : best),
		null
	);
}

/** A manual event, the only kind the app edits or deletes. */
export function manualEvent(id: string) {
	const row = db
		.select({ id: event.id, source: event.source })
		.from(event)
		.where(eq(event.id, id))
		.get();
	return row?.source === 'manual' ? row : null;
}

export function hasScans(eventId: string) {
	return (
		db.select({ id: scan.id }).from(scan).where(eq(scan.eventId, eventId)).limit(1).get() != null
	);
}
