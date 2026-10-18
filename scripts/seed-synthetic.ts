/**
 * Writes a database of made-up people, events and scans, for development:
 * nobody real is in it, so it can go anywhere. It isn't generated row by
 * row: it replays half a year of the app being used, through the app's own
 * code, so every row is one the app would have written.
 *
 *   DATABASE_URL=dev.db pnpm db:seed-synthetic [seed] [--as-of YYYY-MM-DD]
 *
 * DATABASE_URL must not exist yet: this makes a new database and never
 * writes into one in use. The same seed and day give the same database.
 *
 * Dated around `--as-of` (today, unless given): events over the six months
 * before it and the four weeks after, one of them that evening. What
 * happens, in order of when it happens:
 *
 * - organizers launch the admin tool and create the events
 * - attendees launch the attendee tool, most set up a phone, some later a
 *   new one
 * - at each event, an organizer shows the code; attendees scan in with their
 *   phone, inside the launched page, or by typing in their details, some on
 *   a friend's phone; most scan out, some step out and back in
 * - the next morning, an organizer links details typed in to the Moodle
 *   account the event page suggests, about half of them
 * - a few who stopped coming are deleted
 *
 * The app's clocks follow the replay: `Date` here, and SQLite's `unixepoch`
 * (the column defaults) on the app's connection. So do its random values,
 * from `crypto.randomUUID` and SQLite's `randomblob`, which is what makes the
 * same seed give the same database.
 */
import { execFileSync } from 'node:child_process';
import { createECDH } from 'node:crypto';
import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { fakerDE as faker } from '@faker-js/faker';
import { env } from '$env/dynamic/private';
import type { PublicJwk } from '$lib/server/device-key';
import type { Client } from '$lib/server/scan';
import type { CodeScreen } from '$lib/server/scan-token';

const usage = 'usage: DATABASE_URL=<new file> pnpm db:seed-synthetic [seed] [--as-of YYYY-MM-DD]';
const { positionals, values } = parseArgs({
	allowPositionals: true,
	options: { 'as-of': { type: 'string' } }
});
const seed = Number(positionals[0] ?? '1');
const dest = env.DATABASE_URL;
if (!dest || !Number.isInteger(seed)) throw new Error(usage);
if (existsSync(dest)) throw new Error(`${dest} already exists: this only makes new databases`);

const DAY = 86_400_000;
const MINUTE = 60_000;
// Midnight UTC, so the whole of one day replays the same.
const asOf = values['as-of'] ? Date.parse(`${values['as-of']}T00:00:00Z`) : Date.now();
if (Number.isNaN(asOf)) throw new Error(usage);
const today = asOf - (asOf % DAY);
const day = (offset: number) => new Date(today + offset * DAY).toISOString().slice(0, 10);

// mulberry32: small and seedable. One stream for what happens, one for IDs,
// so a change to one doesn't reshuffle the other.
function rng(state: number) {
	return () => {
		state = (state + 0x6d2b79f5) | 0;
		let t = Math.imul(state ^ (state >>> 15), 1 | state);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
	};
}
const random = rng(seed);
const idRandom = rng(seed ^ 0x5eed);
const pick = <T>(items: readonly T[]) => items[Math.floor(random() * items.length)];
const between = (min: number, max: number) => min + random() * (max - min);
const uuid = () =>
	'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) =>
		((c === 'x' ? 0 : 8) + Math.floor(idRandom() * (c === 'x' ? 16 : 4))).toString(16)
	);
faker.seed(seed);

// The replay's clock, for everything the app reads the time from.
let now = today;
const RealDate = Date;
// The real Date, but "now" is the replay's: `new Date()`, `Date()` and
// `Date.now()`. Dates it makes are real ones, so `instanceof` holds.
globalThis.Date = new Proxy(RealDate, {
	construct: (target, args: ConstructorParameters<DateConstructor>) =>
		args.length ? new target(...args) : new target(now),
	apply: () => new RealDate(now).toString(),
	get: (target, property, receiver) =>
		property === 'now' ? () => now : Reflect.get(target, property, receiver)
});
crypto.randomUUID = uuid as typeof crypto.randomUUID;

