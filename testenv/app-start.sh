#!/bin/sh
# The app's start in the test environment: made-up data on a fresh database if
# TESTENV_SEED asks for it, schema, registration of the test Moodle's two
# tools, then the server. All of it is idempotent, so it runs on every start. Runs in the `build` stage image, which still has drizzle-kit and
# the script loader that the production image leaves out.
#
# `app-start.sh dev` (compose.dev.yml) serves the bind-mounted source with
# Vite's dev server instead of the built app.
set -eu

# Only into a database that isn't there yet: the seeder writes a new one and
# never adds to one in use. See "Made-up data" in testenv/README.md.
if [ -n "${TESTENV_SEED:-}" ] && [ ! -e "$DATABASE_URL" ]; then
	pnpm --silent db:seed-synthetic "$TESTENV_SEED"
fi

pnpm --silent db:push --force

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
