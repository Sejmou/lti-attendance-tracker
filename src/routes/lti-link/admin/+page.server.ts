import { fail, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { m } from '$lib/paraglide/messages';
import {
	ADMIN_SESSION_COOKIE,
	adminSessionCookieOptions,
	issueAdminSession,
	verifyAdminLaunch
} from '$lib/server/scan-token';
import type { Actions } from './$types';

export const actions: Actions = {
	/**
	 * Turns the proof from an admin-tool launch into a session. Posted from
	 * this page, top-level, so the cookie is a first-party one — set during the
	 * launch itself, inside the platform's frame, it wouldn't be.
	 */
	signIn: async ({ cookies, request }) => {
		const token = (await request.formData()).get('token');
		const userId = typeof token === 'string' && verifyAdminLaunch(token);
		if (!userId) return fail(403, { message: m.admin_launch_expired() });

		cookies.set(ADMIN_SESSION_COOKIE, issueAdminSession(userId), adminSessionCookieOptions);
		redirect(303, resolve('/admin'));
	}
};
