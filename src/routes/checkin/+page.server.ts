import { fail, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { eq } from 'drizzle-orm';
import { checkInMessage } from '$lib/device-key';
import { m } from '$lib/paraglide/messages';
import { recordCheckIn } from '$lib/server/check-in';
import { db } from '$lib/server/db';
import { deviceKey } from '$lib/server/db/schema';
import { verifySignature } from '$lib/server/device-key';
import {
	issuePresence,
	PRESENCE_COOKIE,
	presenceCookieOptions,
	scanId,
	verifyBucketToken,
	verifyPresence
} from '$lib/server/scan-token';
import type { Actions, PageServerLoad } from './$types';

// Functions, not strings: the wording depends on the locale of each request.
const NO_PRESENCE = m.checkin_expired;
const NOT_FRESH = m.checkin_not_confirmed;
const NOT_SET_UP = m.checkin_not_set_up;

export const load: PageServerLoad = async (event) => {
	const token = event.url.searchParams.get('t');
	const hostId = token && verifyBucketToken(token);
	if (hostId) {
		event.cookies.set(PRESENCE_COOKIE, issuePresence(hostId), presenceCookieOptions);
		redirect(302, resolve('/checkin'));
	}

	const presence = event.cookies.get(PRESENCE_COOKIE);
	return {
		// What the device key signs. Not a secret (it is stored with the check-in),
		// but it only exists once this browser has scanned a live code.
		scanId: verifyPresence(presence) ? scanId(presence!) : null
	};
};

export const actions: Actions = {
	/**
	 * A signature over this scan from the key the browser got when its owner
	 * opened the Moodle activity. The setup page makes that key so it can't be
	 * copied out of the browser, so it stands in for the guest — though the
	 * server has no way to check it was made that way (see "What stops abuse").
	 */
	withDeviceKey: async (event) => {
		const presence = event.cookies.get(PRESENCE_COOKIE);
		const hostId = verifyPresence(presence);
		if (!hostId) return fail(403, { message: NO_PRESENCE() });

		const form = await event.request.formData();
		const keyId = form.get('keyId');
		const signature = form.get('signature');
		if (typeof keyId !== 'string' || typeof signature !== 'string') {
			return fail(400, { message: NOT_SET_UP() });
		}

		// A key replaced by setting up another phone is gone, so its old
		// browser lands here too.
		const key = db
			.select({ userId: deviceKey.userId, publicKey: deviceKey.publicKey })
			.from(deviceKey)
			.where(eq(deviceKey.id, keyId))
			.get();
		if (!key) return fail(403, { message: NOT_SET_UP() });
		if (!verifySignature(key.publicKey, checkInMessage(scanId(presence!)), signature)) {
			return fail(403, { message: NOT_FRESH() });
		}

		const checkedIn = await recordCheckIn(event, {
			userId: key.userId,
			method: 'device',
			scanId: scanId(presence!),
			hostId
		});
		if (!checkedIn) return fail(403, { message: NOT_FRESH() });
		return { checkedIn };
	}
};
