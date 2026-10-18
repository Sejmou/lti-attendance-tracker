import { fail, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { eq } from 'drizzle-orm';
import { scanMessage } from '$lib/device-key';
import { m } from '$lib/paraglide/messages';
import { keepBrowserId } from '$lib/server/browser-id';
import { clientOf, recordScan } from '$lib/server/scan';
import { parseDetails, manualEntryUser } from '$lib/server/manual-entry';
import { db } from '$lib/server/db';
import { deviceKey } from '$lib/server/db/schema';
import { verifySignature } from '$lib/server/device-key';
import {
	issuePresence,
	PRESENCE_COOKIE,
	presenceCookieOptions,
	codeScanId,
	verifyBucketToken,
	verifyPresence
} from '$lib/server/scan-token';
import type { Actions, PageServerLoad } from './$types';

// Functions, not strings: the wording depends on the locale of each request.
const NO_PRESENCE = m.scan_expired;
const NOT_FRESH = m.scan_not_confirmed;
const NOT_SET_UP = m.scan_not_set_up;
const EVENT_GONE = m.scan_event_gone;
const INVALID_DETAILS = m.scan_manual_invalid;
const CODE_SCAN_USED = m.scan_manual_used;

export const load: PageServerLoad = async (event) => {
	const token = event.url.searchParams.get('t');
	const screen = token && verifyBucketToken(token);
	if (screen) {
		event.cookies.set(PRESENCE_COOKIE, issuePresence(screen), presenceCookieOptions);
		keepBrowserId(event.cookies);
		redirect(302, resolve('/scan'));
	}

	const presence = event.cookies.get(PRESENCE_COOKIE);
	return {
		// What the device key signs. Not a secret (it is stored with the scan),
		// but it only exists once this browser has scanned a live code.
		codeScanId: verifyPresence(presence) ? codeScanId(presence!) : null
	};
};

export const actions: Actions = {
	/**
	 * A signature over this scan from the key the browser got when its owner
	 * opened the Moodle activity. The setup page makes that key so it can't be
	 * copied out of the browser, so it stands in for the attendee — though the
	 * server has no way to check it was made that way (see "What stops abuse").
	 */
	withDeviceKey: async (event) => {
		const presence = event.cookies.get(PRESENCE_COOKIE);
		const screen = verifyPresence(presence);
		if (!screen) return fail(403, { message: NO_PRESENCE() });

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
		if (!verifySignature(key.publicKey, scanMessage(codeScanId(presence!)), signature)) {
			return fail(403, { message: NOT_FRESH() });
		}

		const outcome = recordScan(clientOf(event), {
			userId: key.userId,
			method: 'device',
			codeScanId: codeScanId(presence!),
			screen
		});
		// `used` is only ever for details typed in.
		if ('gone' in outcome || 'used' in outcome) {
			return fail(403, {
				message: 'gone' in outcome && outcome.gone === 'event' ? EVENT_GONE() : NOT_FRESH()
			});
		}
		return { scanned: outcome };
	},

	/**
	 * The last resort, for someone who scanned the code but can't confirm with
	 * a set-up phone or Moodle: they type in who they are. The code still says
	 * they are at the door; nothing says it is them. Filed as `manual`, under
	 * someone of their own (see manualEntryUser), and flagged in the log when
	 * the browser has confirmed other people or belongs to another attendee.
	 *
	 * A browser that has a device key sends a signature along, as it would for
	 * withDeviceKey, so the log can say whose phone it was.
	 */
	manualEntry: async (event) => {
		const presence = event.cookies.get(PRESENCE_COOKIE);
		const screen = verifyPresence(presence);
		if (!screen) return fail(403, { message: NO_PRESENCE() });

		const form = await event.request.formData();
		const details = parseDetails(form);
		if (!details) return fail(400, { message: INVALID_DETAILS() });

		const outcome = recordScan(clientOf(event), {
			userId: manualEntryUser(details),
			method: 'manual',
			deviceKeyUserId: deviceKeyOwner(form, codeScanId(presence!)),
			codeScanId: codeScanId(presence!),
			screen
		});
		if ('used' in outcome) return fail(409, { message: CODE_SCAN_USED() });
		if ('gone' in outcome) {
			return fail(403, { message: outcome.gone === 'event' ? EVENT_GONE() : NOT_FRESH() });
		}
		return { scanned: { ...outcome, manualEntry: true } };
	}
};

/** Whose device key signed this code scan, if the form came with a signature that checks out. */
function deviceKeyOwner(form: FormData, codeScanId: string) {
	const keyId = form.get('keyId');
	const signature = form.get('signature');
	if (typeof keyId !== 'string' || typeof signature !== 'string' || !keyId) return null;
	const key = db
		.select({ userId: deviceKey.userId, publicKey: deviceKey.publicKey })
		.from(deviceKey)
		.where(eq(deviceKey.id, keyId))
		.get();
	return key && verifySignature(key.publicKey, scanMessage(codeScanId), signature)
		? key.userId
		: null;
}
