import { beforeAll, expect, test } from 'vitest';
import { execFileSync } from 'node:child_process';
import { eq, like } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { checkInHost } from './check-in-host';
import { db } from './db';
import { checkIn, user } from './db/schema';

const PLATFORM = 'https://check-in-host.test';

beforeAll(() => {
	// `.env.test` points DATABASE_URL at a scratch file; read it from the same
	// place the app does so the schema push and the app client can't diverge.
	execFileSync('pnpm', ['exec', 'drizzle-kit', 'push', '--force'], {
		stdio: 'ignore',
		env: { ...process.env, DATABASE_URL: env.DATABASE_URL }
	});
	// Their check-ins cascade.
	db.delete(user)
		.where(like(user.ltiSubject, `["${PLATFORM}"%`))
		.run();
});

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

test('one scan checks a guest in once, a later scan checks them in again', async () => {
	const guest = someone('ada', 'Ada');
	const arrive = (scanId: string) =>
		db
			.insert(checkIn)
			.values({ userId: guest.id, method: 'device', scanId, ipAddress: '10.0.0.1' })
			.onConflictDoNothing();

	await arrive('scan-one');
	// Double submit riding the same scan: dropped by the unique index.
	await arrive('scan-one');
	expect(await db.$count(checkIn, eq(checkIn.userId, guest.id))).toBe(1);

	// Stepping out and back in is a fresh scan, and a row of its own.
	await arrive('scan-two');
	expect(await db.$count(checkIn, eq(checkIn.userId, guest.id))).toBe(2);
});

test("the first guest through an organizer's code checks that organizer in, once", async () => {
	const host = someone('ops', 'Ops');
	const hostRows = () => db.select().from(checkIn).where(eq(checkIn.userId, host.id));

	expect(checkInHost(host.id, 'scan-three')).toMatchObject({ firstName: 'Ops' });
	const [row] = await hostRows();
	expect(row).toMatchObject({ method: 'host', scanId: 'scan-three', ipAddress: null });

	// The next guest through the same screen doesn't add another.
	expect(checkInHost(host.id, 'scan-four')).toBeNull();
	expect(await hostRows()).toHaveLength(1);

	// A code naming someone who no longer exists checks nobody in.
	expect(checkInHost(crypto.randomUUID(), 'scan-five')).toBeNull();
});
