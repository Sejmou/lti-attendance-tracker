import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { deviceEnrollment, deviceKey, user } from '$lib/server/db/schema';
import type { PublicJwk } from '$lib/server/device-key';
import { pruneExpired } from '$lib/server/retention';

/**
 * Stores and logs a browser's new key. The caller must already have checked
 * the setup link and the browser's proof of the key (see the enroll action).
 * Null if the link is spent (a key was set up since `issuedAt`) or the
 * attendee is gone.
 */
export function enrollDevice(setup: {
	userId: string;
	issuedAt: number;
	publicKey: PublicJwk;
	userAgent: string | null;
}) {
	const outcome = db.transaction((tx) => {
		const attendee = tx.select({ id: user.id }).from(user).where(eq(user.id, setup.userId)).get();
		if (!attendee) return null;

		const existing = tx
			.select({ createdAt: deviceKey.createdAt })
			.from(deviceKey)
			.where(eq(deviceKey.userId, attendee.id))
			.get();
		if (existing && existing.createdAt.getTime() >= setup.issuedAt) return null;

		// Replaces any earlier key, and gives it a new id, so the browser that
		// held the old one is no longer set up.
		const createdAt = new Date();
		const values = { id: crypto.randomUUID(), publicKey: setup.publicKey, createdAt };
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
