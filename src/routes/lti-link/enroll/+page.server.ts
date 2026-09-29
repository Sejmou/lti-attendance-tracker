import { fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { enrollMessage } from '$lib/device-key';
import { m } from '$lib/paraglide/messages';
import { recordScan } from '$lib/server/scan';
import { db } from '$lib/server/db';
import { deviceKey, user } from '$lib/server/db/schema';
import { parsePublicKey, verifySignature } from '$lib/server/device-key';
import { launchCodeScanId, verifyBucketToken, verifyEnrollment } from '$lib/server/scan-token';
import type { Actions, PageServerLoad } from './$types';

// Functions, not strings: the wording depends on the locale of each request.
const PROBLEMS = {
	'no-profile': m.enroll_problem_no_profile,
	'unknown-tool': m.enroll_problem_unknown_tool
} as const;

const EXPIRED = m.enroll_expired;
const BAD_KEY = m.enroll_bad_key;
const SCAN_EXPIRED = m.enroll_scan_expired;
const CODE_EXPIRED = m.scan_expired;

export const load: PageServerLoad = ({ url }) => {
	const problem = url.searchParams.get('problem');
	return {
		problem: problem && problem in PROBLEMS ? PROBLEMS[problem as keyof typeof PROBLEMS]() : null
	};
};

export const actions: Actions = {
	/**
	 * A code scanned with the camera inside this page, for an attendee who didn't
	 * set up a device — or whose camera app opens another browser than the one
	 * they set up. The launch that opened the page is the proof of who they
	 * are, so it only works for as long as the enrollment token does; the code
	 * is the proof they are at the door, as it is for a set-up phone.
	 *
	 * The token is not spent: it is only good for 15 minutes anyway, and a
	 * second scan with it is either a double submit, collapsed by the unique
	 * index, or the same attendee coming back in.
	 */
	scan: async (event) => {
		const form = await event.request.formData();
		const token = form.get('token');
		const code = form.get('code');
		if (typeof token !== 'string' || typeof code !== 'string') {
			return fail(400, { message: CODE_EXPIRED() });
		}

		const enrollment = verifyEnrollment(token);
		if (!enrollment) return fail(403, { message: SCAN_EXPIRED() });

		const hostId = verifyBucketToken(code);
		if (!hostId) return fail(403, { message: CODE_EXPIRED() });

		const scanned = await recordScan(event, {
			userId: enrollment.userId,
			method: 'lti',
			codeScanId: launchCodeScanId(token, code),
			hostId
		});
		if (!scanned) return fail(403, { message: SCAN_EXPIRED() });
		return { scanned };
	},

	/**
	 * Stores the public key this browser just made, for the attendee a Moodle
	 * launch vouched for. The signature over the enrollment token shows the
	 * browser posting it holds the matching private key.
	 */
	enroll: async (event) => {
		const form = await event.request.formData();
		const token = form.get('token');
		const signature = form.get('signature');
		if (typeof token !== 'string' || typeof signature !== 'string') {
			return fail(400, { message: BAD_KEY() });
		}

		const enrollment = verifyEnrollment(token);
		if (!enrollment) return fail(403, { message: EXPIRED() });

		const publicKey = parsePublicKey(parseJson(form.get('publicKey')));
		if (!publicKey || !verifySignature(publicKey, enrollMessage(token), signature)) {
			return fail(400, { message: BAD_KEY() });
		}

		// One transaction: two tabs racing with the same link can't both find it unspent.
		const outcome = db.transaction((tx) => {
			const attendee = tx
				.select({ id: user.id })
				.from(user)
				.where(eq(user.id, enrollment.userId))
				.get();
			if (!attendee) return EXPIRED();

			const existing = tx
				.select({ createdAt: deviceKey.createdAt })
				.from(deviceKey)
				.where(eq(deviceKey.userId, attendee.id))
				.get();
			// A key set up since this link was issued spent it.
			if (existing && existing.createdAt.getTime() >= enrollment.issuedAt) return EXPIRED();

			// Replaces any earlier key, and gives it a new id, so the browser that
			// held the old one is no longer set up.
			const values = {
				id: crypto.randomUUID(),
				publicKey,
				createdAt: new Date(),
				userAgent: event.request.headers.get('user-agent')
			};
			return tx
				.insert(deviceKey)
				.values({ ...values, userId: attendee.id })
				.onConflictDoUpdate({ target: deviceKey.userId, set: values })
				.returning({ keyId: deviceKey.id })
				.get();
		});

		if (typeof outcome === 'string') return fail(403, { message: outcome });
		return outcome;
	}
};

function parseJson(value: FormDataEntryValue | null): unknown {
	if (typeof value !== 'string') return null;
	try {
		return JSON.parse(value);
	} catch {
		return null;
	}
}
