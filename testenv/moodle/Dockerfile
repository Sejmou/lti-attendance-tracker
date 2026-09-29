# Moodle for the test environment: the release TUWEL runs (5.2, matched by its
# admin/environment.xml), on the PHP image Moodle HQ maintains for development.
FROM docker.io/moodlehq/moodle-php-apache:8.3

# stableNNN on download.moodle.org: 502 is the latest 5.2.x build.
ARG MOODLE_BRANCH=502
RUN mkdir -p /var/www/moodle /var/www/moodledata \
	&& curl -fsSL "https://download.moodle.org/download.php/direct/stable${MOODLE_BRANCH}/moodle-latest-${MOODLE_BRANCH}.tgz" \
		| tar -xz -C /var/www/moodle --strip-components=1 \
	&& chown www-data:www-data /var/www/moodledata

# Since 5.1 only public/ is served; config.php and the CLI scripts sit above it.
ENV APACHE_DOCUMENT_ROOT=/var/www/moodle/public
COPY router.conf /etc/apache2/conf-enabled/moodle-router.conf
COPY config.php /var/www/moodle/config.php
COPY testenv_setup.php /var/www/moodle/admin/cli/testenv_setup.php
COPY --chmod=755 init.sh /docker-entrypoint.d/50-testenv-init.sh
