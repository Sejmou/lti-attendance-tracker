import { beforeAll, expect, test } from 'vitest';
import { execFileSync } from 'node:child_process';
import { inArray, like } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { attendance, attendanceByName, direction, myAttendance } from './attendance';
import { listEvents } from './events';
import { link } from './manual-entry';
import { db } from './db';
import { event, scan, user } from './db/schema';

const PLATFORM = 'https://attendance.test';

beforeAll(() => {
	// See scan-host.spec.ts.
	execFileSync('pnpm', ['exec', 'drizzle-kit', 'push', '--force'], {
		stdio: 'ignore',
		env: { ...process.env, DATABASE_URL: env.DATABASE_URL }
	});
	// Their scans cascade, which frees the events.
	db.delete(user)
		.where(like(user.ltiSubject, `["${PLATFORM}"%`))
		.run();
	db.delete(user).where(like(user.email, '%@typed.attendance.test')).run();
	// A deleted attendee's scans don't cascade with anyone.
	const events = db
		.select({ id: event.id })
		.from(event)
		.where(like(event.title, 'attendance.spec %'));
	db.delete(scan).where(inArray(scan.eventId, events)).run();
	db.delete(event).where(like(event.title, 'attendance.spec %')).run();
});

function someone(firstName: string) {
	return db
		.insert(user)
		.values({
			id: crypto.randomUUID(),
			email: `${firstName.toLowerCase()}@example.com`,
			firstName,
			lastName: 'Test',
			ltiSubject: JSON.stringify([PLATFORM, crypto.randomUUID()])
		})
		.returning()
		.get();
}

function someEvent(title: string) {
	return db
		.insert(event)
		.values({
			source: 'manual',
			title: `attendance.spec ${title}`,
			startsAt: new Date('2026-10-05T16:00:00Z'),
			endsAt: new Date('2026-10-05T20:00:00Z')
		})
		.returning()
		.get();
}

const at = (hhmm: string) => new Date(`2026-10-05T${hhmm}:00Z`);
function scanAt(userId: string, eventId: string, hhmm: string) {
	db.insert(scan)
		.values({
			userId,
			eventId,
			method: 'device',
			codeScanId: crypto.randomUUID(),
			scannedAt: at(hhmm)
		})
		.run();
}

test('the first scan is the scan-in and the last the scan-out; one scan is only a scan-in', () => {
	const talk = someEvent('talk');
	const ada = someone('Ada');
	const grace = someone('Grace');
	// Ada steps out for air in between; Grace never scans out.
	scanAt(ada.id, talk.id, '16:02');
	scanAt(ada.id, talk.id, '17:30');
	scanAt(ada.id, talk.id, '19:55');
	scanAt(grace.id, talk.id, '16:10');

	expect(attendance(talk.id)).toEqual([
		expect.objectContaining({
			firstName: 'Ada',
			scannedIn: at('16:02'),
			scannedOut: at('19:55'),
			scans: 3
		}),
		expect.objectContaining({
			firstName: 'Grace',
			scannedIn: at('16:10'),
			scannedOut: null,
			scans: 1
		})
	]);
});

test("another event's scans are its own", () => {
	const morning = someEvent('morning');
	const evening = someEvent('evening');
	const ada = someone('Ada');
	scanAt(ada.id, morning.id, '16:00');
	scanAt(ada.id, evening.id, '18:00');

	expect(attendance(morning.id)).toMatchObject([{ scannedIn: at('16:00'), scannedOut: null }]);
	expect(direction(ada.id, evening.id)).toBe('in');
	scanAt(ada.id, evening.id, '19:00');
	expect(direction(ada.id, evening.id)).toBe('out');
});

