<?php
// Sets up the test Moodle the way the README tells an organizer to set up a
// real one: a course with the attendance tool's two LTI 1.3 tools, an activity
// for each, and people to launch them as. Safe to run again: it updates what
// is already there, so a changed APP_URL or TESTENV_LOCALE reaches the tools,
// activities and course on the next start.

define('CLI_SCRIPT', true);

require(__DIR__ . '/../../config.php');
require_once($CFG->libdir . '/clilib.php');
require_once($CFG->libdir . '/enrollib.php');
require_once($CFG->dirroot . '/course/lib.php');
require_once($CFG->dirroot . '/course/modlib.php');
require_once($CFG->dirroot . '/user/lib.php');
require_once($CFG->dirroot . '/mod/lti/locallib.php');

\core\session\manager::set_user(get_admin());

// ORIGIN plus BASE_PATH: where the app's /lti-link routes are.
$appurl = rtrim(getenv('APP_URL'), '/');
$password = getenv('TESTENV_USER_PASSWORD');

// What the course, tools and activities are called. Only these names: Moodle's
// own interface stays in the language it was installed with.
$names = [
    'de' => [
        'course' => 'Anwesenheit (Test)',
        'admin_tool' => 'Anwesenheitstool (Admin)',
        'admin_activity' => 'Anwesenheitstool Admin (QR-Code anzeigen)',
        'admin_intro' => 'Zeigt den Anwesenheits-QR-Code und das Scan-Protokoll. Für Studierende verborgen.',
        'attendee_tool' => 'Anwesenheitstool',
        'attendee_activity' => 'Anwesenheits-QR-Code scannen',
        'attendee_intro' => 'Öffne das auf dem Handy, das du zur Veranstaltung mitbringst.',
    ],
    'en' => [
        'course' => 'Attendance (test)',
        'admin_tool' => 'Attendance tool (admin)',
        'admin_activity' => 'Attendance tool admin (show QR code)',
        'admin_intro' => 'Shows the attendance QR code and the scan log. Hidden from students.',
        'attendee_tool' => 'Attendance tool',
        'attendee_activity' => 'Scan attendance QR code',
        'attendee_intro' => 'Open this on the phone you will bring to the event.',
    ],
];
$locale = getenv('TESTENV_LOCALE') ?: 'de';
if (!isset($names[$locale])) {
    cli_error("testenv: TESTENV_LOCALE must be one of " . implode(', ', array_keys($names)) . ", not '{$locale}'");
}
$name = $names[$locale];

// Username => first name, last name, course role.
$people = [
    'organizer' => ['Olga', 'Organizer', 'editingteacher'],
    'student1' => ['Ada', 'Lovelace', 'student'],
    'student2' => ['Grace', 'Hopper', 'student'],
    'student3' => ['Alan', 'Turing', 'student'],
];

$userids = [];
foreach ($people as $username => [$firstname, $lastname]) {
    $user = $DB->get_record('user', ['username' => $username, 'mnethostid' => $CFG->mnet_localhost_id]);
    if ($user) {
        update_internal_user_password($user, $password);
    } else {
        $user = (object) [
            'id' => user_create_user((object) [
                'username' => $username,
                'password' => $password,
                'firstname' => $firstname,
                'lastname' => $lastname,
                'email' => "{$username}@example.com",
                'auth' => 'manual',
                'confirmed' => 1,
                'mnethostid' => $CFG->mnet_localhost_id,
            ]),
        ];
    }
    $userids[$username] = $user->id;
}

// Found by its short name, which is the same in every locale, so switching
// TESTENV_LOCALE renames the course instead of making a second one.
$course = $DB->get_record('course', ['shortname' => 'ATTENDANCE']);
if ($course) {
    $DB->set_field('course', 'fullname', $name['course'], ['id' => $course->id]);
} else {
    $course = create_course((object) [
        'fullname' => $name['course'],
        'shortname' => 'ATTENDANCE',
        'category' => core_course_category::get_default()->id,
        'format' => 'topics',
        'numsections' => 1,
        'visible' => 1,
    ]);
}

