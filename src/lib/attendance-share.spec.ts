import { expect, test } from 'vitest';
import { attendanceShare } from './attendance-share';

const at = (hhmm: string) => new Date(`2026-10-05T${hhmm}:00Z`);
const talk = { startsAt: at('18:00'), endsAt: at('20:00'), allDay: false };

test('the part of the event between scan-in and scan-out', () => {
	expect(attendanceShare(talk, at('18:30'), at('19:30'))).toBe(0.5);
});

test('arriving early or leaving late never takes it past the whole event', () => {
	expect(attendanceShare(talk, at('17:00'), at('21:00'))).toBe(1);
	expect(attendanceShare(talk, at('17:30'), at('19:00'))).toBe(0.5);
});

test('scans entirely before or after the event are none of it', () => {
	expect(attendanceShare(talk, at('16:00'), at('17:00'))).toBe(0);
	expect(attendanceShare(talk, at('20:30'), at('21:00'))).toBe(0);
});

test('nothing to say without a scan-out, or for an all-day event', () => {
	expect(attendanceShare(talk, at('18:00'), null)).toBeNull();
	expect(attendanceShare({ ...talk, allDay: true }, at('18:00'), at('20:00'))).toBeNull();
});
