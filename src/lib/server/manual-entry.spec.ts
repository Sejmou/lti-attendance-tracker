import { beforeAll, expect, test } from 'vitest';
import { execFileSync } from 'node:child_process';
import { eq, inArray, like } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { attendance } from './attendance';
import { deleteAttendee, listAttendees } from './attendees';
import { db } from './db';
import { event, scan, user } from './db/schema';
import { link, linkSuggestions, parseDetails, manualEntryUser, unlink } from './manual-entry';
import { pruneExpired } from './retention';

const DOMAIN = 'manual-entry.test';

beforeAll(() => {
	// See scan-host.spec.ts.
	execFileSync('pnpm', ['exec', 'drizzle-kit', 'push', '--force'], {
		stdio: 'ignore',
		env: { ...process.env, DATABASE_URL: env.DATABASE_URL }
	});
	// Platform accounts and typed-in people alike.
	db.delete(user)
		.where(like(user.email, `%@${DOMAIN}`))
		.run();
	// Anonymised scans no longer cascade with anyone, so they go by event.
	const events = db
		.select({ id: event.id })
		.from(event)
		.where(like(event.title, 'manual-entry.spec %'))
		.all()
		.map((e) => e.id);
	db.delete(scan).where(inArray(scan.eventId, events)).run();
	db.delete(event).where(inArray(event.id, events)).run();
});

const form = (fields: Record<string, string>) => {
	const data = new FormData();
	for (const [name, value] of Object.entries(fields)) data.set(name, value);
	return data;
};

function account(firstName: string, email: string) {
	return db
		.insert(user)
		.values({
			id: crypto.randomUUID(),
			email,
			firstName,
			lastName: 'Moodle',
			ltiSubject: JSON.stringify([`https://${DOMAIN}`, crypto.randomUUID()])
		})
		.returning()
		.get();
}

function someEvent(title: string) {
	return db
		.insert(event)
		.values({
			source: 'manual',
			title: `manual-entry.spec ${title}`,
			startsAt: new Date('2026-10-05T16:00:00Z'),
			endsAt: new Date('2026-10-05T20:00:00Z')
		})
		.returning()
		.get();
}

function manualScan(
	userId: string,
	eventId: string,
	extra: Partial<typeof scan.$inferInsert> = {}
) {
	return db
		.insert(scan)
		.values({
			userId,
			eventId,
			method: 'manual',
			reportedAs: userId,
			codeScanId: crypto.randomUUID(),
			...extra
		})
		.returning()
		.get();
}

const scanRow = (id: string) => db.select().from(scan).where(eq(scan.id, id)).get()!;

test('details are trimmed and the address lowercased; anything missing or implausible is turned down', () => {
	expect(
		parseDetails(form({ email: ' Ada@Example.COM ', firstName: ' Ada ', lastName: 'Lovelace' }))
	).toEqual({ email: 'ada@example.com', firstName: 'Ada', lastName: 'Lovelace' });

	expect(parseDetails(form({ email: 'ada', firstName: 'Ada', lastName: 'L' }))).toBeNull();
	expect(
		parseDetails(form({ email: 'ada@example.com', firstName: ' ', lastName: 'L' }))
	).toBeNull();
	expect(parseDetails(form({ email: 'ada@example.com', firstName: 'Ada' }))).toBeNull();
});

test('the same address typed in again is the same person, and never the platform account with it', () => {
	const moodle = account('Ada', `ada@${DOMAIN}`);
	const first = manualEntryUser({ email: `ada@${DOMAIN}`, firstName: 'Ada', lastName: 'L' });
	const again = manualEntryUser({
		email: `ada@${DOMAIN}`,
		firstName: 'Someone',
		lastName: 'Else'
	});

	expect(again).toBe(first);
	expect(first).not.toBe(moodle.id);
	// The name typed the first time stays.
	expect(db.select().from(user).where(eq(user.id, first)).get()).toMatchObject({
		firstName: 'Ada'
	});
});

test('a typed-in person is suggested the platform accounts with their address, whatever its case', () => {
	const moodle = account('Grace', `Grace@${DOMAIN}`);
	const typed = manualEntryUser({ email: `grace@${DOMAIN}`, firstName: 'Grace', lastName: 'H' });
	const nobody = manualEntryUser({ email: `nobody@${DOMAIN}`, firstName: 'No', lastName: 'Body' });

	const suggestions = linkSuggestions([typed, nobody]);
	expect(suggestions.get(typed)).toEqual([
		{ id: moodle.id, firstName: 'Grace', lastName: 'Moodle' }
	]);
	expect(suggestions.get(nobody)).toEqual([]);
});

