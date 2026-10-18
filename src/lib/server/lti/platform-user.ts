import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { user } from '$lib/server/db/schema';

/** What a launch's id_token says about who opened the tool. */
export type Launcher = { id: string; email?: string; givenName?: string; familyName?: string };

/**
 * The person a platform has just vouched for: found by their platform
 * account, created on their first launch, and marked seen either way. Null
 * for someone new the platform shares no email or name for.
 *
 * Apart from the provider, so it can be called without ltijs: the provider
 * only hands it what the launch said (see onResourceLink).
 */
export function platformUser(platformUrl: string, launcher: Launcher) {
	// `sub` is the platform's user ID: permanent, unlike the email, and only
	// unique within one platform, hence the issuer alongside it.
	const ltiSubject = JSON.stringify([platformUrl, launcher.id]);

	// One transaction: two launches racing for a new attendee can't both create
	// them. Finding them is marking them seen.
	return db.transaction((tx) => {
		const existing = tx
			.update(user)
			.set({ lastSeenAt: new Date() })
			.where(eq(user.ltiSubject, ltiSubject))
			.returning({ id: user.id, firstName: user.firstName })
			.get();
		if (existing) return existing;

		// Only there if the tool's privacy settings on the platform share them.
		const email = launcher.email?.trim().toLowerCase();
		const firstName = launcher.givenName?.trim();
		const lastName = launcher.familyName?.trim();
		if (!email || !firstName || !lastName) return null;

		return tx
			.insert(user)
			.values({ id: crypto.randomUUID(), email, firstName, lastName, ltiSubject })
			.returning({ id: user.id, firstName: user.firstName })
			.get();
	});
}