// The schema first; the app's modules open the database as they load.
execFileSync('pnpm', ['exec', 'drizzle-kit', 'push', '--force'], { stdio: 'ignore' });
const { db } = await import('$lib/server/db');
const { event: eventTable } = await import('$lib/server/db/schema');
const { platformUser } = await import('$lib/server/lti/platform-user');
const { enrollDevice } = await import('$lib/server/enrollment');
const { recordScan } = await import('$lib/server/scan');
const { manualEntryUser, linkSuggestions, link } = await import('$lib/server/manual-entry');
const { deleteAttendee } = await import('$lib/server/attendees');
const { parseEventForm } = await import('$lib/server/events');
const { bucketToken, codeScanId, issueEnrollment, issuePresence, launchCodeScanId } =
	await import('$lib/server/scan-token');

// The column defaults' clock. Only the app's connection is the app's, and a
// function of its own in a column default needs trusted_schema.
if (db.$client.pragma('trusted_schema', { simple: true }) !== 1) {
	throw new Error("trusted_schema is off: the column defaults wouldn't follow the replay");
}
db.$client.function('unixepoch', { varargs: true, deterministic: false }, (...args) => {
	if (args.length !== 1 || args[0] !== 'subsecond') {
		throw new Error(`unixepoch(${args.join(', ')}) isn't replayed`);
	}
	return now / 1000;
});
// deleteAttendee's new code scan IDs.
db.$client.function('randomblob', { deterministic: false }, (length) =>
	Buffer.from(Array.from({ length: Number(length) }, () => Math.floor(idRandom() * 256)))
);

// What happens, and when; run in order of when.
const timeline: { at: number; order: number; run: () => void }[] = [];
const at = (time: number, run: () => void) =>
	timeline.push({ at: Math.round(time), order: timeline.length, run });

const PLATFORM = 'https://moodle.example';
const VENUE_ADDRESS = '203.0.113.10';
const PHONES = [
	'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
	'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1',
	'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
	'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36'
];
const TITLES = ['Plenum', 'Workshop', 'Stammtisch', 'Vortrag', 'Spieleabend'];
const LOCATIONS = ['Hörsaal 1', 'Seminarraum 3', 'Clubraum', ''];

type Person = {
	sub: string;
	firstName: string;
	lastName: string;
	email: string;
	// Filled in as the replay gets to them.
	userId?: string;
	phone?: { userAgent: string; browserId: string; enrolled: boolean };
};

/** Moodle's launch: found or created, and seen. */
const launch = (person: Person) => {
	const found = platformUser(PLATFORM, {
		id: person.sub,
		email: person.email,
		givenName: person.firstName,
		familyName: person.lastName
	})!;
	person.userId = found.id;
	return found;
};

/** A phone's key pair from the seed, as a browser would make one. */
function publicKey(): PublicJwk {
	const ecdh = createECDH('prime256v1');
	ecdh.setPrivateKey(Buffer.from(Array.from({ length: 32 }, () => Math.floor(random() * 256))));
	const point = ecdh.getPublicKey();
	const coordinate = (from: number) => point.subarray(from, from + 32).toString('base64url');
	return { kty: 'EC', crv: 'P-256', x: coordinate(1), y: coordinate(33) };
}

function person(sub: number): Person {
	const firstName = faker.person.firstName();
	const lastName = faker.person.lastName();
	const local = `${firstName}.${lastName}.${sub}`
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase()
		.replace(/[^a-z0-9.]/g, '');
	// .invalid is reserved, so no address here can ever be somebody's.
	return { sub: String(sub), firstName, lastName, email: `${local}@example.invalid` };
}

const organizers = [2, 3, 4].map(person);
for (const organizer of organizers)
	at(today - 200 * DAY + between(0, 5) * DAY, () => launch(organizer));
