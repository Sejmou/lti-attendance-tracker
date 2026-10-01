import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, index, unique, primaryKey } from 'drizzle-orm/sqlite-core';
import type { AccessTokenRecord, IdTokenClaims, IdTokenValidation, PlatformKeys } from 'ltijs';
import type { PublicJwk } from '../device-key';

const now = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

/**
 * Everyone who has ever launched one of the tools from an LTI platform, attendee
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
	createdAt: integer('created_at', { mode: 'timestamp_ms' }).default(now).notNull(),
	/**
	 * Their latest launch of either tool, so organizers can spot attendees who
	 * have stopped coming and delete them (see /admin/attendees).
	 */
	lastSeenAt: integer('last_seen_at', { mode: 'timestamp_ms' }).default(now).notNull()
});

/**
 * Something people scan in and out of. Either synced from the public calendar
 * (see calendar-sync) or created by an organizer; the sync only ever touches
 * its own rows.
 *
 * Scans point at `id`, never at the calendar's own IDs, so a resync can't
 * move or lose them. An event with scans is never deleted: one that has
 * disappeared from the calendar is kept, with `removedAt` set.
 */
export const event = sqliteTable(
	'event',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		source: text('source', { enum: ['calendar', 'manual'] }).notNull(),
		/**
		 * The calendar's `UID`, plus the occurrence's original start (its
		 * `RECURRENCE-ID`, in UTC) for one occurrence of a recurring event. Stable
		 * across edits and moves in the calendar. Null for manual events.
		 */
		calendarKey: text('calendar_key').unique(),
		title: text('title').notNull(),
		location: text('location'),
		startsAt: integer('starts_at', { mode: 'timestamp_ms' }).notNull(),
		endsAt: integer('ends_at', { mode: 'timestamp_ms' }).notNull(),
		/** Whole days: `startsAt` and `endsAt` are midnights, `endsAt` exclusive. */
		allDay: integer('all_day', { mode: 'boolean' }).notNull().default(false),
		/** When the sync last found it missing from the calendar. */
		removedAt: integer('removed_at', { mode: 'timestamp_ms' })
	},
	(table) => [index('event_startsAt_idx').on(table.startsAt)]
);

/**
 * One row per scan of a displayed code. An attendee's first scan counts as their
 * scan-in, their last one (if there are two or more) as their scan-out — both
 * are worked out from these rows, never stored. Re-entry is normal, so an attendee
 * may have several; the unique index only collapses a double submit riding the
 * same code scan.
 *
 * The trailing columns exist to make abuse visible after the fact: a code
 * photographed and passed around shows up as scans from addresses that
 * aren't the venue's (as hashes, see ipHash), and one device working through borrowed accounts shows up
 * as one userAgent and one codeScanId across many users.
 *
 * A deleted attendee's scans stay, for the events' statistics, with nothing
 * left that says whose they were: `userId` and the trailing columns are
 * cleared, and `anonymousId` keeps their rows for one event together. See
 * deleteAttendee.
 */
export const scan = sqliteTable(
	'scan',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		// Null once the attendee is deleted; anonymousId stands in for it then.
		userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
		/**
		 * Random, one per deleted attendee and event, so their scan-in, scan-out
		 * and scan count for it survive, while nothing links their scans across
		 * events. Null while the attendee exists.
		 */
		anonymousId: text('anonymous_id'),
		scannedAt: integer('scanned_at', { mode: 'timestamp_ms' }).default(now).notNull(),
		// The event the displayed code was for. No cascade: an event with scans
		// is never deleted (see event), and the database holds that line too.
		eventId: text('event_id')
			.notNull()
			.references(() => event.id),
		// How they proved they were there:
		// - device: a signature from the key their phone got when they opened the
		//           Moodle activity (see deviceKey)
		// - lti:    they opened the Moodle activity and scanned the code inside
		//           the page it opened, within 15 minutes of the launch. The
		//           platform vouched for them; no device was set up.
		// - host:   they are the admin showing the code, and an attendee just scanned
		//           it. Nobody confirmed it was them; the attendee's scan says their
		//           screen is at the door. See hostScan.
		method: text('method', { enum: ['device', 'lti', 'host'] }).notNull(),
		/** Never the address itself: see ipHash. */
		ipHash: text('ip_hash'),
		userAgent: text('user_agent'),
		// Which scan of which displayed code this rode in on. A host row shares
		// the attendee's.
		codeScanId: text('code_scan_id').notNull()
	},
	(table) => [
		index('scan_userId_idx').on(table.userId),
		index('scan_scannedAt_idx').on(table.scannedAt),
		index('scan_eventId_idx').on(table.eventId),
		unique('scan_user_code_scan_unq').on(table.userId, table.codeScanId)
	]
);

/**
 * The public half of the key pair an attendee's browser made when they opened the
 * Moodle activity. The private half never leaves that browser (it is created
 * non-extractable), so a signature from it says "this is the browser that
 * attendee set up".
 *
 * One per attendee: setting up another browser replaces it. A second key would
 * be a second person able to scan for them.
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
