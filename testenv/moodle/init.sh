#!/usr/bin/env bash
# Runs before Apache starts, on every start: installs Moodle into an empty
# database, upgrades it after an image rebuild, and (re)applies the test setup.
set -Eeuo pipefail

as_www() { runuser -u www-data -- "$@"; }
cd /var/www/moodle

echo "testenv: waiting for the database..."
until php -r 'exit(@pg_connect("host=db dbname=moodle user=moodle password=" . getenv("MOODLE_DB_PASSWORD")) ? 0 : 1);'; do
	sleep 2
done

installed=$(php -r '
	$c = pg_connect("host=db dbname=moodle user=moodle password=" . getenv("MOODLE_DB_PASSWORD"));
	echo pg_fetch_result(pg_query($c, "select count(*) from information_schema.tables where table_name = '"'"'mdl_config'"'"'"), 0);
')

if [ "$installed" = "0" ]; then
	echo "testenv: installing Moodle (a minute or so)..."
	as_www php admin/cli/install_database.php --agree-license \
		--fullname="Event check-in test Moodle" --shortname="checkin-test" \
		--adminuser=admin --adminpass="$MOODLE_ADMIN_PASSWORD" --adminemail=admin@example.com
else
	as_www php admin/cli/upgrade.php --non-interactive
fi

as_www php admin/cli/testenv_setup.php
as_www php admin/cli/purge_caches.php
echo "testenv: Moodle is ready at $MOODLE_URL"
