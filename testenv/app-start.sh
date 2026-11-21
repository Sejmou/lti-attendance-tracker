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

# Hands seeded attendees' histories to the Moodle students, once Moodle has
# said who they are. Its first start installs Moodle, hence the wait.
if [ -n "$seeded" ]; then
	users=/testenv-shared/moodle-users.json
	for _ in $(seq 1 150); do
		[ -e "$users" ] && break
		sleep 2
	done
	if [ -e "$users" ]; then
		node scripts/run.js scripts/testenv-hand-over.ts "$users"
	else
		echo "testenv: Moodle's users never showed up in $users; the students start without history"
	fi
fi

# Where attendees open the attendee tool, as Moodle wrote it, unless .env says.
activity=/testenv-shared/attendee-activity-url
if [ -z "${PUBLIC_ATTENDEE_ACTIVITY_URL:-}" ] && [ -e "$activity" ]; then
	PUBLIC_ATTENDEE_ACTIVITY_URL=$(cat "$activity")
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
