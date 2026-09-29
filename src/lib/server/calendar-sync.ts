import ICAL from 'ical.js';
import { and, eq, gte, inArray, isNotNull, lte } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import { event, scan } from '$lib/server/db/schema';
import { fromWallClock } from '$lib/time';

/**
 * How far back and ahead recurring events are expanded, and the range in
 * which an event missing from the feed counts as removed. Outside it, rows
 * are left as they are: an old event's scans stay attached to the row they
 * were filed under, whatever the calendar says now.
 */
const PAST_MS = 30 * 24 * 60 * 60_000;
const FUTURE_MS = 180 * 24 * 60 * 60_000;

/** Stops an open-ended rule with a tiny interval from spinning forever. */
const MAX_OCCURRENCES = 50_000;

type Occurrence = {
	calendarKey: string;
	title: string;
	location: string | null;
	startsAt: Date;
	endsAt: Date;
	allDay: boolean;
};

export type SyncResult = { added: number; updated: number; deleted: number; kept: number };

/**
 * Brings the calendar's events into `event`, from the text of its public iCal
 * feed. Upserts by `calendarKey`, so a resync changes the rows it already has
 * instead of making new ones, and scans stay where they were filed. An event
 * gone from the feed is deleted, or kept with `removedAt` set if it has scans.
 */
export function syncCalendar(ics: string, now = new Date()): SyncResult {
	const from = new Date(now.getTime() - PAST_MS);
	const to = new Date(now.getTime() + FUTURE_MS);
	const { occurrences, seen } = parseFeed(ics, from, to);

	return db.transaction((tx) => {
		const known = new Set(
			tx
				.select({ key: event.calendarKey })
				.from(event)
				.where(isNotNull(event.calendarKey))
				.all()
				.map((row) => row.key)
		);

		for (const occurrence of occurrences) {
			const values = { ...occurrence, removedAt: null };
			tx.insert(event)
				.values({ ...values, source: 'calendar' })
				.onConflictDoUpdate({ target: event.calendarKey, set: values })
				.run();
		}

		// Only rows in the window: outside it, the feed wasn't expanded, so
		// not finding one there says nothing.
		const missing = tx
			.select({ id: event.id, key: event.calendarKey, removedAt: event.removedAt })
			.from(event)
			.where(and(eq(event.source, 'calendar'), gte(event.startsAt, from), lte(event.startsAt, to)))
			.all()
			.filter((row) => !seen.has(row.key!));

		const withScans = new Set(
			missing.length === 0
				? []
				: tx
						.selectDistinct({ id: scan.eventId })
						.from(scan)
						.where(
							inArray(
								scan.eventId,
								missing.map((row) => row.id)
							)
						)
						.all()
						.map((row) => row.id)
		);

		const keep = missing.filter((row) => withScans.has(row.id));
		const drop = missing.filter((row) => !withScans.has(row.id));
		for (const row of keep) {
			if (!row.removedAt) {
				tx.update(event).set({ removedAt: now }).where(eq(event.id, row.id)).run();
			}
		}
		if (drop.length > 0) {
			tx.delete(event)
				.where(
					inArray(
						event.id,
						drop.map((row) => row.id)
					)
				)
				.run();
		}

		const added = occurrences.filter((o) => !known.has(o.calendarKey)).length;
		return {
			added,
			updated: occurrences.length - added,
			deleted: drop.length,
			kept: keep.length
		};
	});
}

/**
 * The occurrences starting in the window, and the keys of everything the feed
 * still has — in the window or not, so an event moved out of it isn't taken
 * for a removed one.
 */
