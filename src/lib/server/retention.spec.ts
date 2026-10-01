import { beforeAll, expect, test } from 'vitest';
import { execFileSync } from 'node:child_process';
import { eq, like } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { db } from './db';
import { deviceEnrollment, event, scan, user } from './db/schema';
import { pruneExpired, retentionCutoff } from './retention';

const PLATFORM = 'https://retention.test';

beforeAll(() => {
	// See scan-host.spec.ts.
	execFileSync('pnpm', ['exec', 'drizzle-kit', 'push', '--force'], {
		stdio: 'ignore',
		env: { ...process.env, DATABASE_URL: env.DATABASE_URL }
	});
	// Their scans and setups cascade, which frees the events.
	db.delete(user)
		.where(like(user.ltiSubject, `["${PLATFORM}"%`))
		.run();
	db.delete(event).where(like(event.title, 'retention.spec %')).run();
});

const NOW = new Date('2027-10-05T12:00:00Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60_000);

test('twelve months is calendar months', () => {
	expect(retentionCutoff(NOW)).toEqual(new Date('2026-10-05T12:00:00Z'));
});

test('anything older than 12 months loses what is kept against abuse, and nothing newer does', () => {
	const ada = db
		.insert(user)
		.values({
			id: crypto.randomUUID(),
			email: 'ada@example.com',
			firstName: 'Ada',
			lastName: 'Test',
			ltiSubject: JSON.stringify([PLATFORM, 'ada'])
		})
		.returning()
		.get();
	const { id: eventId } = db
		.insert(event)
		.values({
			source: 'manual',
			title: 'retention.spec talk',
			startsAt: daysAgo(400),
			endsAt: daysAgo(400)
		})
		.returning()
		.get();
	const scanAt = (scannedAt: Date) =>
		db
			.insert(scan)
			.values({
				userId: ada.id,
				eventId,
				method: 'device',
				codeScanId: crypto.randomUUID(),
				scannedAt,
				ipHash: 'hash',
				userAgent: 'Phone'
			})
			.returning()
			.get();
	const setupAt = (enrolledAt: Date) =>
		db
			.insert(deviceEnrollment)
			.values({ userId: ada.id, enrolledAt, userAgent: 'Phone' })
			.returning()
			.get();

	const oldScan = scanAt(daysAgo(370));
	const newScan = scanAt(daysAgo(360));
	const oldSetup = setupAt(daysAgo(370));
	const newSetup = setupAt(daysAgo(360));

	pruneExpired(NOW);

	const scanById = (id: string) => db.select().from(scan).where(eq(scan.id, id)).get();
	// The scan itself stays: it is the attendance.
	expect(scanById(oldScan.id)).toMatchObject({
		userId: ada.id,
		scannedAt: oldScan.scannedAt,
		ipHash: null,
		userAgent: null
	});
	expect(scanById(newScan.id)).toMatchObject({ ipHash: 'hash', userAgent: 'Phone' });

	const setupById = (id: string) =>
		db.select().from(deviceEnrollment).where(eq(deviceEnrollment.id, id)).get();
	expect(setupById(oldSetup.id)).toBeUndefined();
	expect(setupById(newSetup.id)).toBeDefined();
});
