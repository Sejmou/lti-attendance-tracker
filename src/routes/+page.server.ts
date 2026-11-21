import { fail, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { eq } from 'drizzle-orm';
import { viewMessage } from '$lib/device-key';
import { m } from '$lib/paraglide/messages';
import { myAttendance } from '$lib/server/attendance';
import { db } from '$lib/server/db';
import { deviceKey, user } from '$lib/server/db/schema';
import { verifySignature } from '$lib/server/device-key';
import { issueViewChallenge, verifyViewChallenge } from '$lib/server/scan-token';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (locals.admin) redirect(302, resolve('/admin'));
	return { challenge: issueViewChallenge() };
};

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