export function parseFeed(ics: string, from: Date, to: Date) {
	const calendar = new ICAL.Component(ICAL.parse(ics));
	for (const zone of calendar.getAllSubcomponents('vtimezone')) {
		ICAL.TimezoneService.register(zone);
	}
	// A whole day is a date, not a stretch of time: 10 October is that day in
	// TIMEZONE, whatever zone the calendar says it is in (Google's holiday
	// calendars say UTC, which would make it 02:00 to 02:00 in Vienna).
	// Floating times are in the calendar's zone, or failing that TIMEZONE —
	// never the server's, which in a container is UTC.
	const tzid = calendar.getFirstPropertyValue('x-wr-timezone');
	const calendarZone = typeof tzid === 'string' ? ICAL.TimezoneService.get(tzid) : undefined;
	const pad = (n: number) => String(n).padStart(2, '0');
	const instant = (time: ICAL.Time) => {
		const { year, month, day, hour, minute, second } = time;
		const date = `${year}-${pad(month)}-${pad(day)}`;
		if (time.isDate) return fromWallClock(date)!;
		const floating = !time.zone || time.zone === ICAL.Timezone.localTimezone;
		if (!floating) return time.toJSDate();
		if (calendarZone) {
			return ICAL.Time.fromData(
				{ year, month, day, hour, minute, second, isDate: false },
				calendarZone
			).toJSDate();
		}
		const at = fromWallClock(date, `${pad(hour)}:${pad(minute)}`)!;
		return new Date(at.getTime() + second * 1000);
	};

	const vevents = calendar.getAllSubcomponents('vevent');
	const masters = new Map<string, ICAL.Event>();
	const exceptions: ICAL.Event[] = [];
	for (const vevent of vevents) {
		const item = new ICAL.Event(vevent);
		if (!item.uid) continue;
		if (item.isRecurrenceException()) exceptions.push(item);
		else masters.set(item.uid, item);
	}
	for (const exception of exceptions) {
		const master = masters.get(exception.uid);
		// An occurrence edited on its own, whose series isn't in this feed:
		// treated as the one event it is.
		if (master?.isRecurring()) master.relateException(exception);
		else masters.set(occurrenceKey(exception.uid, instant(exception.recurrenceId)), exception);
	}

	const occurrences: Occurrence[] = [];
	const seen = new Set<string>();
	const add = (key: string, item: ICAL.Event, start: ICAL.Time, end: ICAL.Time | undefined) => {
		if (isCancelled(item)) return;
		seen.add(key);
		const startsAt = instant(start);
		if (startsAt < from || startsAt > to) return;
		occurrences.push({
			calendarKey: key,
			title: item.summary || '',
			location: item.location || null,
			startsAt,
			endsAt: end ? instant(end) : startsAt,
			allDay: start.isDate
		});
	};

	for (const [key, item] of masters) {
		if (!item.isRecurring()) {
			add(item.isRecurrenceException() ? key : item.uid, item, item.startDate, item.endDate);
			continue;
		}
		// Walked from the series' first occurrence, which keeps COUNT right; the
		// ones before the window are only stepped over.
		const iterator = item.iterator();
		for (let i = 0, next = iterator.next(); next && i < MAX_OCCURRENCES; i++) {
			const at = instant(next);
			if (at > to) break;
			if (at >= from) {
				const details = item.getOccurrenceDetails(next);
				add(occurrenceKey(item.uid, at), details.item, details.startDate, details.endDate);
			}
			next = iterator.next();
		}
		// Occurrences moved into the window from outside the range walked above.
		// `exceptions` is a map by recurrence ID, whatever its type says.
		for (const exception of Object.values(item.exceptions ?? {}) as ICAL.Event[]) {
			const key = occurrenceKey(item.uid, instant(exception.recurrenceId));
			if (!seen.has(key)) add(key, exception, exception.startDate, exception.endDate);
		}
	}

	return { occurrences, seen };
}

function occurrenceKey(uid: string, recurrenceId: Date) {
	return `${uid}|${recurrenceId.toISOString()}`;
}

function isCancelled(item: ICAL.Event) {
	return String(item.component.getFirstPropertyValue('status') ?? '').toUpperCase() === 'CANCELLED';
}

/** How long a sync is good for before opening the events page does another. */
const STALE_MS = 15 * 60_000;

// ponytail: in-process, like the throttle. One server; a second one would
// sync on its own schedule, which the upserts make harmless.
let lastSync: { at: number; result: SyncResult } | null = null;
let running: Promise<SyncResult> | null = null;

/** Whether `CALENDAR_ICS_URL` is set. Without it, events are only made by hand. */
export const calendarConfigured = () => Boolean(env.CALENDAR_ICS_URL);

export function lastCalendarSync() {
	return lastSync;
}

/**
 * Fetches the feed and syncs it. Two calls at once share one fetch. Throws
 * if the feed can't be fetched or isn't a calendar; nothing is changed then.
 */
export function syncCalendarNow() {
	running ??= (async () => {
		try {
			const url = env.CALENDAR_ICS_URL;
			if (!url) throw new Error('CALENDAR_ICS_URL is not set');
			// Google hands out webcal:// links too; they are https underneath.
			const response = await fetch(url.replace(/^webcal:/i, 'https:'), {
				signal: AbortSignal.timeout(15_000)
			});
			if (!response.ok) throw new Error(`Calendar feed answered ${response.status}`);
			const ics = await response.text();
			if (!ics.trimStart().startsWith('BEGIN:VCALENDAR')) {
				throw new Error('Calendar feed is not an iCalendar file');
			}
			const result = syncCalendar(ics);
			lastSync = { at: Date.now(), result };
			return result;
		} finally {
			running = null;
		}
	})();
	return running;
}

/** Syncs if the last sync is older than 15 minutes; a failure only shows up in the log. */
export async function syncCalendarIfStale() {
	if (!calendarConfigured()) return;
	if (lastSync && Date.now() - lastSync.at < STALE_MS) return;
	await syncCalendarNow().catch((error) => console.error('Calendar sync failed:', error));
}
