import { m } from '$lib/paraglide/messages';
import { getLocale } from '$lib/paraglide/runtime';
import { formatDateTime, wallClock } from '$lib/time';

export const day = (at: Date) =>
	formatDateTime(at, getLocale(), { weekday: 'short', day: 'numeric', month: 'short' });
export const time = (at: Date) =>
	formatDateTime(at, getLocale(), { hour: '2-digit', minute: '2-digit' });

/** When an event runs, naming its day only once if it starts and ends on it. */
export function eventWhen(event: { startsAt: Date; endsAt: Date; allDay: boolean }) {
	if (event.allDay) {
		// The end of a whole-day event is the midnight after it.
		const last = new Date(event.endsAt.getTime() - 1);
		const days =
			wallClock(last).date === wallClock(event.startsAt).date
				? day(event.startsAt)
				: `${day(event.startsAt)} – ${day(last)}`;
		return `${days} · ${m.events_all_day()}`;
	}
	return wallClock(event.startsAt).date === wallClock(event.endsAt).date
		? `${day(event.startsAt)}, ${time(event.startsAt)}–${time(event.endsAt)}`
		: `${day(event.startsAt)}, ${time(event.startsAt)} – ${day(event.endsAt)}, ${time(event.endsAt)}`;
}
