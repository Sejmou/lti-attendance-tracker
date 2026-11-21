#!/bin/sh
# The app's start in the test environment: made-up data if TESTENV_SEED is
# set and there's no database yet, schema, registration of the test Moodle's
# two tools, then the server. All of it is idempotent, so it runs on every
# start. Runs in the `build` stage image, which still has drizzle-kit and the
# script loader that the production image leaves out.
#
# `app-start.sh dev` (compose.dev.yml) serves the bind-mounted source with
# Vite's dev server instead of the built app.
set -eu

seeded=
if [ -n "${TESTENV_SEED:-}" ] && [ ! -e "$DATABASE_URL" ]; then
	pnpm --silent db:seed-synthetic "$TESTENV_SEED"
	seeded=1
fi

pnpm --silent db:push --force

# Moodle's setup wrote these before compose started the app (its healthcheck).
# Seeded: hand the made-up attendees' histories to the Moodle students.
if [ -n "$seeded" ]; then
	node scripts/run.js scripts/testenv-hand-over.ts /testenv-shared/moodle-users.json
fi

# Where attendees open the attendee tool, unless .env says.
if [ -z "${PUBLIC_ATTENDEE_ACTIVITY_URL:-}" ]; then
	PUBLIC_ATTENDEE_ACTIVITY_URL=$(cat /testenv-shared/attendee-activity-url)
	export PUBLIC_ATTENDEE_ACTIVITY_URL
fi

# Moodle's keyset is fetched over the compose network (`--internal-url`): the
# Moodle container answers to its public hostname there, see compose.yml.
pnpm --silent lti:register-platform \
	--name "Test Moodle" \
	--url "$MOODLE_URL" \
	--internal-url "http://$MOODLE_HOST" \
	--admin-client-id "$ADMIN_CLIENT_ID" \
	--attendee-client-id "$ATTENDEE_CLIENT_ID"

if [ "${1:-}" = dev ]; then
	exec pnpm exec vite dev --host 0.0.0.0 --port 3000 --strictPort
fi
exec node build
