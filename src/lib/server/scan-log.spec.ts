import { expect, test } from 'vitest';
import { annotate } from './scan-log';

// Newest first, the order the page shows them in.
const rows = [
	{ scanner: 'ada', ipHash: '10.0.0.9' }, // came back
	{ scanner: 'bob', ipHash: '10.0.0.7' }, // ...on Grace's phone
	{ scanner: 'grace', ipHash: '10.0.0.7' },
	{ scanner: 'ada', ipHash: '10.0.0.9' }
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
		{ scanner: 'ada', ipHash: null },
		{ scanner: 'bob', ipHash: null }
	]);

	expect(marked.every((r) => !r.sharedAddress)).toBe(true);
	expect(addresses).toBe(0);
});

test('a browser behind two people is flagged on both of their rows, one behind a single person not', () => {
	const { rows: marked } = annotate([
		{ scanner: 'bob', ipHash: null, browserHash: 'phone-1' }, // typed in on Ada's phone
		{ scanner: 'ada', ipHash: null, browserHash: 'phone-1' },
		{ scanner: 'ada', ipHash: null, browserHash: 'phone-1' },
		{ scanner: 'grace', ipHash: null, browserHash: 'phone-2' },
		{ scanner: 'alan', ipHash: null, browserHash: null }
	]);

	expect(marked.map((r) => r.sharedBrowser)).toEqual([true, true, true, false, false]);
});

test("details typed in on a phone set up for someone else are flagged, on one's own phone not", () => {
	const { rows: marked } = annotate([
		{ scanner: 'bob', ipHash: null, deviceKeyUserId: 'ada' },
		{ scanner: 'ada', ipHash: null, deviceKeyUserId: 'ada' },
		{ scanner: 'grace', ipHash: null, deviceKeyUserId: null }
	]);

	expect(marked.map((r) => r.otherPersonsPhone)).toEqual([true, false, false]);
});
