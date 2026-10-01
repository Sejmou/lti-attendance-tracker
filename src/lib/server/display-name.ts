import { db } from '$lib/server/db';
import { user } from '$lib/server/db/schema';

type Person = { id: string; firstName: string; lastName: string };

/**
 * The shortest name that tells each person apart from everyone else, for the
 * code screen, where anyone standing by can read it:
 *
 * - their first name, if nobody else has it
 * - otherwise, the shortest start of their last name nobody else with that
 *   first name shares, and a dot: "Anna B."
 * - their whole last name, without a dot, if every start of it is shared
 *   ("Thomas Schill" next to "Thomas Schiller"), or if the start it takes is
 *   the whole of it anyway
 *
 * Names are compared ignoring case; each is shown as it is spelled.
 */
export function shortNames(people: Person[]) {
	const key = (name: string) => name.trim().toLocaleLowerCase('de');
	const byFirstName = Map.groupBy(people, (p) => key(p.firstName));

	const names = new Map<string, string>();
	for (const person of people) {
		const firstName = person.firstName.trim();
		const others = byFirstName.get(key(person.firstName))!.filter((p) => p !== person);
		if (others.length === 0) {
			names.set(person.id, firstName);
			continue;
		}

		// By code point, so an umlaut or an accent is never cut in half.
		const letters = [...person.lastName.trim()];
		const othersLast = others.map((p) => key(p.lastName));
		let shown = letters.join('');
		for (let length = 1; length < letters.length; length++) {
			const prefix = letters.slice(0, length).join('');
			if (!othersLast.some((last) => last.startsWith(key(prefix)))) {
				shown = `${prefix}.`;
				break;
			}
		}
		names.set(person.id, `${firstName} ${shown}`);
	}
	return names;
}

/**
 * Everyone's short name as things stand, keyed by user ID. Worked out afresh
 * each time, so it follows attendees being added and deleted.
 *
 * ponytail: reads every user. A club is hundreds at most.
 */
export function displayNames() {
	return shortNames(
		db.select({ id: user.id, firstName: user.firstName, lastName: user.lastName }).from(user).all()
	);
}
