// `scanner`, not a user ID: a deleted attendee's rows still need telling apart.
type Row = { scanner: string; ipAddress: string | null };

/**
 * Marks the two things worth seeing at a glance in the log. Neither is wrong on
 * its own — attendees step out for air, and a whole table shares one hotspot — but
 * a code that leaked shows up as one of them.
 *
 * Rows go in newest first and come back in the same order.
 */
export function annotate<T extends Row>(rows: T[]) {
	const usersPerIp = new Map<string, Set<string>>();
	for (const { ipAddress, scanner } of rows) {
		if (!ipAddress) continue;
		let seen = usersPerIp.get(ipAddress);
		if (!seen) usersPerIp.set(ipAddress, (seen = new Set()));
		seen.add(scanner);
	}

	// Walked oldest first, so the earliest arrival is the one not marked.
	const arrived = new Set<string>();
	const marked = rows
		.slice()
		.reverse()
		.map((row) => {
			const repeat = arrived.has(row.scanner);
			arrived.add(row.scanner);
			return {
				...row,
				repeat,
				sharedAddress: (usersPerIp.get(row.ipAddress ?? '')?.size ?? 0) > 1
			};
		})
		.reverse();

	return { rows: marked, attendees: arrived.size, addresses: usersPerIp.size };
}
