<?php
// Test environment only: everything comes from the container's environment.
unset($CFG);
global $CFG;
$CFG = new stdClass();

$CFG->dbtype = 'pgsql';
$CFG->dblibrary = 'native';
$CFG->dbhost = 'db';
$CFG->dbname = 'moodle';
$CFG->dbuser = 'moodle';
$CFG->dbpass = getenv('MOODLE_DB_PASSWORD');
$CFG->prefix = 'mdl_';
$CFG->dboptions = ['dbport' => 5432];

$CFG->wwwroot = rtrim(getenv('MOODLE_URL'), '/');
$CFG->dataroot = '/var/www/moodledata';
$CFG->admin = 'admin';
$CFG->directorypermissions = 02777;

// TLS ends at the reverse proxy in front; Moodle itself only ever sees http.
// The proxy has to pass the Host header through unchanged, and nothing else
// is needed: the app reaches this container under the same hostname (see
// compose.yml), so Moodle's wwwroot check passes for it too.
$CFG->sslproxy = str_starts_with($CFG->wwwroot, 'https://');

// Nobody here has a real mailbox.
$CFG->noemailever = true;

require_once(__DIR__ . '/lib/setup.php');
