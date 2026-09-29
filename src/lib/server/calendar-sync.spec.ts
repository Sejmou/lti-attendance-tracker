import { beforeAll, beforeEach, expect, test } from 'vitest';
import { execFileSync } from 'node:child_process';
import { eq, like, or } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { parseFeed, syncCalendar } from './calendar-sync';
import { db } from './db';
import { event, scan, user } from './db/schema';

const PLATFORM = 'https://calendar-sync.test';
const NOW = new Date('2026-10-01T12:00:00Z');
const ours = or(like(event.calendarKey, '%@sync.test%'), like(event.title, 'calendar-sync.spec %'));

beforeAll(() => {
	// See scan-host.spec.ts.
	execFileSync('pnpm', ['exec', 'drizzle-kit', 'push', '--force'], {
		stdio: 'ignore',
		env: { ...process.env, DATABASE_URL: env.DATABASE_URL }
	});
	db.delete(user)
		.where(like(user.ltiSubject, `["${PLATFORM}"%`))
		.run();
});

// Only its own rows: other specs share the database, and run alongside.
beforeEach(() => {
	db.delete(scan).where(like(scan.codeScanId, 'calendar-sync-%')).run();
	db.delete(event).where(ours).run();
});

// What Google serves for a public calendar, cut down: its own VTIMEZONE for
// every zone it uses, and X-WR-TIMEZONE for the calendar's.
const VIENNA = `BEGIN:VTIMEZONE
TZID:Europe/Vienna
X-LIC-LOCATION:Europe/Vienna
BEGIN:DAYLIGHT
TZOFFSETFROM:+0100
TZOFFSETTO:+0200
TZNAME:CEST
DTSTART:19700329T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU
END:DAYLIGHT
BEGIN:STANDARD
TZOFFSETFROM:+0200
TZOFFSETTO:+0100
TZNAME:CET
DTSTART:19701025T030000
RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU
END:STANDARD
END:VTIMEZONE`;

const LECTURE = `BEGIN:VEVENT
DTSTART;TZID=Europe/Vienna:20261005T180000
DTEND;TZID=Europe/Vienna:20261005T200000
UID:lecture@sync.test
SUMMARY:Vortrag
LOCATION:Hörsaal 1
END:VEVENT`;

// Weekly on Mondays, ten times, from 7 September: the 21st is left out, the
// 28th moved to Tuesday afternoon, and 12 October cancelled on its own.
// Daylight saving ends on 25 October, in the middle of it.
const SERIES = `BEGIN:VEVENT
DTSTART;TZID=Europe/Vienna:20260907T100000
DTEND;TZID=Europe/Vienna:20260907T120000
RRULE:FREQ=WEEKLY;COUNT=10
EXDATE;TZID=Europe/Vienna:20260921T100000
UID:series@sync.test
SUMMARY:Übung
END:VEVENT
BEGIN:VEVENT
DTSTART;TZID=Europe/Vienna:20260929T140000
DTEND;TZID=Europe/Vienna:20260929T160000
RECURRENCE-ID;TZID=Europe/Vienna:20260928T100000
UID:series@sync.test
SUMMARY:Übung (verschoben)
END:VEVENT
BEGIN:VEVENT
DTSTART;TZID=Europe/Vienna:20261012T100000
DTEND;TZID=Europe/Vienna:20261012T120000
RECURRENCE-ID;TZID=Europe/Vienna:20261012T100000
STATUS:CANCELLED
UID:series@sync.test
SUMMARY:Übung
END:VEVENT`;

const ALL_DAY = `BEGIN:VEVENT
DTSTART;VALUE=DATE:20261010
DTEND;VALUE=DATE:20261011
UID:open-day@sync.test
SUMMARY:Tag der offenen Tür
END:VEVENT`;

const LONG_AGO = `BEGIN:VEVENT
DTSTART:20200101T100000Z
DTEND:20200101T110000Z
UID:long-ago@sync.test
SUMMARY:Damals
END:VEVENT`;

const feed = (...events: string[]) =>
	[
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'X-WR-TIMEZONE:Europe/Vienna',
		VIENNA,
		...events,
		'END:VCALENDAR'
	]
		.join('\n')
		.replaceAll('\n', '\r\n');

const rows = () => db.select().from(event).where(ours).orderBy(event.startsAt).all();
const byKey = (key: string) => db.select().from(event).where(eq(event.calendarKey, key)).get();

function attendee() {
	return db
		.insert(user)
		.values({
			id: crypto.randomUUID(),
			email: 'ada@example.com',
			firstName: 'Ada',
			lastName: 'Test',
			ltiSubject: JSON.stringify([PLATFORM, crypto.randomUUID()])
		})
		.returning()
		.get();
}

function scanFor(eventId: string) {
	db.insert(scan)
		.values({
			userId: attendee().id,
			eventId,
			method: 'device',
			codeScanId: `calendar-sync-${crypto.randomUUID()}`
		})
		.run();
}

test('times are read in the zone they were written in, across a DST change', () => {
	const from = new Date('2026-09-01T00:00:00Z');
	const to = new Date('2027-03-30T00:00:00Z');
	const { occurrences } = parseFeed(feed(LECTURE, SERIES, ALL_DAY), from, to);
	const find = (key: string) => occurrences.find((o) => o.calendarKey === key);

	expect(find('lecture@sync.test')).toMatchObject({
		title: 'Vortrag',
		location: 'Hörsaal 1',
		startsAt: new Date('2026-10-05T16:00:00Z'),
		endsAt: new Date('2026-10-05T18:00:00Z'),
		allDay: false
	});
	// 10:00 in Vienna is 08:00Z in summer and 09:00Z in winter.
	expect(find('series@sync.test|2026-10-05T08:00:00.000Z')?.startsAt).toEqual(
		new Date('2026-10-05T08:00:00Z')
	);
	expect(find('series@sync.test|2026-10-26T09:00:00.000Z')?.startsAt).toEqual(
		new Date('2026-10-26T09:00:00Z')
	);
	// A whole day starts at midnight in TIMEZONE, not the server's zone.
	expect(find('open-day@sync.test')).toMatchObject({
		startsAt: new Date('2026-10-09T22:00:00Z'),
		endsAt: new Date('2026-10-10T22:00:00Z'),
		allDay: true
	});
});

