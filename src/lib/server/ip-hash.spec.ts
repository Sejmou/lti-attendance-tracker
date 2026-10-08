import { expect, test } from 'vitest';
import { browserHash, ipHash } from './ip-hash';
import { annotate } from './scan-log';

test('one address hashes the same within an event, differently in another, and never to itself', () => {
	expect(ipHash('talk', '10.0.0.7')).toBe(ipHash('talk', '10.0.0.7'));
	expect(ipHash('talk', '10.0.0.7')).not.toBe(ipHash('talk', '10.0.0.8'));
	expect(ipHash('talk', '10.0.0.7')).not.toBe(ipHash('party', '10.0.0.7'));
	expect(ipHash('talk', '10.0.0.7')).not.toContain('10.0.0.7');
});

test('two attendees on one address are still flagged as shared, from the hash alone', () => {
	const { rows, addresses } = annotate([
		{ scanner: 'bob', ipHash: ipHash('talk', '10.0.0.7') },
		{ scanner: 'grace', ipHash: ipHash('talk', '10.0.0.7') },
		{ scanner: 'ada', ipHash: ipHash('talk', '10.0.0.9') }
	]);

	expect(rows.map((r) => r.sharedAddress)).toEqual([true, true, false]);
	expect(addresses).toBe(2);
});

test("a browser's ID hashes like an address: per event, and never like an address with the same value", () => {
	const id = '6f1d2c3b-0000-4000-8000-000000000000';
	expect(browserHash('talk', id)).toBe(browserHash('talk', id));
	expect(browserHash('talk', id)).not.toBe(browserHash('party', id));
	expect(browserHash('talk', id)).not.toBe(ipHash('talk', id));
	expect(browserHash('talk', id)).not.toContain(id);
});
