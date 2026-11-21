import { fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { enrollMessage } from '$lib/device-key';
import { m } from '$lib/paraglide/messages';
import { myAttendance } from '$lib/server/attendance';
import { db } from '$lib/server/db';
import { deviceKey } from '$lib/server/db/schema';
import { clientOf, recordScan } from '$lib/server/scan';
import { parsePublicKey, verifySignature } from '$lib/server/device-key';
import { enrollDevice } from '$lib/server/enrollment';
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
const EVENT_GONE = m.scan_event_gone;

export const load: PageServerLoad = ({ url }) => {
	const problem = url.searchParams.get('problem');
	return {
		problem: problem && problem in PROBLEMS ? PROBLEMS[problem as keyof typeof PROBLEMS]() : null
	};
};

export const actions: Actions = {
	/**
	 * What the page needs once it has the launch's token: the attendee's
	 * attendance, and which key they have linked, if any, so the page can tell
	 * whether this browser holds it — and link it on its own if nobody has one.
	 */
	me: async ({ request }) => {
		const token = (await request.formData()).get('token');
		const enrollment = verifyEnrollment(typeof token === 'string' ? token : undefined);
		if (!enrollment) return fail(403, { message: SCAN_EXPIRED() });

		const key = db
			.select({ id: deviceKey.id })
			.from(deviceKey)
			.where(eq(deviceKey.userId, enrollment.userId))
			.get();
		return { me: { keyId: key?.id ?? null, events: myAttendance(enrollment.userId) } };
	},

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

		const screen = verifyBucketToken(code);
		if (!screen) return fail(403, { message: CODE_EXPIRED() });

		const outcome = recordScan(clientOf(event), {
			userId: enrollment.userId,
			method: 'lti',
			codeScanId: launchCodeScanId(token, code),
			screen
		});
		// `used` is only ever for details typed in.
		if ('gone' in outcome || 'used' in outcome) {
			return fail(403, {
				message: 'gone' in outcome && outcome.gone === 'event' ? EVENT_GONE() : SCAN_EXPIRED()
			});
		}
		return { scanned: outcome };
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

		const outcome = enrollDevice({
			userId: enrollment.userId,
			issuedAt: enrollment.issuedAt,
			publicKey,
			userAgent: event.request.headers.get('user-agent')
		});
		if (!outcome) return fail(403, { message: EXPIRED() });
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
