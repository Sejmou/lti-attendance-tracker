import { fail, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { APIError } from 'better-auth/api';
import { m } from '$lib/paraglide/messages';
import { auth } from '$lib/server/auth';
import { isAdmin } from '$lib/server/roles';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = (event) => {
	if (isAdmin(event.locals.user)) redirect(302, resolve('/admin'));
	return {};
};

export const actions: Actions = {
	signInEmail: async (event) => {
		const formData = await event.request.formData();
		const email = formData.get('email')?.toString() ?? '';
		const password = formData.get('password')?.toString() ?? '';

		try {
			await auth.api.signInEmail({ body: { email, password } });
		} catch (error) {
			if (error instanceof APIError) {
				return fail(400, { message: m.login_wrong_credentials() });
			}
			// Whatever reaches here is not a rejected credential — a locked or
			// read-only database, say. Nobody can act on "something went wrong"
			// without it in the log.
			console.error('sign-in failed:', error);
			return fail(500, { message: m.something_went_wrong() });
		}

		redirect(302, resolve('/admin'));
	}
};
