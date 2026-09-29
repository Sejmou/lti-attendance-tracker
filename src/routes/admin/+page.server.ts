import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { ADMIN_SESSION_COOKIE, adminSessionCookieOptions } from '$lib/server/scan-token';
import type { Actions } from './$types';

export const actions: Actions = {
	signOut: ({ cookies }) => {
		cookies.delete(ADMIN_SESSION_COOKIE, adminSessionCookieOptions);
		redirect(303, resolve('/'));
	}
};
