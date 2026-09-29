import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, index, unique, primaryKey } from 'drizzle-orm/sqlite-core';
import type { AccessTokenRecord, IdTokenClaims, IdTokenValidation, PlatformKeys } from 'ltijs';
import type { PublicJwk } from '../device-key';

const now = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

/**
 * Everyone who has ever launched one of the tools from an LTI platform, guest
 * or organizer alike. Nobody signs up or has a password: the first launch
 * creates the row, from what the platform shares about them, and every later
 * one finds it by `ltiSubject`. Whether someone is an organizer isn't stored
 * here at all — it is which of the two tools they launched (see ltiRegistration).
 */
export const user = sqliteTable('user', {
	id: text('id').primaryKey(),
	/**
	 * Whatever the platform profile said on the first launch. Not unique and not
	 * an identity: the platform may let people change it, and two platforms may
	 * share one person's address.
	 */
	email: text('email').notNull(),
	firstName: text('first_name').notNull(),
	lastName: text('last_name').notNull(),
	/**
	 * The platform account, `["<iss>","<sub>"]`: the platform's URL and its
	 * permanent user ID, which is only unique within that platform.
	 */
	ltiSubject: text('lti_subject').notNull().unique(),
	createdAt: integer('created_at', { mode: 'timestamp_ms' }).default(now).notNull()
});

/**
 * One row per check-in. Re-entry is normal at an event, so a guest may have
 * several — the unique index only collapses a double submit riding the same
 * scan.
 *
 * The trailing columns exist to make abuse visible after the fact: a code
 * photographed and passed around shows up as check-ins from addresses that
 * aren't the venue's, and one device working through borrowed accounts shows up
 * as one userAgent and one scanId across many users.
 */
export const checkIn = sqliteTable(
	'check_in',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		checkedInAt: integer('checked_in_at', { mode: 'timestamp_ms' }).default(now).notNull(),
		// How they proved they were there:
		// - device:  a signature from the key their phone got when they opened the
		//            Moodle activity (see deviceKey)
		// - passkey: an organizer's passkey. No longer possible; organizers
		//            sign in through the admin tool now, and kept like `link`.
		// - host:    they are the admin showing the check-in code, and a guest just
		//            checked in through it. Nobody confirmed it was them; the guest's
		//            scan says their screen is at the door. See checkInHost.
		// - link:    a ticket from the old /setup?email= link. No longer issued; kept
		//            so rows written before it was removed still type-check.
		method: text('method', { enum: ['device', 'passkey', 'host', 'link'] }).notNull(),
		ipAddress: text('ip_address'),
		userAgent: text('user_agent'),
		// Which scan of which displayed code this rode in on.
		scanId: text('scan_id').notNull()
	},
	(table) => [
		index('check_in_userId_idx').on(table.userId),
		index('check_in_checkedInAt_idx').on(table.checkedInAt),
		unique('check_in_user_scan_unq').on(table.userId, table.scanId)
	]
);

/**
 * The public half of the key pair a guest's browser made when they opened the
 * Moodle activity. The private half never leaves that browser (it is created
 * non-extractable), so a signature from it says "this is the browser that
 * guest set up".
 *
 * One per guest: setting up another browser replaces it. A second key would
 * be a second person able to check them in.
 */
export const deviceKey = sqliteTable('device_key', {
	/** What the browser sends along with a signature, to say which key made it. */
	id: text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	userId: text('user_id')
		.notNull()
		.unique()
		.references(() => user.id, { onDelete: 'cascade' }),
	/** P-256 public key as a JWK: `{ kty, crv, x, y }`. */
	publicKey: text('public_key', { mode: 'json' }).$type<PublicJwk>().notNull(),
	/** Enrollment links issued before this are spent. */
	createdAt: integer('created_at', { mode: 'timestamp_ms' }).default(now).notNull(),
	userAgent: text('user_agent')
});

/**
 * One LTI platform's pair of tools, set up in it identically but for the
 * client ID it assigned each. A launch through `adminClientId` opens the admin
 * pages, one through `attendeeClientId` sets up a phone — so who is an
 * organizer is decided entirely by who the platform lets open the admin tool.
 *
 * Both client IDs are also ltijs platforms of their own (ltiPlatform), since
 * ltijs checks each launch's audience against one. This is what says which is
 * which; a platform ltijs knows that no row here names is turned away.
 */
export const ltiRegistration = sqliteTable(
	'lti_registration',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		/** The platform's issuer, exactly as it sends it in `iss`. */
		url: text('url').notNull(),
		adminClientId: text('admin_client_id').notNull(),
		attendeeClientId: text('attendee_client_id').notNull()
	},
	(table) => [
		unique('lti_registration_admin_unq').on(table.url, table.adminClientId),
		unique('lti_registration_attendee_unq').on(table.url, table.attendeeClientId)
	]
);

// ltijs's own storage (see $lib/server/lti/database-manager). Same database as
// everything else, so it shares the backups, the volume and `db:push`.

export const ltiPlatform = sqliteTable(
	'lti_platform',
	{
		id: text('id').primaryKey(),
		url: text('url').notNull(),
		clientId: text('client_id').notNull(),
		name: text('name').notNull(),
		authenticationEndpoint: text('authentication_endpoint').notNull(),
		accessTokenEndpoint: text('access_token_endpoint').notNull(),
		authorizationServer: text('authorization_server'),
		idTokenValidation: text('id_token_validation', { mode: 'json' })
			.$type<IdTokenValidation>()
			.notNull(),
		active: integer('active', { mode: 'boolean' }).notNull(),
		/** The tool's RSA key pair for this platform, private half included. */
		keys: text('keys', { mode: 'json' }).$type<PlatformKeys>().notNull()
	},
	(table) => [unique('lti_platform_url_client_unq').on(table.url, table.clientId)]
);

export const ltiAccessToken = sqliteTable(
	'lti_access_token',
	{
		platformUrl: text('platform_url').notNull(),
		clientId: text('client_id').notNull(),
		scopes: text('scopes').notNull(),
		token: text('token', { mode: 'json' }).$type<AccessTokenRecord>().notNull()
	},
	(table) => [primaryKey({ columns: [table.platformUrl, table.clientId, table.scopes] })]
);

export const ltiIdToken = sqliteTable(
	'lti_id_token',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		claims: text('claims', { mode: 'json' }).$type<IdTokenClaims>().notNull(),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).default(now).notNull()
	},
	(table) => [index('lti_id_token_createdAt_idx').on(table.createdAt)]
);

export const ltiNonce = sqliteTable('lti_nonce', {
	nonce: text('nonce').primaryKey(),
	createdAt: integer('created_at', { mode: 'timestamp_ms' }).default(now).notNull()
});
