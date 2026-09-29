import { env } from '$env/dynamic/public';

/**
 * The zone every time is shown and entered in, on the server and in the
 * browser alike. Without it, the server renders in its own zone (UTC in the
 * container) and each browser in the device's, so the same scan could read
 * as three different times.
 */
export const TIMEZONE = env.PUBLIC_TIMEZONE || 'Europe/Vienna';

// Fails at startup, like a missing DATABASE_URL, rather than on the first page.
new Intl.DateTimeFormat('en', { timeZone: TIMEZONE });

/**
 * `toLocaleString` and friends, always in TIMEZONE and on a 24-hour clock,
 * whatever the language: 18:00, not 6:00 PM. There is no telling a zone's
 * own convention from its name, and TIMEZONE is meant to be a European one.
 */
export const formatDateTime = (at: Date, locale: string, options: Intl.DateTimeFormatOptions) =>
	at.toLocaleString(locale, { ...options, timeZone: TIMEZONE, hourCycle: 'h23' });

const parts = new Intl.DateTimeFormat('en-US', {
	timeZone: TIMEZONE,
	hourCycle: 'h23',
	year: 'numeric',
	month: '2-digit',
	day: '2-digit',
	hour: '2-digit',
	minute: '2-digit',
	second: '2-digit'
});

/** What a clock in TIMEZONE shows at `at`. */
export function wallClock(at: Date) {
	const get = Object.fromEntries(parts.formatToParts(at).map((p) => [p.type, p.value]));
	return {
		date: `${get.year}-${get.month}-${get.day}`,
		time: `${get.hour}:${get.minute}`,
		seconds: Number(get.second)
	};
}

/**
 * The moment a clock in TIMEZONE shows `date` (YYYY-MM-DD) and `time`
 * (HH:MM), or null if either isn't one. In the hour skipped when the clocks
 * go forward, the time after the jump; in the one repeated when they go back,
 * the first of the two.
 */
export function fromWallClock(date: string, time = '00:00') {
	const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
	const t = /^(\d{2}):(\d{2})$/.exec(time);
	if (!d || !t) return null;
	const [year, month, day, hour, minute] = [d[1], d[2], d[3], t[1], t[2]].map(Number);
	if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;

	const asUtc = Date.UTC(year, month - 1, day, hour, minute);
	// 31 February and the like roll over into the next month; they aren't dates.
	if (new Date(asUtc).getUTCDate() !== day) return null;

	// The zone's offset from UTC, as it is at `at`.
	const offset = (at: number) => {
		const clock = wallClock(new Date(at));
		const [y, mo, da] = clock.date.split('-').map(Number);
		const [h, mi] = clock.time.split(':').map(Number);
		return Date.UTC(y, mo - 1, da, h, mi, clock.seconds) - at;
	};
	// A zone changes its offset at most once within a day or so, so the
	// offsets a day either side are the only ones the answer can have. Those
	// that read back as the time asked for are it: two when the clocks go back.
	const DAY = 24 * 60 * 60_000;
	const before = asUtc - offset(asUtc - DAY);
	const after = asUtc - offset(asUtc + DAY);
	const reads = (at: number) => {
		const clock = wallClock(new Date(at));
		return clock.date === date && clock.time === time;
	};
	const valid = [before, after].filter(reads);
	// None when the clocks go forward past it: the old offset carries it past
	// the jump, as if the clock had kept going.
	return new Date(valid.length > 0 ? Math.min(...valid) : before);
}