const organizerLaunch = () => launch(pick(organizers));

// Attendees: when they first open the activity, how often they come, whether
// they set up a phone, and whether they stop coming.
const attendees = Array.from({ length: 80 }, (_, i) => ({
	...person(i + 5),
	joins: today - between(10, 190) * DAY,
	comes: between(0.15, 0.7),
	setsUpPhone: random() < 0.75,
	newPhoneAt: random() < 0.15 ? today - between(5, 90) * DAY : null,
	mobileAddress: `198.51.100.${i + 5}`,
	// Typed in, they mostly give the address Moodle has for them.
	typesOwnAddress: random() < 0.6,
	typesLowerCase: random() < 0.3
}));
const leavers = new Set(attendees.filter(() => random() < 0.05));

function setUpPhone(attendee: (typeof attendees)[number]) {
	const { id: userId } = launch(attendee);
	const userAgent = pick(PHONES);
	enrollDevice({ userId, issuedAt: Date.now(), publicKey: publicKey(), userAgent });
	attendee.phone = { userAgent, browserId: uuid(), enrolled: true };
}

for (const attendee of attendees) {
	at(attendee.joins, () => {
		if (attendee.setsUpPhone) setUpPhone(attendee);
		else {
			launch(attendee);
			attendee.phone = { userAgent: pick(PHONES), browserId: uuid(), enrolled: false };
		}
	});
	if (attendee.newPhoneAt && attendee.newPhoneAt > attendee.joins) {
		at(attendee.newPhoneAt, () => setUpPhone(attendee));
	}
}

// The events: created a week or three ahead, from six months back to four
// weeks on, one of them tonight. Wall-clock times in PUBLIC_TIMEZONE, as the
// events page takes them.
const offsets = new Set<number>([0]);
while (offsets.size < 31) offsets.add(Math.round(between(-180, 28)));
const events = [...offsets]
	.sort((a, b) => a - b)
	.map((offset) => {
		const startHour = offset === 0 ? 18 : pick([17, 18, 19]);
		const hours = pick([2, 3, 3, 4]);
		const fields = {
			title: pick(TITLES),
			location: pick(LOCATIONS),
			startDate: day(offset),
			startTime: `${startHour}:00`,
			endDate: day(offset),
			endTime: `${startHour + hours}:00`
		};
		const form = new FormData();
		for (const [name, value] of Object.entries(fields)) form.set(name, value);
		const { values: parsed } = parseEventForm(form);
		// Not after the day itself: the replay ends where it begins.
		const createdAt = Math.min(
			today + offset * DAY - between(7, 21) * DAY,
			today - between(1, 72) * 60 * MINUTE
		);
		return { ...parsed!, id: '', createdAt };
	});

for (const e of events) {
	at(Math.max(e.createdAt, today - 195 * DAY), () => {
		organizerLaunch();
		// As the events page's `create` action writes it.
		e.id = db
			.insert(eventTable)
			.values({
				title: e.title,
				location: e.location,
				startsAt: e.startsAt,
				endsAt: e.endsAt,
				source: 'manual'
			})
			.returning({ id: eventTable.id })
			.get().id;
	});
}

const attending = (e: (typeof events)[number]) =>
	attendees.filter(
		(a) =>
			a.joins < e.startsAt.getTime() - DAY &&
			!(leavers.has(a) && e.startsAt.getTime() > today - 100 * DAY) &&
			random() < a.comes
	);

