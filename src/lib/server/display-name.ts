import { asc } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { user } from '$lib/server/db/schema';

type Person = { id: string; firstName: string; lastName: string };

/**
 * The shortest name that tells each person apart from everyone else, for the
 * code screen, where anyone standing by can read it. Only ever the first word
 * of the first name: a second name ("Anna Maria") is nobody's business at the
 * door, and is never what tells two people apart.
 *
 * - their first name, if nobody else has it
 * - otherwise, the shortest start of their last name nobody else with that
 *   first name shares, and a dot: "Anna B."
 * - their whole last name, without a dot, if every start of it is shared
 *   ("Thomas Schill" next to "Thomas Schiller"), or if the start it takes is
 *   the whole of it anyway
 *
 * Someone with the same name, as far as it can be shown (that first word and
 * the whole last name), doesn't count for any of that: no part of the name
 * tells the two apart, so showing more of it would only reveal more.
 * They are numbered instead, in the order given: "Lukas", "Lukas (2)". Typing
 * in one's details by hand under another address makes such a twin (see
 * manual-entry), so it happens more than real namesakes would suggest.
 *
 * Names are compared ignoring case; each is shown as it is spelled.
 */
export function shortNames(people: Person[]) {
	const key = (name: string) => name.trim().toLocaleLowerCase('de');
	// "Anna Maria" is shown, and compared, as "Anna".
	const firstWord = (p: Person) => p.firstName.trim().split(/\s+/)[0];
	const fullKey = (p: Person) => `${key(firstWord(p))} ${key(p.lastName)}`;
	const byFirstName = Map.groupBy(people, (p) => key(firstWord(p)));
	const byFullName = Map.groupBy(people, fullKey);

	const names = new Map<string, string>();
	for (const person of people) {
		const firstName = firstWord(person);
		const twins = byFullName.get(fullKey(person))!;
		const number = twins.length > 1 && twins[0] !== person ? ` (${twins.indexOf(person) + 1})` : '';
		const others = byFirstName.get(key(firstName))!.filter((p) => fullKey(p) !== fullKey(person));
		if (others.length === 0) {
			names.set(person.id, firstName + number);
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
		names.set(person.id, `${firstName} ${shown}${number}`);
	}
	return names;
}

/**
 * Everyone's short name as things stand, keyed by user ID. Worked out afresh
 * each time, so it follows attendees being added and deleted. Oldest first,
 * so namesakes are numbered in the order they came.
 *
 * ponytail: reads every user. A club is hundreds at most.
 */
export function displayNames() {
	return shortNames(
		db
			.select({ id: user.id, firstName: user.firstName, lastName: user.lastName })
			.from(user)
			.orderBy(asc(user.createdAt), asc(user.id))
			.all()
	);
}
