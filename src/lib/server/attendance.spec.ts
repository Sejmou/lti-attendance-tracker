import { beforeAll, expect, test } from 'vitest';
import { execFileSync } from 'node:child_process';
import { like } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { attendance, direction } from './attendance';
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
