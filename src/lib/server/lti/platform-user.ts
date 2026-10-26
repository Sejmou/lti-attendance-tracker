import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { user } from '$lib/server/db/schema';

/** What a launch's id_token says about who opened the tool. */
export type Launcher = { id: string; email?: string; givenName?: string; familyName?: string };

/**
 * Finds the launcher by their platform account, or creates them on their
 * first launch, and marks them seen. Null for someone new the platform
 * shares no email or name for.
 */
export function platformUser(platformUrl: string, launcher: Launcher) {
	// `sub` is the platform's user ID: permanent, unlike the email, and only
	// unique within one platform, hence the issuer alongside it.
	const ltiSubject = JSON.stringify([platformUrl, launcher.id]);

	// Finding them is marking them seen.
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
