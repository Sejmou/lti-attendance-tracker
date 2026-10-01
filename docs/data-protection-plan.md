# Data protection plan

What has to change for the app to do what its privacy notice says
([Datenschutzerklärung](datenschutzerklaerung.md), [English](privacy-notice.md)). The notice describes the app **after** these steps, so it must not be published
before they are done.

Context: the app is used by one Austrian Verein, in one Moodle course that only active
members can open. Attendance is not special-category data (Art. 9 GDPR) for this Verein.

## Decisions already made

- **Members leave, their attendance stays, anonymised.** Deleting a member removes
  everything that identifies them; their scans are kept for per-event statistics, under
  a random ID per event, so nothing links them across events. Scan times stay exact.
- **Anti-cheat data is kept for 12 months, or until membership ends.** IP addresses are
  stored only as an HMAC, user agents in full.
- **The HMAC key is derived from `SIGNING_SECRET`**, domain-separated by a prefix, the
  way the tokens already are. No new environment variable.
- **Email stays.** Organizers need it to tell apart two members with the same name.
- **The code screen shows the shortest unique name**, never the full name.
- **Unchanged:** ltijs's `lti_id_token` claims (24 hours), host scans, ignoring the
  course (one course, one Verein).

## Steps

### 1. Members page, `last_seen_at` and deletion with anonymisation

Schema:

- `user.last_seen_at`: set on every launch, in the transaction in
  `src/lib/server/lti/provider.ts` that finds or creates the user.
- `scan.user_id` becomes nullable (foreign key and cascade kept).
- `scan.anonymous_id`: null for current members' scans; for a deleted member's, a
  random ID, one per member and event.

`/admin/members`: every member with name, email, first launch, last launch, number of
scans and whether a phone is linked, sortable by last launch so members who have left
are easy to spot. **Delete** asks for confirmation, then in one transaction:

1. for each event the member has scans for, generates one random `anonymous_id` and sets
   it on all their scans for that event (so scan-in, scan-out and scan count survive)
2. on those scans, sets `user_id`, `ip_hash` and `user_agent` to null and replaces
   `code_scan_id` with a random value, so nothing matches it to a host scan
3. deletes the `user` row; `device_key` and `device_enrollment` cascade

Everywhere scans are counted or grouped by person, `user_id` becomes
`coalesce(user_id, anonymous_id)`, and inner joins to `user` become left joins, shown as
"Ehemaliges Mitglied":

- `src/lib/server/attendance.ts` (grouping and join)
- `src/lib/server/scan.ts` (the live count)
- `src/routes/admin/events/[id]/+page.server.ts` (log join)
- `src/routes/admin/events/[id]/code/+page.server.ts` (count, recent arrivals)

Queries about one specific current member (`scan.ts`, `scan-host.ts`,
`attendance.ts`'s `direction`) stay as they are.

### 2. Hash IP addresses

- `scan.ip_address` becomes `scan.ip_hash`: `HMAC(key, ip)` with
  `key = HMAC(SIGNING_SECRET, "ip-hash:" + eventId)`. A key per event: the `shared`
  flag only compares within an event, and nobody can link addresses across events.
- `src/lib/server/scan-log.ts` works unchanged on the hash; the event page shows a short
  prefix of it instead of the address.
- Rotating `SIGNING_SECRET` during an event means `shared` can't match scans from before
  and after. Note it in the README's environment table.

### 3. Enrollment log

New table, `device_key.user_agent` dropped:

```ts
export const deviceEnrollment = sqliteTable(
	'device_enrollment',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		enrolledAt: integer('enrolled_at', { mode: 'timestamp_ms' }).default(now).notNull(),
		userAgent: text('user_agent')
	},
	(table) => [
		index('device_enrollment_userId_idx').on(table.userId),
		index('device_enrollment_enrolledAt_idx').on(table.enrolledAt)
	]
);
```

The `enroll` action in `src/routes/lti-link/enroll/+page.server.ts` inserts a row in
the same transaction that upserts `device_key`. No IP: phones are mostly set up at home.
Nothing runs in production yet, so no data migration, just `pnpm db:push`. The members
page (step 1) shows each member's enrollments.

### 4. 12-month cleanup

- `scan.ip_hash` and `scan.user_agent` set to null on scans older than 12 months; the
  scans themselves stay.
- `device_enrollment` rows older than 12 months deleted.

There is no timer, so following `DrizzleDatabaseManager`'s pattern this runs whenever a
scan or an enrollment is written, and also on loading an admin page, so nothing outlives
the limit through a quiet season.

### 5. Shortest unique names on the code screen

Among all members (`user` rows), grouped by first name, case-insensitively:

- alone in their group: first name only
- otherwise: the shortest prefix of the last name nobody else in the group shares,
  followed by a dot; the whole last name, without a dot, if every prefix is shared

| Members                                         | Shown as                                     |
| ----------------------------------------------- | -------------------------------------------- |
| Anna Aichinger, Anna Bloberger                  | Anna A., Anna B.                             |
| Thomas Schilling, Thomas Schirrer, Thomas Bauer | Thomas Schil., Thomas Schir., Thomas B.      |
| Thomas Schill, Thomas Schiller                  | Thomas Schill, Thomas Schille.               |
| Lukas Müller, Lukas Müller                      | both Lukas Müller (organizers use the email) |

Worked out when a scan is published, so it follows members joining and leaving.
`FeedScan` in `src/lib/server/scan-feed.ts` carries `displayName` instead of
`firstName` and `lastName`, so the full name never reaches the screen's browser.
The admin event page keeps full names and email. A unit-tested pure function.

### 6. Backup rotation

Decide how long backups are kept, delete older ones (`scripts/backup.js` or a cron
job), and document it in the README. Deleted members stay in backups until then, which
the notice says.

### 7. Publish the Datenschutzerklärung

Once steps 1 to 6 are done: fill in the placeholders (Verein, ZVR number, contact,
legal basis, hosting provider, backup period) in both versions, serve them as pages, and link them from
the enroll page, the admin pages and the footer next to the source code link.

### 8. Record of processing (Art. 30)

An entry in the Verein's record of processing: purposes, data, recipients and deletion
periods, as in the notice.

### 9. README

Update the schema notes (`scan` columns, `device_enrollment`, `anonymous_id`,
`last_seen_at`), "What stops abuse", "Things that undo it", and add a section on
deletion, anonymisation and retention.

## Tests

- anonymisation: counts, scan-in and scan-out of past events unchanged after deleting
  a member; no remaining reference to them; different `anonymous_id`s across events
- `shared` still flags two members on one address, from the hash
- an enrollment writes a log row; cleanup removes old ones and nulls old scan columns
- the display name function, with the cases in the table above

## Open

- Legal basis for attendance tracking: does the Verein's statute make attendance part of
  membership (Art. 6(1)(b)), or is it legitimate interest (Art. 6(1)(f))?
- Anonymise every scan after a fixed period too, not just on leaving?
- Backup retention period and hosting provider, for the notice.
