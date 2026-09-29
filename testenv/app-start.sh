#!/bin/sh
# The app's start in the test environment: schema, registration of the test
# Moodle's two tools, then the server. All of it is idempotent, so it runs on
# every start. Runs in the `build` stage image, which still has drizzle-kit and
# the script loader that the production image leaves out.
set -eu

pnpm --silent db:push --force

# Moodle's keyset is fetched over the compose network (`--internal-url`): the
# Moodle container answers to its public hostname there, see compose.yml.
pnpm --silent lti:register-platform \
	--name "Test Moodle" \
	--url "$MOODLE_URL" \
	--internal-url "http://$MOODLE_HOST" \
	--admin-client-id "$ADMIN_CLIENT_ID" \
	--attendee-client-id "$ATTENDEE_CLIENT_ID"

exec node build