test('the events list counts people with a verified scan, and apart from them who only typed in details', () => {
	const talk = someEvent('counted');
	const ada = someone('Ada');
	const grace = someone('Grace');
	scanAt(ada.id, talk.id, '16:02');
	scanAt(ada.id, talk.id, '19:55');
	scanAt(grace.id, talk.id, '16:10');
	// Two typed in their details; an organizer has linked one of them to her account.
	const typedIn = (firstName: string) => {
		const email = `${firstName.toLowerCase()}.${crypto.randomUUID()}@typed.attendance.test`;
		return db
			.insert(user)
			.values({
				id: crypto.randomUUID(),
				email,
				firstName,
				lastName: 'Test',
				ltiSubject: JSON.stringify(['manual', email])
			})
			.returning()
			.get();
	};
	const tom = typedIn('Tom');
	const lin = typedIn('Lin');
	const linsAccount = someone('Lin');
	for (const person of [tom, lin]) {
		db.insert(scan)
			.values({
				userId: person.id,
				reportedAs: person.id,
				eventId: talk.id,
				method: 'manual',
				codeScanId: crypto.randomUUID(),
				scannedAt: at('16:30')
			})
			.run();
	}
	expect(link(talk.id, lin.id, linsAccount.id)).toBeTruthy();

	const row = listEvents().find((listed) => listed.id === talk.id);
	expect(row).toMatchObject({ scans: 5, attendees: 3, unconfirmed: 1 });
	// Ada, Grace and Lin's account; Tom isn't.
	const verified = attendance(talk.id).filter((person) => person.verified);
	expect(verified.map((person) => person.firstName).sort()).toEqual(['Ada', 'Grace', 'Lin']);
});

test("an attendee's own attendance: newest event first, each with its scans in order", () => {
	const ada = someone('Ada');
	const earlier = someEvent('mine earlier');
	const later = db
		.insert(event)
		.values({
			source: 'manual',
			title: 'attendance.spec mine later',
			startsAt: new Date('2026-10-12T16:00:00Z'),
			endsAt: new Date('2026-10-12T20:00:00Z')
		})
		.returning()
		.get();
	scanAt(ada.id, earlier.id, '19:55');
	scanAt(ada.id, earlier.id, '16:02');
	db.insert(scan)
		.values({
			userId: ada.id,
			eventId: later.id,
			method: 'manual',
			// Typed in as someone else, then linked to Ada by an organizer.
			reportedAs: crypto.randomUUID(),
			codeScanId: crypto.randomUUID(),
			scannedAt: new Date('2026-10-12T16:05:00Z')
		})
		.run();
	scanAt(someone('Grace').id, earlier.id, '16:10');

	expect(myAttendance(ada.id)).toEqual([
		expect.objectContaining({
			id: later.id,
			scans: [{ scannedAt: new Date('2026-10-12T16:05:00Z'), method: 'manual', linked: true }]
		}),
		expect.objectContaining({
			id: earlier.id,
			scans: [
				{ scannedAt: at('16:02'), method: 'device', linked: false },
				{ scannedAt: at('19:55'), method: 'device', linked: false }
			]
		})
	]);
});

test('by name, one row for a name scanned under two accounts; deleted attendees are left out', () => {
	const talk = someEvent('by name');
	const ada = someone('Ada');
	// The same name typed in, never linked to Ada's account.
	const email = `ada.${crypto.randomUUID()}@typed.attendance.test`;
	const typed = db
		.insert(user)
		.values({
			id: crypto.randomUUID(),
			email,
			firstName: 'Ada',
			lastName: 'Test',
			ltiSubject: JSON.stringify(['manual', email])
		})
		.returning()
		.get();
	db.insert(scan)
		.values({
			userId: typed.id,
			reportedAs: typed.id,
			eventId: talk.id,
			method: 'manual',
			codeScanId: crypto.randomUUID(),
			scannedAt: at('16:05')
		})
		.run();
	scanAt(ada.id, talk.id, '19:50');
	db.insert(scan)
		.values({
			anonymousId: crypto.randomUUID(),
			eventId: talk.id,
			method: 'device',
			codeScanId: crypto.randomUUID(),
			scannedAt: at('16:00')
		})
		.run();

	expect(attendanceByName(talk.id)).toEqual([
		{
			firstName: 'Ada',
			lastName: 'Test',
			scannedIn: at('16:05'),
			scannedOut: at('19:50'),
			scans: 2,
			manualScans: 1
		}
	]);
});
