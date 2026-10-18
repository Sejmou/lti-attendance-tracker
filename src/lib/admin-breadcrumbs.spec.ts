import { expect, test } from 'vitest';
import { resolve } from '$app/paths';
import { m } from '$lib/paraglide/messages';
import { adminCrumbs } from './admin-breadcrumbs';

const event = { id: 'e1', title: 'Probe' };

// Labels and links as the app makes them: what is checked is the trail, not
// the wording, the language or where the app is served from.
const start = { label: m.admin_title(), href: resolve('/admin') };
const events = { label: m.events_title(), href: resolve('/admin/events') };

test('the start page has no trail', () => {
	expect(adminCrumbs('/admin')).toEqual([]);
});

test('every page below it ends in itself, unlinked', () => {
	expect(adminCrumbs('/admin/events')).toEqual([start, { label: m.events_title() }]);
	expect(adminCrumbs('/admin/code')).toEqual([start, { label: m.admin_breadcrumb_code() }]);
	expect(adminCrumbs('/admin/attendees')).toEqual([start, { label: m.attendees_title() }]);
});

test('an event and its QR screen sit under the events', () => {
	expect(adminCrumbs('/admin/events/[id]', event)).toEqual([start, events, { label: 'Probe' }]);
	expect(adminCrumbs('/admin/events/[id]/code', event)).toEqual([
		start,
		events,
		{ label: 'Probe', href: resolve('/admin/events/[id]', { id: 'e1' }) },
		{ label: m.admin_breadcrumb_code() }
	]);
});

test('without the event, as for an unknown one, the trail stops above it', () => {
	expect(adminCrumbs('/admin/events/[id]')).toEqual([start, events]);
	expect(adminCrumbs('/admin/events/[id]/code')).toEqual([start, events]);
});

test('other routes, or none, get no trail', () => {
	expect(adminCrumbs(null)).toEqual([]);
	expect(adminCrumbs('/scan')).toEqual([]);
});