for (const e of events.filter((e) => e.endsAt.getTime() <= today)) {
	const start = e.startsAt.getTime();
	const end = e.endsAt.getTime();
	let screen: CodeScreen;

	// The code goes up shortly before the start.
	at(start - 15 * MINUTE, () => {
		const host = organizerLaunch();
		screen = { hostId: host.id, eventId: e.id };
	});

	const present = attending(e);
	const typedIn: string[] = [];
	for (const attendee of present) {
		const arrives = start + between(-10, 20) * MINUTE;
		const times = [arrives];
		if (random() < 0.1) times.push(start + between(0.3, 0.6) * (end - start));
		if (random() < 0.8) times.push(end - between(-5, 30) * MINUTE);
		// Now and then, someone's phone and Moodle both let them down.
		const types = random() < 0.05;
		const onFriendsPhone = types && random() < 0.2;
		const viaLaunch = !types && random() < 0.08;
		const address = random() < 0.7 ? VENUE_ADDRESS : attendee.mobileAddress;

		for (const time of times) {
			at(time, () => {
				const phone = attendee.phone!;
				const client: Client = { address, userAgent: phone.userAgent, browserId: phone.browserId };
				const presence = () => codeScanId(issuePresence(screen));

				if (types) {
					const email = attendee.typesOwnAddress
						? attendee.email
						: attendee.email.replace('@', '.privat@');
					const name = (value: string) => (attendee.typesLowerCase ? value.toLowerCase() : value);
					const userId = manualEntryUser({
						email,
						firstName: name(attendee.firstName),
						lastName: name(attendee.lastName)
					});
					// On a friend's phone: theirs is the key the browser holds.
					const friend = onFriendsPhone
						? present.find((p) => p !== attendee && p.phone?.enrolled && p.userId)
						: undefined;
					const friendsPhone = friend?.phone && {
						...client,
						userAgent: friend.phone.userAgent,
						browserId: friend.phone.browserId
					};
					recordScan(friendsPhone || client, {
						userId,
						method: 'manual',
						deviceKeyUserId: friend?.userId ?? null,
						codeScanId: presence(),
						screen
					});
					if (!typedIn.includes(userId)) typedIn.push(userId);
				} else if (phone.enrolled && !viaLaunch) {
					recordScan(client, {
						userId: attendee.userId!,
						method: 'device',
						codeScanId: presence(),
						screen
					});
				} else {
					// The attendee tool, opened at the door; its page scans the code.
					const found = launch(attendee);
					const token = issueEnrollment({ userId: found.id, firstName: found.firstName });
					recordScan(
						// Inside Moodle's page, there's no browser ID cookie.
						{ ...client, browserId: null },
						{
							userId: found.id,
							method: 'lti',
							codeScanId: launchCodeScanId(token, bucketToken(screen)),
							screen
						}
					);
				}
			});
		}
	}

	// The next morning: link what the event page suggests, about half of it.
	const review = end + 14 * 60 * MINUTE;
	if (review < today) {
		at(review, () => {
			if (typedIn.length === 0) return;
			organizerLaunch();
			for (const [reportedAs, suggestions] of linkSuggestions(typedIn)) {
				if (suggestions.length > 0 && random() < 0.5) link(e.id, reportedAs, suggestions[0].id);
			}
		});
	}
}

// Those who stopped coming, deleted a few weeks before the day.
at(today - 20 * DAY, () => {
	organizerLaunch();
	for (const leaver of leavers) if (leaver.userId) deleteAttendee(leaver.userId);
});

timeline.sort((a, b) => a.at - b.at || a.order - b.order);
for (const { at: time, run } of timeline) {
	now = time;
	run();
}

const count = (table: string) =>
	(db.$client.prepare(`select count(*) as n from ${table}`).get() as { n: number }).n;
const scans = (where: string) =>
	(db.$client.prepare(`select count(*) as n from scan where ${where}`).get() as { n: number }).n;
console.log(
	`Wrote ${dest} as of ${day(0)}: ${count('user')} people, ${count('event')} events, ` +
		`${count('scan')} scans (${scans("method = 'device'")} by phone, ${scans("method = 'lti'")} ` +
		`in the launched page, ${scans("method = 'manual'")} typed in, ${scans("method = 'host'")} ` +
		`by organizers showing the code), ${count('device_enrollment')} phone setups, ` +
		`${leavers.size} deleted`
);
