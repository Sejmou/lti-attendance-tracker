import { expect, test } from 'vitest';
import { fromWallClock, TIMEZONE, wallClock } from './time';

// The default, and what .env.test leaves it at.
test('times are in Vienna', () => {
	expect(TIMEZONE).toBe('Europe/Vienna');
});

test('a wall-clock time in Vienna is one or two hours ahead of UTC', () => {
	expect(fromWallClock('2026-10-05', '18:00')).toEqual(new Date('2026-10-05T16:00:00Z'));
	expect(fromWallClock('2026-12-05', '18:00')).toEqual(new Date('2026-12-05T17:00:00Z'));
	expect(fromWallClock('2026-12-05')).toEqual(new Date('2026-12-04T23:00:00Z'));
});

test('and reads back as the same wall-clock time', () => {
	for (const at of ['2026-10-05T16:00:00Z', '2026-12-31T23:30:00Z']) {
		const { date, time } = wallClock(new Date(at));
		expect(fromWallClock(date, time)).toEqual(new Date(at));
	}
	expect(wallClock(new Date('2026-12-31T23:30:00Z'))).toMatchObject({
		date: '2027-01-01',
		time: '00:30'
	});
});

test('around the DST changes, a time that does not exist moves forward and a doubled one is the first', () => {
	// 29 March 2026: 02:00 jumps to 03:00.
	expect(fromWallClock('2026-03-29', '02:30')).toEqual(new Date('2026-03-29T01:30:00Z'));
	// 25 October 2026: 03:00 goes back to 02:00, so 02:30 happens twice.
	expect(fromWallClock('2026-10-25', '02:30')).toEqual(new Date('2026-10-25T00:30:00Z'));
});

test('anything that is not a date and a time is null', () => {
	for (const [date, time] of [
		['2026-02-31', '10:00'],
		['2026-13-01', '10:00'],
		['2026-10-05', '24:00'],
		['5.10.2026', '10:00'],
		['2026-10-05', '10']
	]) {
		expect(fromWallClock(date, time)).toBeNull();
	}
});
