import { fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { viewMessage } from '$lib/device-key';
import { m } from '$lib/messages';
import { myAttendance } from '$lib/server/attendance';
import { db } from '$lib/server/db';
import { deviceKey, user } from '$lib/server/db/schema';
import { verifySignature } from '$lib/server/device-key';
import { issueViewChallenge, verifyViewChallenge } from '$lib/server/scan-token';
import type { Actions, PageServerLoad } from './$types';

// No redirect for organizers: the same browser may be set up for them as an
// attendee, and only the browser knows. The page offers the way over instead.
export const load: PageServerLoad = ({ locals }) => ({
	challenge: issueViewChallenge(),
	admin: Boolean(locals.admin)
});

export const actions: Actions = {
	/**
	 * A linked phone's own attendance, without Moodle: the device key's
	 * signature over a fresh challenge says whose phone it is, as it does for
	 * a scan.
	 */
	attendance: async ({ request }) => {
		const form = await request.formData();
		const keyId = form.get('keyId');
		const signature = form.get('signature');
		const challenge = form.get('challenge');
		if (
			typeof keyId !== 'string' ||
			typeof signature !== 'string' ||
			typeof challenge !== 'string' ||
			!verifyViewChallenge(challenge)
		) {
			return fail(400, { message: m.home_expired() });
		}

		const key = db
			.select({
				userId: deviceKey.userId,
				publicKey: deviceKey.publicKey,
				firstName: user.firstName
			})
			.from(deviceKey)
			.innerJoin(user, eq(user.id, deviceKey.userId))
			.where(eq(deviceKey.id, keyId))
			.get();
		// A key replaced by linking another browser is gone, so its old browser lands here too.
		if (!key || !verifySignature(key.publicKey, viewMessage(challenge), signature)) {
			return fail(403, { notLinked: true });
		}
		return { me: { firstName: key.firstName, events: myAttendance(key.userId) } };
	}
};
