import { m } from '$lib/messages';
import { getLocale } from '$lib/paraglide/runtime';
import { formatDateTime, wallClock } from '$lib/time';

export const day = (at: Date) =>
	formatDateTime(at, getLocale(), { weekday: 'short', day: 'numeric', month: 'short' });
export const time = (at: Date) =>
	formatDateTime(at, getLocale(), { hour: '2-digit', minute: '2-digit' });

/**
 * When an event runs, naming its day only once if it starts and ends on it.
 * `allDayNote: false` leaves out "all day" where times all around already say
 * it, as in the events list, whose widest date sets the column's width.
 */
export function eventWhen(
	event: { startsAt: Date; endsAt: Date; allDay: boolean },
	{ allDayNote = true } = {}
) {
	if (event.allDay) {
		// The end of a whole-day event is the midnight after it.
		const last = new Date(event.endsAt.getTime() - 1);
		const days =
			wallClock(last).date === wallClock(event.startsAt).date
				? day(event.startsAt)
				: `${day(event.startsAt)} – ${day(last)}`;
		return allDayNote ? `${days} · ${m.events_all_day()}` : days;
	}
	return wallClock(event.startsAt).date === wallClock(event.endsAt).date
		? `${day(event.startsAt)}, ${time(event.startsAt)}–${time(event.endsAt)}`
		: `${day(event.startsAt)}, ${time(event.startsAt)} – ${day(event.endsAt)}, ${time(event.endsAt)}`;
}
