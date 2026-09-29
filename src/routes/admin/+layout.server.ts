import { error } from '@sveltejs/kit';
import { m } from '$lib/paraglide/messages';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => {
	// Nowhere to sign in here: organizers are whoever the platform lets open
	// the admin tool, and a launch of it is the only way in.
	if (!locals.admin) error(401, m.admin_open_from_lms_text());
	return { admin: locals.admin };
};
