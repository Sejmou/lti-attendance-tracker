import { beforeAll, expect, test } from 'vitest';
import { execFileSync } from 'node:child_process';
import { eq, like } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { hostScan } from './scan-host';
import { db } from './db';
import { scan, user } from './db/schema';

const PLATFORM = 'https://scan-host.test';

beforeAll(() => {
	// `.env.test` points DATABASE_URL at a scratch file; read it from the same
	// place the app does so the schema push and the app client can't diverge.
	execFileSync('pnpm', ['exec', 'drizzle-kit', 'push', '--force'], {
		stdio: 'ignore',
		env: { ...process.env, DATABASE_URL: env.DATABASE_URL }
	});
	// Their scans cascade.
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

test('a code scan files one scan, a later code scan another', async () => {
	const attendee = someone('ada', 'Ada');
	const arrive = (codeScanId: string) =>
		db
			.insert(scan)
			.values({ userId: attendee.id, method: 'device', codeScanId, ipAddress: '10.0.0.1' })
			.onConflictDoNothing();

	await arrive('scan-one');
	// Double submit riding the same scan: dropped by the unique index.
	await arrive('scan-one');
	expect(await db.$count(scan, eq(scan.userId, attendee.id))).toBe(1);

	// Stepping out and back in is a fresh scan, and a row of its own.
	await arrive('scan-two');
	expect(await db.$count(scan, eq(scan.userId, attendee.id))).toBe(2);
});

test("the first attendee through an organizer's code files a scan for that organizer, once", async () => {
	const host = someone('ops', 'Ops');
	const hostRows = () => db.select().from(scan).where(eq(scan.userId, host.id));

	expect(hostScan(host.id, 'scan-three')).toMatchObject({ firstName: 'Ops' });
	const [row] = await hostRows();
	expect(row).toMatchObject({ method: 'host', codeScanId: 'scan-three', ipAddress: null });

	// The next attendee through the same screen doesn't add another.
	expect(hostScan(host.id, 'scan-four')).toBeNull();
	expect(await hostRows()).toHaveLength(1);

	// A code naming someone who no longer exists files nothing.
	expect(hostScan(crypto.randomUUID(), 'scan-five')).toBeNull();
});
