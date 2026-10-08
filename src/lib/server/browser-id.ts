import type { Cookies } from '@sveltejs/kit';
import { resolve } from '$app/paths';

/**
 * A random ID for each browser that scans a code, so one browser behind
 * several people's scans shows up in the log. Not proof of anything: clearing
 * the browser's data, or a private window, makes a new one. It only makes the
 * easy kind of abuse — typing in friends' details on one phone — visible.
 *
 * A cookie the server sets rather than a key the page makes: neither can stop
 * someone starting over, and Safari may clear what page scripts store (like
 * the device key) after a week of not visiting, but not this.
 */
export const BROWSER_COOKIE = 'browser';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The browser's ID, or null if it has none or sent something we didn't make. */
export function browserIdOf(cookies: Cookies) {
	const value = cookies.get(BROWSER_COOKIE);
	return value && UUID.test(value) ? value : null;
}

/** Gives the browser an ID if it has none, and renews it either way. */
export function keepBrowserId(cookies: Cookies) {
	const id = browserIdOf(cookies) ?? crypto.randomUUID();
	cookies.set(BROWSER_COOKIE, id, {
		path: resolve('/'),
		httpOnly: true,
		sameSite: 'lax',
		// The longest Chrome keeps a cookie; every scan starts the clock again.
		maxAge: 400 * 24 * 60 * 60
	});
	return id;
}
