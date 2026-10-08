type Row = {
	userId: string;
	ipAddress: string | null;
	browserId?: string | null;
	deviceKeyUserId?: string | null;
};

/**
 * Marks the two things worth seeing at a glance in the log. Neither is wrong on
 * its own — attendees step out for air, and a whole table shares one hotspot — but
 * a code that leaked shows up as one of them.
 *
 * And two that are about who scanned: one browser behind more than one
 * person (`sharedBrowser`), and details typed in on a phone set up for
 * someone else (`otherPersonsPhone`). Unlike a shared address, a shared
 * browser rarely has an innocent reason — though people do lend a phone to a
 * friend whose battery died.
 *
 * Rows go in newest first and come back in the same order.
 */
export function annotate<T extends Row>(rows: T[]) {
	const usersPerIp = usersPer(rows, (row) => row.ipAddress);
	const usersPerBrowser = usersPer(rows, (row) => row.browserId);

	// Walked oldest first, so the earliest arrival is the one not marked.
	const arrived = new Set<string>();
	const marked = rows
		.slice()
		.reverse()
		.map((row) => {
			const repeat = arrived.has(row.userId);
			arrived.add(row.userId);
			return {
				...row,
				repeat,
				sharedAddress: (usersPerIp.get(row.ipAddress ?? '')?.size ?? 0) > 1,
				sharedBrowser: (usersPerBrowser.get(row.browserId ?? '')?.size ?? 0) > 1,
				otherPersonsPhone: Boolean(row.deviceKeyUserId && row.deviceKeyUserId !== row.userId)
			};
		})
		.reverse();

	return { rows: marked, attendees: arrived.size, addresses: usersPerIp.size };
}

/** Who is behind each value of `key`, rows without one left out. */
function usersPer<T extends Row>(rows: T[], key: (row: T) => string | null | undefined) {
	const users = new Map<string, Set<string>>();
	for (const row of rows) {
		const value = key(row);
		if (!value) continue;
		let seen = users.get(value);
		if (!seen) users.set(value, (seen = new Set()));
		seen.add(row.userId);
	}
	return users;
}
