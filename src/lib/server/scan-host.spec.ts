import { beforeAll, expect, test } from 'vitest';
import { execFileSync } from 'node:child_process';
import { and, eq, like } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { hostScan } from './scan-host';
import { db } from './db';
import { event, scan, user } from './db/schema';

const PLATFORM = 'https://scan-host.test';

beforeAll(() => {
	// `.env.test` points DATABASE_URL at a scratch file; read it from the same
	// place the app does so the schema push and the app client can't diverge.
	execFileSync('pnpm', ['exec', 'drizzle-kit', 'push', '--force'], {
		stdio: 'ignore',
		env: { ...process.env, DATABASE_URL: env.DATABASE_URL }
	});
	// Their scans cascade, which frees the events.
	db.delete(user)
		.where(like(user.ltiSubject, `["${PLATFORM}"%`))
		.run();
	db.delete(event).where(like(event.title, 'scan-host.spec %')).run();
});

function someEvent(title: string) {
	return db
		.insert(event)
		.values({
			source: 'manual',
			title: `scan-host.spec ${title}`,
			startsAt: new Date('2026-10-05T16:00:00Z'),
			endsAt: new Date('2026-10-05T18:00:00Z')
		})
		.returning()
		.get();
}

function someone(sub: string, firstName: string) {
	return db
		.insert(user)
		.values({
			id: crypto.randomUUID(),
			email: `${sub}@example.com`,
			firstName,
			lastName: 'Test',
			ltiSubject: JSON.stringify([PLATFORM, sub])
		})
		.returning()
		.get();
}

test('a code scan files one scan, a later code scan another', async () => {
	const attendee = someone('ada', 'Ada');
	const { id: eventId } = someEvent('talk');
	const arrive = (codeScanId: string) =>
		db
			.insert(scan)
			.values({ userId: attendee.id, eventId, method: 'device', codeScanId, ipHash: 'hash' })
			.onConflictDoNothing();

	await arrive('scan-one');
	// Double submit riding the same scan: dropped by the unique index.
	await arrive('scan-one');
	expect(await db.$count(scan, eq(scan.userId, attendee.id))).toBe(1);

	// Stepping out and back in is a fresh scan, and a row of its own.
	await arrive('scan-two');
	expect(await db.$count(scan, eq(scan.userId, attendee.id))).toBe(2);
});

test("the first attendee through an organizer's code files a scan for that organizer, once per event", async () => {
	const host = someone('ops', 'Ops');
	const party = someEvent('party');
	const hostRows = (eventId: string) =>
		db
			.select()
			.from(scan)
			.where(and(eq(scan.userId, host.id), eq(scan.eventId, eventId)));

	expect(hostScan(host.id, party.id, 'scan-three')).toMatchObject({
		firstName: 'Ops',
		eventId: party.id
	});
	const [row] = await hostRows(party.id);
	expect(row).toMatchObject({ method: 'host', codeScanId: 'scan-three', ipHash: null });

	// The next attendee through the same screen doesn't add another: it would
	// count as the organizer's scan-out.
	expect(hostScan(host.id, party.id, 'scan-four')).toBeNull();
	expect(await hostRows(party.id)).toHaveLength(1);

	// Their screen showing another event's code is another scan-in.
	const lecture = someEvent('lecture');
	expect(hostScan(host.id, lecture.id, 'scan-five')).not.toBeNull();
	expect(await hostRows(lecture.id)).toHaveLength(1);

	// A code naming someone who no longer exists files nothing.
	expect(hostScan(crypto.randomUUID(), party.id, 'scan-six')).toBeNull();
});
