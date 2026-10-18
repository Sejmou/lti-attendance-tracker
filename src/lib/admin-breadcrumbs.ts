import { resolve } from '$app/paths';
import { m } from '$lib/paraglide/messages';

export type Crumb = { label: string; href?: string };

/**
 * Where an admin page sits, from the organizer start page down to it. The
 * last crumb is the page itself, without a link. The start page gets none.
 *
 * Follows the URL, not the way there: an event's QR screen sits under the
 * event, also when it was picked at /admin/code. Without `event`, as on the
 * error page for an unknown one, the trail stops above it.
 */
export function adminCrumbs(
	routeId: string | null,
	event?: { id: string; title: string }
): Crumb[] {
	const start = { label: m.admin_title(), href: resolve('/admin') };
	const events = { label: m.events_title(), href: resolve('/admin/events') };
	const code = { label: m.admin_breadcrumb_code() };
	const ofEvent = (event: { id: string; title: string }) => ({
		label: event.title,
		href: resolve('/admin/events/[id]', { id: event.id })
	});
	const here = (crumbs: Crumb[]) => [...crumbs.slice(0, -1), { label: crumbs.at(-1)!.label }];

	switch (routeId) {
		case '/admin/events':
			return here([start, events]);
		case '/admin/events/[id]':
			return event ? here([start, events, ofEvent(event)]) : [start, events];
		case '/admin/events/[id]/code':
			return event ? here([start, events, ofEvent(event), code]) : [start, events];
		case '/admin/code':
			return here([start, code]);
		case '/admin/attendees':
			return here([start, { label: m.attendees_title() }]);
		default:
			return [];
	}
}