$manual = enrol_get_plugin('manual');
$instance = $DB->get_record('enrol', ['courseid' => $course->id, 'enrol' => 'manual'], '*', MUST_EXIST);
foreach ($people as $username => [, , $role]) {
    $roleid = $DB->get_field('role', 'id', ['shortname' => $role], MUST_EXIST);
    $manual->enrol_user($instance, $userids[$username], $roleid);
}

// The two tools, identical but for the client ID Moodle would otherwise make
// up. Fixed here so the app can be registered without reading them back.
$tools = [
    [
        'clientid' => getenv('ADMIN_CLIENT_ID'),
        'name' => $name['admin_tool'],
        'activity' => $name['admin_activity'],
        'intro' => $name['admin_intro'],
        'visible' => 0,
    ],
    [
        'clientid' => getenv('ATTENDEE_CLIENT_ID'),
        'name' => $name['attendee_tool'],
        'activity' => $name['attendee_activity'],
        'intro' => $name['attendee_intro'],
        'visible' => 1,
    ],
];

foreach ($tools as $tool) {
    $config = (object) [
        'lti_typename' => $tool['name'],
        'lti_description' => '',
        'lti_ltiversion' => LTI_VERSION_1P3,
        'lti_clientid' => $tool['clientid'],
        'lti_toolurl' => "{$appurl}/lti-link/launch",
        'lti_initiatelogin' => "{$appurl}/lti-link/login",
        'lti_redirectionuris' => "{$appurl}/lti-link/launch",
        'lti_keytype' => LTI_JWK_KEYSET,
        'lti_publickeyset' => "{$appurl}/lti-link/keys",
        'lti_customparameters' => '',
        'lti_coursevisible' => LTI_COURSEVISIBLE_ACTIVITYCHOOSER,
        'lti_launchcontainer' => LTI_LAUNCH_CONTAINER_WINDOW,
        // The privacy settings the README asks for: people are created from these.
        'lti_sendname' => LTI_SETTING_ALWAYS,
        'lti_sendemailaddr' => LTI_SETTING_ALWAYS,
        'lti_acceptgrades' => LTI_SETTING_NEVER,
        'lti_contentitem' => 0,
        'lti_forcessl' => 0,
        'lti_organizationid_default' => LTI_DEFAULT_ORGID_SITEID,
    ];

    $typeid = $DB->get_field('lti_types', 'id', ['clientid' => $tool['clientid']]);
    if ($typeid) {
        lti_update_type((object) ['id' => $typeid], $config);
    } else {
        $typeid = lti_add_type(
            (object) ['state' => LTI_TOOL_STATE_CONFIGURED, 'course' => $course->id],
            $config
        );
    }

    $existing = $DB->get_record('lti', ['course' => $course->id, 'typeid' => $typeid]);
    if ($existing) {
        $DB->update_record('lti', (object) [
            'id' => $existing->id,
            'name' => $tool['activity'],
            'intro' => $tool['intro'],
        ]);
    } else {
        create_module((object) [
            'modulename' => 'lti',
            'course' => $course->id,
            'section' => 1,
            'visible' => $tool['visible'],
            'name' => $tool['activity'],
            'introeditor' => ['text' => $tool['intro'], 'format' => FORMAT_HTML, 'itemid' => 0],
            'typeid' => $typeid,
            'toolurl' => '',
            'securetoolurl' => '',
            'launchcontainer' => LTI_LAUNCH_CONTAINER_DEFAULT,
            'instructorchoicesendname' => LTI_SETTING_ALWAYS,
            'instructorchoicesendemailaddr' => LTI_SETTING_ALWAYS,
            'instructorchoiceacceptgrades' => LTI_SETTING_NEVER,
            'instructorcustomparameters' => '',
            'showtitlelaunch' => 1,
            'showdescriptionlaunch' => 0,
            'icon' => '',
            'secureicon' => '',
            'grade' => 0,
        ]);
    }
}

rebuild_course_cache($course->id, true);

cli_writeln("testenv: course ATTENDANCE ready at {$CFG->wwwroot}/course/view.php?id={$course->id}");
