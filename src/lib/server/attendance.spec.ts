import { beforeAll, expect, test } from 'vitest';
import { execFileSync } from 'node:child_process';
import { like } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { attendance, direction } from './attendance';
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
