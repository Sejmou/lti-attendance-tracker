import { expect, test } from 'vitest';
import { adminCrumbs } from './admin-breadcrumbs';

const event = { id: 'e1', title: 'Probe' };

test('the start page has no trail', () => {
	expect(adminCrumbs('/admin')).toEqual([]);
});

test('every page below it ends in itself, unlinked', () => {
	expect(adminCrumbs('/admin/events')).toEqual([
		{ label: 'Organisation', href: '/admin' },
		{ label: 'Veranstaltungen' }
	]);
	expect(adminCrumbs('/admin/code')).toEqual([
		{ label: 'Organisation', href: '/admin' },
		{ label: 'QR-Code' }
	]);
	expect(adminCrumbs('/admin/attendees')).toEqual([
		{ label: 'Organisation', href: '/admin' },
		{ label: 'Teilnehmer:innen' }
	]);
});

test('an event and its QR screen sit under the events', () => {
	expect(adminCrumbs('/admin/events/[id]', event)).toEqual([
		{ label: 'Organisation', href: '/admin' },
		{ label: 'Veranstaltungen', href: '/admin/events' },
		{ label: 'Probe' }
	]);
	expect(adminCrumbs('/admin/events/[id]/code', event)).toEqual([
		{ label: 'Organisation', href: '/admin' },
		{ label: 'Veranstaltungen', href: '/admin/events' },
		{ label: 'Probe', href: '/admin/events/e1' },
		{ label: 'QR-Code' }
	]);
});

test('without the event, as for an unknown one, the trail stops above it', () => {
	const above = [
		{ label: 'Organisation', href: '/admin' },
		{ label: 'Veranstaltungen', href: '/admin/events' }
	];
	expect(adminCrumbs('/admin/events/[id]')).toEqual(above);
	expect(adminCrumbs('/admin/events/[id]/code')).toEqual(above);
});

test('other routes, or none, get no trail', () => {
	expect(adminCrumbs(null)).toEqual([]);
	expect(adminCrumbs('/scan')).toEqual([]);
});
