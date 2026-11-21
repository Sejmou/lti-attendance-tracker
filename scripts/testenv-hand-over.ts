/**
 * Testenv only: gives two of the test Moodle's students a seeded attendee's
 * history, so the attendee pages have something to show. The seeded person
 * becomes the student, by taking over their platform account: the student's
 * first launch finds them, with every scan, setup and link they had.
 *
 *   student1  someone with a set-up phone: a new browser sees it set up elsewhere
 *   student2  someone who only scanned from the Moodle page: nothing set up
 *   student3  left alone, for a first launch with no history
 *
 * Takes the file testenv_setup.php writes: username => { sub, email,
 * firstName, lastName }.
 */
import { readFileSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import { db } from '$lib/server/db';

type Launcher = { sub: string; email: string; firstName: string; lastName: string };

const issuer = process.env.MOODLE_URL;
if (!issuer) throw new Error('MOODLE_URL is not set');
const users: Record<string, Launcher> = JSON.parse(readFileSync(process.argv[2], 'utf8'));

// The seeder's own platform (scripts/seed-synthetic.ts). Organizers are left
// out: their host scans would make an attendee's history look odd.
const SEEDED = '["https://moodle.example"%';
const candidate = (withPhone: boolean) =>
	db.get<{ id: string; name: string } | undefined>(sql`
		select u.id, u.first_name || ' ' || u.last_name as name from user u
		join scan s on s.user_id = u.id
		where u.lti_subject like ${SEEDED}
			and ${withPhone ? sql`exists` : sql`not exists`} (select 1 from device_key k where k.user_id = u.id)
			and not exists (select 1 from scan h where h.user_id = u.id and h.method = 'host')
		group by u.id
		-- Rather someone whose list shows every case: an event they stepped out
		-- of and back in (three scans or more), and one with no scan-out.
		order by
			exists (select 1 from scan t where t.user_id = u.id group by t.event_id having count(*) >= 3) desc,
			exists (select 1 from scan t where t.user_id = u.id group by t.event_id having count(*) = 1) desc,
			count(*) desc, u.id
		limit 1`);

for (const [username, withPhone] of [
	['student1', true],
	['student2', false]
] as const) {
	const launcher = users[username];
	if (!launcher) continue;
	const subject = JSON.stringify([issuer, launcher.sub]);
	// Already handed over, or launched before the seeding: theirs as it is.
	if (db.get(sql`select 1 from user where lti_subject = ${subject}`)) continue;
	const seeded = candidate(withPhone);
	if (!seeded) continue;

	db.run(sql`
		update user set lti_subject = ${subject}, email = ${launcher.email},
			first_name = ${launcher.firstName}, last_name = ${launcher.lastName}
		where id = ${seeded.id}`);
	console.log(`testenv: ${username} has ${seeded.name}'s history now`);
}