test('a whole day is that day in TIMEZONE, even in a calendar that says UTC', () => {
	const utc = feed(ALL_DAY).replace('X-WR-TIMEZONE:Europe/Vienna', 'X-WR-TIMEZONE:UTC');
	const { occurrences } = parseFeed(
		utc,
		new Date('2026-09-01T00:00:00Z'),
		new Date('2027-03-30T00:00:00Z')
	);
	expect(occurrences[0]).toMatchObject({
		startsAt: new Date('2026-10-09T22:00:00Z'),
		endsAt: new Date('2026-10-10T22:00:00Z')
	});
});

test('without a zone of its own, a feed is read in TIMEZONE', () => {
	const bare = ['BEGIN:VCALENDAR', 'VERSION:2.0', ALL_DAY, 'END:VCALENDAR'].join('\r\n');
	const { occurrences } = parseFeed(
		bare,
		new Date('2026-09-01T00:00:00Z'),
		new Date('2027-03-30T00:00:00Z')
	);
	expect(occurrences[0].startsAt).toEqual(new Date('2026-10-09T22:00:00Z'));
});

test('a series is expanded without its excluded and cancelled dates, a moved one keeps its key', () => {
	const from = new Date('2026-09-01T00:00:00Z');
	const to = new Date('2027-03-30T00:00:00Z');
	const series = parseFeed(feed(SERIES), from, to).occurrences;

	// Ten, less the 21st and 12 October.
	expect(series).toHaveLength(8);
	expect(series.some((o) => o.startsAt.toISOString().startsWith('2026-09-21'))).toBe(false);
	expect(series.some((o) => o.startsAt.toISOString().startsWith('2026-10-12'))).toBe(false);

	// Keyed by the date it was moved from, so moving it again changes nothing.
	expect(
		series.find((o) => o.calendarKey === 'series@sync.test|2026-09-28T08:00:00.000Z')
	).toMatchObject({
		title: 'Übung (verschoben)',
		startsAt: new Date('2026-09-29T12:00:00Z')
	});
});

test('only the window around now is synced', () => {
	syncCalendar(feed(LECTURE, SERIES, LONG_AGO), new Date('2026-10-10T12:00:00Z'));

	// 30 days back is 10 September: the 7th is out, the 14th in, and 2020 long gone.
	expect(rows().map((row) => row.calendarKey)).not.toContain('long-ago@sync.test');
	expect(rows()[0].startsAt).toEqual(new Date('2026-09-14T08:00:00Z'));
});

test('a resync updates rows in place instead of making new ones', () => {
	expect(syncCalendar(feed(LECTURE, SERIES), NOW)).toMatchObject({ added: 9, updated: 0 });
	const before = byKey('lecture@sync.test')!;

	const edited = LECTURE.replace('SUMMARY:Vortrag', 'SUMMARY:Gastvortrag').replaceAll(
		'20261005T',
		'20261006T'
	);
	expect(syncCalendar(feed(edited, SERIES), NOW)).toMatchObject({
		added: 0,
		updated: 9,
		deleted: 0
	});

	const after = byKey('lecture@sync.test')!;
	expect(after.id).toBe(before.id);
	expect(after).toMatchObject({ title: 'Gastvortrag', startsAt: new Date('2026-10-06T16:00:00Z') });
});

test('an event gone from the calendar is deleted, or kept if anyone scanned for it', () => {
	syncCalendar(feed(LECTURE, SERIES), NOW);
	const lecture = byKey('lecture@sync.test')!;
	const moved = byKey('series@sync.test|2026-09-28T08:00:00.000Z')!;
	scanFor(moved.id);

	// The whole series deleted in the calendar: its eight occurrences go, but
	// the one with a scan stays.
	expect(syncCalendar(feed(LECTURE), NOW)).toMatchObject({ deleted: 7, kept: 1 });
	expect(byKey('lecture@sync.test')?.id).toBe(lecture.id);
	expect(byKey(moved.calendarKey!)).toMatchObject({ id: moved.id, removedAt: NOW });
	expect(rows()).toHaveLength(2);

	// Put back in the calendar, it is the same row again, no longer removed.
	syncCalendar(feed(LECTURE, SERIES), NOW);
	expect(byKey(moved.calendarKey!)).toMatchObject({ id: moved.id, removedAt: null });
});

test('the sync leaves manual events and events outside the window alone', () => {
	const manual = db
		.insert(event)
		.values({
			source: 'manual',
			title: 'calendar-sync.spec Sommerfest',
			startsAt: new Date('2026-10-02T15:00:00Z'),
			endsAt: new Date('2026-10-02T20:00:00Z')
		})
		.returning()
		.get();
	const old = db
		.insert(event)
		.values({
			source: 'calendar',
			calendarKey: 'long-ago@sync.test',
			title: 'Damals',
			startsAt: new Date('2020-01-01T10:00:00Z'),
			endsAt: new Date('2020-01-01T11:00:00Z')
		})
		.returning()
		.get();

	syncCalendar(feed(LECTURE), NOW);

	expect(rows().map((row) => row.id)).toEqual(expect.arrayContaining([manual.id, old.id]));
});
