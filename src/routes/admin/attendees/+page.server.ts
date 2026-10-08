import { fail } from '@sveltejs/kit';
import { deleteAttendee, listAttendees } from '$lib/server/attendees';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => ({ attendees: listAttendees() });

export const actions: Actions = {
	delete: async ({ request }) => {
		const id = String((await request.formData()).get('id'));
		if (!deleteAttendee(id)) return fail(404, { missing: true });
		return { deleted: true };
	}
};
