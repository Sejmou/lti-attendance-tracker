import { expect, test } from 'vitest';
import { parseEventForm } from './events';

const form = (fields: Record<string, string>) => {
	const data = new FormData();
	for (const [name, value] of Object.entries(fields)) data.set(name, value);
	return data;
};

const valid = {
	title: ' Sommerfest ',
	location: '',
	startDate: '2026-10-15',
	startTime: '18:00',
	endDate: '2026-10-15',
	endTime: '22:30'
};

test('dates and times are read in TIMEZONE, and blanks are trimmed away', () => {
	expect(parseEventForm(form(valid))).toMatchObject({
		errors: null,
		values: {
			title: 'Sommerfest',
			location: null,
			startsAt: new Date('2026-10-15T16:00:00Z'),
			endsAt: new Date('2026-10-15T20:30:00Z')
		}
	});
});

test('what is missing or wrong is said per field, and what was typed comes back', () => {
	const result = parseEventForm(
		form({ ...valid, title: '  ', startTime: '', endDate: '2026-02-31' })
	);
	expect(result.values).toBeNull();
	expect(result.errors).toEqual({ title: 'required', start: 'required', end: 'invalid' });
	expect(result.fields.endDate).toBe('2026-02-31');
});

test('an event has to end after it starts', () => {
	expect(parseEventForm(form({ ...valid, endTime: '18:00' })).errors).toEqual({
		end: 'before_start'
	});
	// Across midnight is fine, as long as the end date says so.
	expect(
		parseEventForm(form({ ...valid, endDate: '2026-10-16', endTime: '02:00' })).errors
	).toBeNull();
});
