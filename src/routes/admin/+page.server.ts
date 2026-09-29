import { error, fail, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { m } from '$lib/paraglide/messages';
import { auth } from '$lib/server/auth';
import {
	listAdmins,
	MIN_PASSWORD_LENGTH,
	promoteToAdmin,
	resetAdminPassword
} from '$lib/server/admins';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	// The admin layout already turned away anyone who isn't one.
	return { admins: locals.user?.role === 'superadmin' ? await listAdmins() : null };
};

/**
 * The superadmin's forms: whose email, and the temporary password to give them.
 * Actions skip the layout's load, so the role is checked here.
 */
async function superadminForm({ locals, request }: RequestEvent) {
	const current = locals.user;
	if (current?.role !== 'superadmin' || current.mustChangePassword) error(403, m.forbidden());

	const formData = await request.formData();
	const email = formData.get('email')?.toString().trim().toLowerCase() ?? '';
	const password = formData.get('password')?.toString() ?? '';

	let message = '';
	if (!email) message = m.admin_enter_email();
	else if (password.length < MIN_PASSWORD_LENGTH) {
		message = m.admin_temporary_password_too_short({ min: MIN_PASSWORD_LENGTH });
	}
	return { email, password, message };
}

export const actions: Actions = {
	signOut: async (event) => {
		await auth.api.signOut({ headers: event.request.headers });
		redirect(302, resolve('/login'));
	},

	promote: async (event) => {
		const { email, password, message } = await superadminForm(event);
		const failure = (message: string) => fail(400, { action: 'promote', email, message });
		if (message) return failure(message);

		switch (await promoteToAdmin(email, password)) {
			case 'not-found':
				return failure(m.admin_promote_not_found({ email }));
			case 'already-admin':
				return failure(m.admin_already_organizer({ email }));
			case 'promoted':
				return { action: 'promote', done: m.admin_promoted({ email }) };
		}
	},

	resetPassword: async (event) => {
		const { email, password, message } = await superadminForm(event);
		const failure = (message: string) => fail(400, { action: 'reset', email, message });
		if (message) return failure(message);

		if ((await resetAdminPassword(email, password)) === 'not-admin') {
			return failure(m.admin_reset_not_organizer({ email }));
		}
		return { action: 'reset', done: m.admin_reset_done({ email }) };
	}
};
