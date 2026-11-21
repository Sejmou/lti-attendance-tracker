import { count, countDistinct, eq, sql } from 'drizzle-orm';
import { scanner, verified } from '$lib/server/attendance';
import { db } from '$lib/server/db';
import { event, scan } from '$lib/server/db/schema';
import type { EventFieldErrors, EventFields } from '$lib/event-form';
import { fromWallClock, wallClock } from '$lib/time';

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
 * Every event, soonest first, each with how many scans it has
 * (one that has any can't be deleted), how many people attended it with a
 * verified scan, and how many only typed in details nobody has linked yet:
 * the same split as its page.
 *
 * ponytail: all of them, ever, on one page, filtered in the browser. Fine for
 * a few hundred; past that, page it or filter by date in the query.
 */
export function listEvents() {
	const scans = db
		.select({
			eventId: scan.eventId,
			scans: count().as('scans'),
			people: countDistinct(scanner).as('people'),
			attendees: sql<number>`count(distinct case when ${verified} then ${scanner} end)`.as(
				'attendees'
			)
		})
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
			scans: scans.scans,
			people: scans.people,
			attendees: scans.attendees
		})
		.from(event)
		.leftJoin(scans, eq(scans.eventId, event.id))
		.orderBy(event.startsAt)
		.all()
		.map(({ people, ...row }) => ({
			...row,
			scans: row.scans ?? 0,
			attendees: row.attendees ?? 0,
			unconfirmed: (people ?? 0) - (row.attendees ?? 0)
		}));
}

type Timed = {
	startsAt: Date;
	endsAt: Date;
	allDay: boolean;
	source: 'calendar' | 'manual';
	removedAt: Date | null;
};

const DAY = 24 * 60 * 60_000;

/**
 * Days a calendar blocks for something big (a whole-day event, or one lasting
 * a day or more), with the events that actually happen entered inside them.
 */
const isBlock = (e: Timed) => e.allDay || e.endsAt.getTime() - e.startsAt.getTime() >= DAY;

/**
 * The event an organizer most likely wants to show the code for. First among
 * today's events that aren't blocks: one that is running, the latest to start
 * if several overlap, or else the nearest in time. Only with none of those
 * today the same among all of them, blocks included. Never one removed from
 * the calendar. Only a suggestion: the organizer picks.
 */
export function suggestEvent<T extends Timed>(events: T[], now = new Date()) {
	const candidates = events.filter((e) => !e.removedAt);
	const today = wallClock(now).date;
	// Shorter than a day, so one running now starts or ends today too.
	const specificToday = candidates.filter(
		(e) =>
			!isBlock(e) && (wallClock(e.startsAt).date === today || wallClock(e.endsAt).date === today)
	);
	return nearest(specificToday, now) ?? nearest(candidates, now);
}

/**
 * One that is running, the latest to start if several overlap, or else the
 * nearest in time: by its start if it is ahead, by its end if it is over. A tie
 * goes to an event made here rather than synced: an organizer created it on
 * purpose, often for this very screen.
 */
function nearest<T extends Timed>(events: T[], now: Date) {
	const running = events.filter((e) => e.startsAt <= now && now < e.endsAt);
	const distance = (e: T) =>
		e.startsAt > now ? e.startsAt.getTime() - now.getTime() : now.getTime() - e.endsAt.getTime();
	// Lower is better.
	const rank = running.length > 0 ? (e: T) => -e.startsAt.getTime() : distance;
	const manual = (e: T) => Number(e.source === 'manual');
	const pool = running.length > 0 ? running : events;
	return pool.toSorted((a, b) => rank(a) - rank(b) || manual(b) - manual(a))[0] ?? null;
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
