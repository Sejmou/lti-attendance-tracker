import { fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { enrollMessage } from '$lib/device-key';
import { m } from '$lib/paraglide/messages';
import { db } from '$lib/server/db';
import { deviceKey, user } from '$lib/server/db/schema';
import { parsePublicKey, verifySignature } from '$lib/server/device-key';
import { verifyEnrollment } from '$lib/server/scan-token';
import type { Actions, PageServerLoad } from './$types';

// Functions, not strings: the wording depends on the locale of each request.
const PROBLEMS = {
	'no-profile': m.enroll_problem_no_profile,
	'email-taken': m.enroll_problem_email_taken
} as const;

const EXPIRED = m.enroll_expired;
const BAD_KEY = m.enroll_bad_key;

export const load: PageServerLoad = ({ url }) => {
	const problem = url.searchParams.get('problem');
	return {
		problem: problem && problem in PROBLEMS ? PROBLEMS[problem as keyof typeof PROBLEMS]() : null
	};
};

export const actions: Actions = {
	/**
	 * Stores the public key this browser just made, for the guest a Moodle
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
			const guest = tx
				.select({ id: user.id })
				.from(user)
				.where(eq(user.id, enrollment.userId))
				.get();
			if (!guest) return EXPIRED();

			const existing = tx
				.select({ createdAt: deviceKey.createdAt })
				.from(deviceKey)
				.where(eq(deviceKey.userId, guest.id))
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
				.values({ ...values, userId: guest.id })
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
