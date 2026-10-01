import { beforeAll, expect, test } from 'vitest';
import { execFileSync } from 'node:child_process';
import { eq, inArray, like, or } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { attendance } from './attendance';
import { deleteAttendee, listAttendees } from './attendees';
import { db } from './db';
import { deviceKey, event, scan, user } from './db/schema';

const PLATFORM = 'https://attendees.test';

beforeAll(() => {
	// See scan-host.spec.ts.
	execFileSync('pnpm', ['exec', 'drizzle-kit', 'push', '--force'], {
		stdio: 'ignore',
		env: { ...process.env, DATABASE_URL: env.DATABASE_URL }
	});
	db.delete(user)
		.where(like(user.ltiSubject, `["${PLATFORM}"%`))
		.run();
	// Anonymised scans no longer cascade with anyone, so they go by event.
	const events = db
		.select({ id: event.id })
		.from(event)
		.where(like(event.title, 'attendees.spec %'))
		.all()
		.map((e) => e.id);
	db.delete(scan).where(inArray(scan.eventId, events)).run();
	db.delete(event).where(inArray(event.id, events)).run();
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
			title: `attendees.spec ${title}`,
			startsAt: new Date('2026-10-05T16:00:00Z'),
			endsAt: new Date('2026-10-05T20:00:00Z')
		})
		.returning()
		.get();
}

const at = (hhmm: string) => new Date(`2026-10-05T${hhmm}:00Z`);
function scanAt(
	userId: string,
	eventId: string,
	hhmm: string,
	codeScanId: string = crypto.randomUUID()
) {
	db.insert(scan)
		.values({
			userId,
			eventId,
			method: 'device',
			codeScanId,
			scannedAt: at(hhmm),
			ipAddress: '10.0.0.1',
			userAgent: 'Phone'
		})
		.run();
}

test("deleting an attendee keeps each event's attendance as it was, with nothing pointing at them", () => {
	const talk = someEvent('talk');
	const party = someEvent('party');
	const ada = someone('Ada');
	const grace = someone('Grace');
	const host = someone('Host');
	db.insert(deviceKey)
		.values({ userId: ada.id, publicKey: { kty: 'EC', crv: 'P-256', x: 'x', y: 'y' } })
		.run();

	scanAt(ada.id, talk.id, '16:02', 'ada-in');
	// The organizer's screen filed a scan for them on Ada's code scan.
	db.insert(scan)
		.values({ userId: host.id, eventId: talk.id, method: 'host', codeScanId: 'ada-in' })
		.run();
	scanAt(ada.id, talk.id, '17:30');
	scanAt(ada.id, talk.id, '19:55');
	scanAt(grace.id, talk.id, '16:10');
	scanAt(ada.id, party.id, '18:00');

	const before = { talk: attendance(talk.id), party: attendance(party.id) };
	expect(deleteAttendee(ada.id)).toBe(true);
	const after = { talk: attendance(talk.id), party: attendance(party.id) };

	// Same scan-ins, scan-outs and counts, in the same order; only who is gone.
	const shape = (rows: typeof before.talk) =>
		rows.map(({ scannedIn, scannedOut, scans }) => ({ scannedIn, scannedOut, scans }));
	expect(shape(after.talk)).toEqual(shape(before.talk));
	expect(shape(after.party)).toEqual(shape(before.party));
	expect(after.talk.find((r) => r.scans === 3)).toMatchObject({ firstName: null, email: null });

	expect(db.select().from(user).where(eq(user.id, ada.id)).get()).toBeUndefined();
	expect(db.select().from(deviceKey).where(eq(deviceKey.userId, ada.id)).get()).toBeUndefined();

	const anonymised = db
		.select()
		.from(scan)
		.where(or(eq(scan.eventId, talk.id), eq(scan.eventId, party.id)))
		.all()
		.filter((row) => row.userId === null);
	expect(anonymised).toHaveLength(4);
	for (const row of anonymised) {
		expect(row).toMatchObject({ ipAddress: null, userAgent: null });
		expect(row.anonymousId).toBeTruthy();
		// Would pair it with the organizer's host scan.
		expect(row.codeScanId).not.toBe('ada-in');
	}
	// One stand-in per event, a different one for each.
	const standIns = (eventId: string) =>
		new Set(anonymised.filter((r) => r.eventId === eventId).map((r) => r.anonymousId));
	expect(standIns(talk.id).size).toBe(1);
	expect(standIns(party.id).size).toBe(1);
	expect([...standIns(talk.id)][0]).not.toBe([...standIns(party.id)][0]);

	// Nobody else's scans are touched.
	expect(db.select().from(scan).where(eq(scan.userId, grace.id)).all()).toMatchObject([
		{ ipAddress: '10.0.0.1', anonymousId: null }
	]);
});

test('deleting someone who is already gone says so', () => {
	expect(deleteAttendee(crypto.randomUUID())).toBe(false);
});

test('the list counts scans and says who has a phone linked', () => {
	const lin = someone('Lin');
	const max = someone('Max');
	const lecture = someEvent('lecture');
	scanAt(lin.id, lecture.id, '16:00');
	scanAt(lin.id, lecture.id, '18:00');
	db.insert(deviceKey)
		.values({ userId: lin.id, publicKey: { kty: 'EC', crv: 'P-256', x: 'x', y: 'y' } })
		.run();

	const rows = listAttendees();
	expect(rows.find((r) => r.id === lin.id)).toMatchObject({ scans: 2, linked: true });
	expect(rows.find((r) => r.id === max.id)).toMatchObject({ scans: 0, linked: false });
});
