import { resolve } from '$app/paths';
import { and, eq, or } from 'drizzle-orm';
import { Provider } from 'ltijs';
import { db } from '$lib/server/db';
import { ltiRegistration, user } from '$lib/server/db/schema';
import { issueAdminLaunch, issueEnrollment } from '$lib/server/scan-token';
import { DrizzleDatabaseManager } from './database-manager';
import { SvelteKitHttpHandler } from './http-handler';

export const httpHandler = new SvelteKitHttpHandler();

/**
 * The LTI 1.3 tools a platform launches: the attendee tool when an attendee opens
 * the attendance activity, the admin tool when an organizer opens theirs. Both
 * are this one provider, told apart by client ID (see `ltiRegistration`).
 * Mounted at /lti-link by `src/routes/lti-link/[...path]`; see "LTI platforms"
 * in the README for the URLs to give the platform.
 *
 * Never `listen()`ed: that would connect a database we already have, start a
 * server we don't want, and install a SIGINT handler that exits the process
 * behind adapter-node's back.
 */
export const provider = new Provider({
	databaseManager: new DrizzleDatabaseManager(),
	httpHandler,
	routes: { loginRoute: '/login', launchRoute: '/launch', keysetRoute: '/keys' }
});

/**
 * The platform has just vouched for who this is. Find them by their platform
 * account, creating them on their first launch, and send them on with that
 * proof in the URL fragment: to the admin pages if they launched the admin
 * tool, to set up this browser if they launched the attendee tool.
 *
 * There is no attendee list and no list of organizers: whoever the platform lets
 * open a tool is let in as what that tool is for. The roles claim is ignored —
 * the tool they opened already says it, in a way every platform agrees on.
 */
provider.onResourceLink(async (context, _request, response) => {
	const enroll = resolve('/lti-link/enroll');
	const { user: launcher, platform } = context.idToken;

	const tool = toolFor(platform.url, platform.clientId);
	if (!tool) return response.redirect(`${enroll}?problem=unknown-tool`);

	// `sub` is the platform's user ID: permanent, unlike the email, and only
	// unique within one platform, hence the issuer alongside it.
	const ltiSubject = JSON.stringify([platform.url, launcher.id]);

	// One transaction: two launches racing for a new attendee can't both create
	// them. Finding them is marking them seen.
	const found = db.transaction((tx) => {
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
	if (!found) return response.redirect(`${enroll}?problem=no-profile`);

	if (tool === 'admin') {
		return response.redirect(`${resolve('/lti-link/admin')}#${issueAdminLaunch(found.id)}`);
	}
	const token = issueEnrollment({ userId: found.id, firstName: found.firstName });
	response.redirect(`${enroll}#${token}`);
});

/**
 * Which of a registered pair `clientId` is. ltijs has already checked the
 * launch against a platform it knows; one that no pair names (registered by
 * an older version of the script, say) is neither.
 */
function toolFor(url: string, clientId: string) {
	const registration = db
		.select({ adminClientId: ltiRegistration.adminClientId })
		.from(ltiRegistration)
		.where(
			and(
				eq(ltiRegistration.url, url),
				or(
					eq(ltiRegistration.adminClientId, clientId),
					eq(ltiRegistration.attendeeClientId, clientId)
				)
			)
		)
		.get();
	if (!registration) return null;
	return registration.adminClientId === clientId ? 'admin' : 'attendee';
}
