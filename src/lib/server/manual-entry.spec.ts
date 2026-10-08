import { beforeAll, expect, test } from 'vitest';
import { execFileSync } from 'node:child_process';
import { eq, like } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { attendance } from './attendance';
import { db } from './db';
import { event, scan, user } from './db/schema';
import { link, linkSuggestions, parseDetails, manualEntryUser, unlink } from './manual-entry';

const DOMAIN = 'manual-entry.test';

beforeAll(() => {
	// See scan-host.spec.ts.
	execFileSync('pnpm', ['exec', 'drizzle-kit', 'push', '--force'], {
		stdio: 'ignore',
		env: { ...process.env, DATABASE_URL: env.DATABASE_URL }
	});
	// Platform accounts and typed-in people alike; their scans cascade.
	db.delete(user)
		.where(like(user.email, `%@${DOMAIN}`))
		.run();
	db.delete(event).where(like(event.title, 'manual-entry.spec %')).run();
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

function manualScan(userId: string, eventId: string) {
	db.insert(scan)
		.values({
			userId,
			eventId,
			method: 'manual',
			reportedAs: userId,
			codeScanId: crypto.randomUUID()
		})
		.run();
}

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
