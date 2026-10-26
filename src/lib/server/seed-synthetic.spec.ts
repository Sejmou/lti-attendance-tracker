import { beforeAll, describe, expect, test } from 'vitest';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { env } from '$env/dynamic/private';

// In a process of its own: the seeder swaps the clock and the IDs.

const AS_OF = '2026-10-18';
const TODAY = Date.parse(`${AS_OF}T00:00:00Z`);

function seeded(seed: number) {
	const file = join(mkdtempSync(join(tmpdir(), 'seed-synthetic-spec-')), 'seed.db');
	execFileSync(
		'node',
		['scripts/run.js', 'scripts/seed-synthetic.ts', String(seed), '--as-of', AS_OF],
		{
			stdio: 'ignore',
			env: { ...process.env, DATABASE_URL: file, SIGNING_SECRET: env.SIGNING_SECRET }
		}
	);
	return new Database(file, { readonly: true });
}

/** Every row of the app's own tables, for telling two databases apart. */
function fingerprint(db: Database.Database) {
	const hash = createHash('sha256');
	for (const table of ['user', 'event', 'scan', 'device_key', 'device_enrollment'])
		hash.update(JSON.stringify(db.prepare(`select * from "${table}" order by rowid`).all()));
	return hash.digest('hex');
}

let db: Database.Database;
const count = (sql: string, ...params: unknown[]) =>
	db
		.prepare(`select count(*) from (${sql})`)
		.pluck()
		.get(...params) as number;
const none = (sql: string, ...params: unknown[]) => expect(count(sql, ...params), sql).toBe(0);
const some = (sql: string, ...params: unknown[]) =>
	expect(count(sql, ...params), sql).toBeGreaterThan(0);

beforeAll(() => {
	db = seeded(1);
}, 60_000);

describe('the seed keeps the rules the app keeps', () => {
	test('every phone scan is by someone with a key, from a phone set up before it', () => {
		some(`select 1 from scan where method = 'device'`);
		none(`
				select 1 from scan s where s.method = 'device' and s.user_id is not null and (
					not exists (select 1 from device_key k where k.user_id = s.user_id)
					or not exists (select 1 from device_enrollment e
						where e.user_id = s.user_id and e.enrolled_at <= s.scanned_at))`);
	});

	test("every scan but an organizer's has the address's hash; inside Moodle's page, no browser's", () => {
		none(`select 1 from scan where method <> 'host' and user_id is not null and ip_hash is null`);
		none(`select 1 from scan where method = 'lti' and browser_hash is not null`);
	});

	test('every event with scans had its code shown, and each organizer is filed once per event', () => {
		none(`select distinct event_id from scan
				where event_id not in (select event_id from scan where method = 'host')`);
		none(`select 1 from scan where method = 'host' group by event_id, user_id having count(*) > 1`);
		// Filed with the code scan that brought it, an attendee's.
		none(`select 1 from scan h where h.method = 'host' and not exists (
				select 1 from scan s where s.event_id = h.event_id and s.code_scan_id = h.code_scan_id
				and s.method <> 'host')`);
	});

	test('details typed in are manual, and linked only to the Moodle account with their address', () => {
		none(`select 1 from scan where reported_as is not null and method <> 'manual'`);
		none(
			`select 1 from scan where method = 'manual' and user_id is not null and reported_as is null`
		);
		none(`select 1 from scan s join user account on account.id = s.user_id
				join user typed on typed.id = s.reported_as
				where s.user_id <> s.reported_as
				and (account.lti_subject like '["manual",%' or account.email <> typed.email)`);
	});

	test('people are created by their first launch or entry, and seen at their last', () => {
		// Typed in: made by their first entry, seen at each (see manualEntryUser).
		none(`select 1 from user u where u.lti_subject like '["manual",%' and (
				u.created_at <> (select min(scanned_at) from scan where reported_as = u.id)
				or u.last_seen_at <> (select max(scanned_at) from scan where reported_as = u.id))`);
		none(`select 1 from user u join scan s on s.user_id = u.id
				where s.reported_as is null and s.scanned_at < u.created_at`);
		none(`select 1 from user where last_seen_at < created_at`);
	});

	test('nothing has happened after the day it was seeded for', () => {
		for (const [table, column] of [
			['scan', 'scanned_at'],
			['user', 'created_at'],
			['user', 'last_seen_at'],
			['device_key', 'created_at'],
			['device_enrollment', 'enrolled_at']
		])
			none(`select 1 from ${table} where ${column} > ?`, TODAY);
	});

	test("deleted attendees' scans keep nothing that says whose they were", () => {
		some(`select 1 from scan where user_id is null`);
		none(`select 1 from scan where user_id is null and (anonymous_id is null or ip_hash is not null
				or user_agent is not null or browser_hash is not null or device_key_user_id is not null)`);
	});
});

test('it has a bit of everything the admin pages show', () => {
	for (const method of ['device', 'lti', 'manual', 'host'])
		some(`select 1 from scan where method = '${method}'`);
	// Typed in and since linked, and typed in with an address Moodle has: Unlink, and Link.
	some(`select 1 from scan where reported_as is not null and user_id <> reported_as`);
	some(`select 1 from scan s join user typed on typed.id = s.reported_as
			where s.user_id = s.reported_as and exists (select 1 from user account
				where account.email = typed.email and account.lti_subject not like '["manual",%')`);
	// Typed in on another attendee's phone; phones set up again.
	some(`select 1 from scan where device_key_user_id is not null`);
	some(`select user_id from device_enrollment group by user_id having count(*) > 1`);
	// And something for the code screen tonight.
	some(`select 1 from event where starts_at > ? and starts_at < ? + 86400000`, TODAY, TODAY);
});

test('the same seed and day give the same database, another seed another', () => {
	const again = seeded(1);
	const other = seeded(2);
	expect(fingerprint(again)).toBe(fingerprint(db));
	expect(fingerprint(other)).not.toBe(fingerprint(db));
}, 60_000);
