/**
 * Registers an LTI platform's pair of tools, so launches from it are accepted:
 * the admin tool, whose launches open the admin pages, and the attendee tool,
 * whose launches set up a guest's phone. Both are set up in the platform the
 * same way, and each gets a client ID of its own there.
 *
 *   pnpm lti:register-platform --url https://moodle.example.com \
 *     --admin-client-id abc123 --attendee-client-id def456
 *
 * Re-running for a pair already registered does nothing.
 */
import { parseArgs } from 'node:util';
import { and, eq, or } from 'drizzle-orm';
import { IdTokenValidationMethod } from 'ltijs';
import { db } from '../src/lib/server/db';
import { ltiRegistration } from '../src/lib/server/db/schema';
import { provider } from '../src/lib/server/lti/provider';

const USAGE = `Usage: pnpm lti:register-platform --url <platform-url> --admin-client-id <id> --attendee-client-id <id> [--name <name>]

  --url <url>                  Base URL of the platform, e.g. https://moodle.example.com
  --admin-client-id <id>       Client ID the platform shows for the admin tool
  --attendee-client-id <id>    Client ID the platform shows for the attendee tool
  --name <name>                Display name (default: Moodle)`;

const { values } = parseArgs({
	options: {
		url: { type: 'string' },
		'admin-client-id': { type: 'string' },
		'attendee-client-id': { type: 'string' },
		name: { type: 'string', default: 'Moodle' },
		help: { type: 'boolean', short: 'h' }
	}
});

const adminClientId = values['admin-client-id'];
const attendeeClientId = values['attendee-client-id'];

if (values.help) {
	console.log(USAGE);
} else if (!values.url || !adminClientId || !attendeeClientId) {
	throw new Error(`--url, --admin-client-id and --attendee-client-id are required.\n\n${USAGE}`);
} else if (adminClientId === attendeeClientId) {
	throw new Error(
		'The admin and attendee client IDs are the same. They have to be two tools on the platform, or every guest would be an organizer.'
	);
} else {
	// Moodle puts its URL without a trailing slash in `iss`, and ltijs matches it exactly.
	const url = values.url.replace(/\/+$/, '');

	// A client ID already in some other pair — or in this one the other way
	// round — would make one tool mean two things.
	const clashing = db
		.select()
		.from(ltiRegistration)
		.where(
			and(
				eq(ltiRegistration.url, url),
				or(
					...[adminClientId, attendeeClientId].flatMap((id) => [
						eq(ltiRegistration.adminClientId, id),
						eq(ltiRegistration.attendeeClientId, id)
					])
				)
			)
		)
		.all();
	const same = clashing.find(
		(r) => r.adminClientId === adminClientId && r.attendeeClientId === attendeeClientId
	);

	if (same && clashing.length === 1) {
		console.log(`Already registered (id ${same.id}) — nothing to do.`);
	} else if (clashing.length > 0) {
		const pairs = clashing
			.map((r) => `  admin ${r.adminClientId}, attendee ${r.attendeeClientId} (id ${r.id})`)
			.join('\n');
		throw new Error(
			`${url} already has a pair using one of these client IDs:\n${pairs}\nDelete it from lti_registration first if it is being replaced.`
		);
	} else {
		for (const clientId of [adminClientId, attendeeClientId]) {
			// The attendee tool of a site registered before pairs existed is here already.
			if (await provider.platformManager.getPlatformByUrlAndClientId(url, clientId)) continue;
			await provider.platformManager.registerPlatform({
				name: values.name,
				url,
				clientId,
				authenticationEndpoint: `${url}/mod/lti/auth.php`,
				accessTokenEndpoint: `${url}/mod/lti/token.php`,
				idTokenValidation: {
					method: IdTokenValidationMethod.JwkSet,
					key: `${url}/mod/lti/certs.php`
				}
			});
		}
		const row = db
			.insert(ltiRegistration)
			.values({ url, adminClientId, attendeeClientId })
			.returning({ id: ltiRegistration.id })
			.get();
		console.log(`Registered "${values.name}" (id ${row.id}).`);
	}
}
