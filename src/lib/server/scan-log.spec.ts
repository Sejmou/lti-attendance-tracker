import { expect, test } from 'vitest';
import { annotate } from './scan-log';

// Newest first, the order the page shows them in.
const rows = [
	{ scanner: 'ada', ipAddress: '10.0.0.9' }, // came back
	{ scanner: 'bob', ipAddress: '10.0.0.7' }, // ...on Grace's phone
	{ scanner: 'grace', ipAddress: '10.0.0.7' },
	{ scanner: 'ada', ipAddress: '10.0.0.9' }
];

test('the first arrival is not a repeat and a later one is', () => {
	const { rows: marked, attendees } = annotate(rows);

	expect(marked.map((r) => r.repeat)).toEqual([true, false, false, false]);
	expect(attendees).toBe(3);
});

test('an address covering two attendees is flagged on both of their rows', () => {
	const { rows: marked, addresses } = annotate(rows);

	expect(marked.map((r) => r.sharedAddress)).toEqual([false, true, true, false]);
	expect(addresses).toBe(2);
});

test('a missing address is not shared with every other missing one', () => {
	const { rows: marked, addresses } = annotate([
		{ scanner: 'ada', ipAddress: null },
		{ scanner: 'bob', ipAddress: null }
	]);

	expect(marked.every((r) => !r.sharedAddress)).toBe(true);
	expect(addresses).toBe(0);
});
