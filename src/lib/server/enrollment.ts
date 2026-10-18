import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { deviceEnrollment, deviceKey, user } from '$lib/server/db/schema';
import type { PublicJwk } from '$lib/server/device-key';
import { pruneExpired } from '$lib/server/retention';

/**
 * Stores the public key a browser just made for an attendee, whose launch
 * and whose browser's proof of the private half have already been checked
 * (see the enroll action), and logs the setup. `issuedAt` is when the launch
 * issued its setup link: a key set up since then spent it.
 *
 * Returns the key's ID, or null for a link that is spent or an attendee who
 * is gone.
 */
export function enrollDevice(setup: {
	userId: string;
	issuedAt: number;
	publicKey: PublicJwk;
	userAgent: string | null;
}) {
	// One transaction: two tabs racing with the same link can't both find it unspent.
	const outcome = db.transaction((tx) => {
		const attendee = tx.select({ id: user.id }).from(user).where(eq(user.id, setup.userId)).get();
		if (!attendee) return null;

		const existing = tx
			.select({ createdAt: deviceKey.createdAt })
			.from(deviceKey)
			.where(eq(deviceKey.userId, attendee.id))
			.get();
		// A key set up since this link was issued spent it.
		if (existing && existing.createdAt.getTime() >= setup.issuedAt) return null;

		// Replaces any earlier key, and gives it a new id, so the browser that
		// held the old one is no longer set up.
		const createdAt = new Date();
		const values = { id: crypto.randomUUID(), publicKey: setup.publicKey, createdAt };
		// The key forgets the phone it replaced; the log doesn't.
		tx.insert(deviceEnrollment)
			.values({ userId: attendee.id, enrolledAt: createdAt, userAgent: setup.userAgent })
			.run();
		return tx
			.insert(deviceKey)
			.values({ ...values, userId: attendee.id })
			.onConflictDoUpdate({ target: deviceKey.userId, set: values })
			.returning({ keyId: deviceKey.id })
			.get();
	});

	if (outcome) pruneExpired();
	return outcome;
}