test("linking moves one event's typed-in scans to the account, and unlinking moves them back", () => {
	const talk = someEvent('talk');
	const other = someEvent('other');
	const moodle = account('Alan', `alan@${DOMAIN}`);
	const typed = manualEntryUser({ email: `alan@${DOMAIN}`, firstName: 'Alan', lastName: 'T' });
	manualScan(typed, talk.id);
	manualScan(typed, talk.id);
	manualScan(typed, other.id);

	expect(attendance(talk.id)).toMatchObject([
		{ userId: typed, manualEntry: true, manualScans: 2, scans: 2 }
	]);

	expect(link(talk.id, typed, moodle.id)).toBe(true);
	expect(attendance(talk.id)).toMatchObject([
		{ userId: moodle.id, manualEntry: false, manualScans: 2, scans: 2 }
	]);
	// Only this event.
	expect(attendance(other.id)).toMatchObject([{ userId: typed }]);

	unlink(talk.id, typed);
	expect(attendance(talk.id)).toMatchObject([{ userId: typed, manualEntry: true }]);
});

test('scans are only ever linked to a platform account', () => {
	const talk = someEvent('not to another typed-in person');
	const typed = manualEntryUser({ email: `kate@${DOMAIN}`, firstName: 'Kate', lastName: 'J' });
	const otherTyped = manualEntryUser({ email: `k@${DOMAIN}`, firstName: 'K', lastName: 'J' });
	manualScan(typed, talk.id);

	expect(link(talk.id, typed, otherTyped)).toBe(false);
	expect(attendance(talk.id)).toMatchObject([{ userId: typed }]);
});

test('typing the same address in again counts as being seen, and the attendees page marks them', () => {
	const id = manualEntryUser({ email: `lin@${DOMAIN}`, firstName: 'Lin', lastName: 'C' });
	db.update(user)
		.set({ lastSeenAt: new Date('2026-01-01T00:00:00Z') })
		.where(eq(user.id, id))
		.run();

	manualEntryUser({ email: `lin@${DOMAIN}`, firstName: 'Lin', lastName: 'C' });
	const seen = db.select().from(user).where(eq(user.id, id)).get()!.lastSeenAt;
	expect(Date.now() - seen.getTime()).toBeLessThan(60_000);

	const moodle = account('Ida', `ida@${DOMAIN}`);
	const listed = listAttendees();
	expect(listed.find((row) => row.id === id)).toMatchObject({ manualEntry: true });
	expect(listed.find((row) => row.id === moodle.id)).toMatchObject({ manualEntry: false });
});

test('deleting someone typed in anonymises their scans and forgets them on scans since linked', () => {
	const talk = someEvent('deleting the one typed in');
	const moodle = account('Mary', `mary@${DOMAIN}`);
	const typed = manualEntryUser({ email: `mary@${DOMAIN}`, firstName: 'Mary', lastName: 'S' });
	const kept = manualScan(typed, talk.id, { browserHash: 'b', deviceKeyUserId: moodle.id });
	const linked = manualScan(typed, someEvent('linked').id);
	link(linked.eventId, typed, moodle.id);

	expect(deleteAttendee(typed)).toBe(true);

	expect(scanRow(kept.id)).toMatchObject({
		userId: null,
		reportedAs: null,
		browserHash: null,
		deviceKeyUserId: null
	});
	// Still the account's scan, but no longer undoable: who it was typed in as is gone.
	expect(scanRow(linked.id)).toMatchObject({ userId: moodle.id, reportedAs: null });
});

test("deleting someone forgets them on scans typed in on their phone, which stay the other person's", () => {
	const talk = someEvent('deleting the phone owner');
	const owner = account('Owen', `owen@${DOMAIN}`);
	const typed = manualEntryUser({ email: `tess@${DOMAIN}`, firstName: 'Tess', lastName: 'T' });
	const onTheirPhone = manualScan(typed, talk.id, { deviceKeyUserId: owner.id });

	deleteAttendee(owner.id);

	expect(scanRow(onTheirPhone.id)).toMatchObject({
		userId: typed,
		reportedAs: typed,
		deviceKeyUserId: null
	});
});

test('after 12 months, a scan typed in forgets its browser and whose phone it was, not who it was', () => {
	const talk = someEvent('retention');
	const owner = account('Pia', `pia@${DOMAIN}`);
	const typed = manualEntryUser({ email: `paul@${DOMAIN}`, firstName: 'Paul', lastName: 'P' });
	const old = manualScan(typed, talk.id, {
		browserHash: 'b',
		deviceKeyUserId: owner.id,
		scannedAt: new Date('2025-01-01T00:00:00Z')
	});
	const recent = manualScan(typed, talk.id, { browserHash: 'b', deviceKeyUserId: owner.id });

	pruneExpired();

	expect(scanRow(old.id)).toMatchObject({
		userId: typed,
		reportedAs: typed,
		browserHash: null,
		deviceKeyUserId: null
	});
	expect(scanRow(recent.id)).toMatchObject({ browserHash: 'b', deviceKeyUserId: owner.id });
});
