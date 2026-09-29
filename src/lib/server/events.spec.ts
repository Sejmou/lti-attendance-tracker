import { expect, test } from 'vitest';
import { parseEventForm, suggestEvent } from './events';

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

const at = (hhmm: string) => new Date(`2026-10-05T${hhmm}:00Z`);
const e = (name: string, start: string, end: string, removed = false) => ({
	name,
	startsAt: at(start),
	endsAt: at(end),
	removedAt: removed ? at('00:00') : null
});

test('a running event is suggested, the one that started last if several overlap', () => {
	const day = e('conference', '06:00', '20:00');
	const talk = e('talk', '10:00', '11:00');
	const next = e('workshop', '11:05', '12:00');
	expect(suggestEvent([day, talk, next], at('10:30'))?.name).toBe('talk');
	expect(suggestEvent([day, talk, next], at('11:02'))?.name).toBe('conference');
});

test('with nothing running, the nearest one: by its start ahead, by its end behind', () => {
	const before = e('before', '08:00', '09:50');
	const after = e('after', '10:15', '11:00');
	expect(suggestEvent([before, after], at('10:00'))?.name).toBe('before');
	expect(suggestEvent([before, after], at('10:05'))?.name).toBe('after');
});

test('an event removed from the calendar is never suggested, and nothing is when nothing is left', () => {
	const gone = e('gone', '10:00', '11:00', true);
	const later = e('later', '15:00', '16:00');
	expect(suggestEvent([gone, later], at('10:30'))?.name).toBe('later');
	expect(suggestEvent([gone], at('10:30'))).toBeNull();
});
