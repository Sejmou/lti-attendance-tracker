import { beforeAll, expect, test } from 'vitest';
import { execFileSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { and, eq, like } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { db } from './db';
import { deviceEnrollment, deviceKey, event, scan, user } from './db/schema';
import type { PublicJwk } from './device-key';
import { enrollDevice } from './enrollment';
import { browserHash, ipHash } from './ip-hash';
import { platformUser } from './lti/platform-user';
import { recordScan, type Client } from './scan';
import { codeScanId, issuePresence } from './scan-token';

/**
 * What a launch, a phone setup and a scan write, called the way a script
 * would call them: no ltijs, no request, nothing but what each needs. The
 * routes and the provider are tested end to end in launch.spec; this keeps
 * them callable without either.
 */

const PLATFORM = 'https://write-paths.test';

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
	db.delete(event).where(like(event.title, 'write-paths.spec %')).run();
});

const launch = (sub: string, firstName = 'Ada') =>
	platformUser(PLATFORM, {
		id: sub,
		email: ` ${sub}@Example.com `,
		givenName: firstName,
		familyName: 'Test'
	});

function publicKey(): PublicJwk {
	const { kty, crv, x, y } = generateKeyPairSync('ec', { namedCurve: 'P-256' }).publicKey.export({
		format: 'jwk'
	});
	return { kty, crv, x, y } as PublicJwk;
}

function someEvent(title: string) {
	return db
		.insert(event)
		.values({
			source: 'manual',
			title: `write-paths.spec ${title}`,
			startsAt: new Date(Date.now() - 60 * 60_000),
			endsAt: new Date(Date.now() + 2 * 60 * 60_000)
		})
		.returning()
		.get();
}

test('a launch creates someone the first time, and finds and marks them seen after', async () => {
	const first = launch('first-launch')!;
	const created = db.select().from(user).where(eq(user.id, first.id)).get()!;
	expect(created).toMatchObject({ email: 'first-launch@example.com', firstName: 'Ada' });

	await new Promise((resolve) => setTimeout(resolve, 5));
	expect(launch('first-launch')).toEqual(first);
	const seen = db.select().from(user).where(eq(user.id, first.id)).get()!;
	expect(seen.lastSeenAt.getTime()).toBeGreaterThan(created.lastSeenAt.getTime());
});

test('a launch for someone new the platform shares no name for creates nobody', () => {
	expect(platformUser(PLATFORM, { id: 'no-profile', email: 'x@example.com' })).toBeNull();
	expect(
		db
			.select()
			.from(user)
			.where(eq(user.ltiSubject, JSON.stringify([PLATFORM, 'no-profile'])))
			.get()
	).toBeUndefined();
});

test('setting up a phone stores its key and logs the setup; a spent link stores nothing', () => {
	const { id: userId } = launch('phone')!;
	const issuedAt = Date.now() - 1000;
	const first = enrollDevice({ userId, issuedAt, publicKey: publicKey(), userAgent: 'phone 1' })!;
	expect(db.select().from(deviceKey).where(eq(deviceKey.userId, userId)).get()?.id).toBe(
		first.keyId
	);

	// The same link again: the key set up with it spent it.
	expect(
		enrollDevice({ userId, issuedAt, publicKey: publicKey(), userAgent: 'phone 2' })
	).toBeNull();

	// A later link replaces the key, under a new ID; the log keeps both phones.
	const second = enrollDevice({
		userId,
		issuedAt: Date.now() + 1000,
		publicKey: publicKey(),
		userAgent: 'phone 2'
	})!;
	expect(second.keyId).not.toBe(first.keyId);
	expect(
		db
			.select({ userAgent: deviceEnrollment.userAgent })
			.from(deviceEnrollment)
			.where(eq(deviceEnrollment.userId, userId))
			.all()
			.map((row) => row.userAgent)
			.sort()
	).toEqual(['phone 1', 'phone 2']);

	expect(
		enrollDevice({ userId: 'nobody', issuedAt, publicKey: publicKey(), userAgent: null })
	).toBeNull();
});

test('a scan from a plain client is filed with its hashes, and with one for whoever showed the code', () => {
	const attendee = launch('scanner')!;
	const host = launch('host', 'Olga')!;
	const { id: eventId } = someEvent('scan');
	const screen = { hostId: host.id, eventId };
	const id = codeScanId(issuePresence(screen));
	const client: Client = {
		address: '203.0.113.7',
		userAgent: 'test phone',
		browserId: 'browser-1'
	};

	expect(
		recordScan(client, { userId: attendee.id, method: 'device', codeScanId: id, screen })
	).toMatchObject({ firstName: 'Ada', direction: 'in' });

	const rows = db
		.select()
		.from(scan)
		.where(and(eq(scan.eventId, eventId), eq(scan.codeScanId, id)))
		.all();
	expect(rows.find((row) => row.method === 'device')).toMatchObject({
		userId: attendee.id,
		ipHash: ipHash(eventId, '203.0.113.7'),
		browserHash: browserHash(eventId, 'browser-1'),
		userAgent: 'test phone'
	});
	expect(rows.find((row) => row.method === 'host')).toMatchObject({ userId: host.id });
});

test("a scan that writes nothing doesn't read the address, which may not be there", () => {
	const attendee = launch('gone-event')!;
	const client: Client = {
		get address(): string {
			throw new Error('read the address');
		},
		userAgent: null,
		browserId: null
	};
	const screen = { hostId: attendee.id, eventId: 'no-such-event' };
	expect(
		recordScan(client, {
			userId: attendee.id,
			method: 'device',
			codeScanId: codeScanId(issuePresence(screen)),
			screen
		})
	).toEqual({ gone: 'event' });
});
