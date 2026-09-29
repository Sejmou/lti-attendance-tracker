<?php
// Sets up the test Moodle the way the README tells an organizer to set up a
// real one: a course with the check-in app's two LTI 1.3 tools, an activity
// for each, and people to launch them as. Safe to run again: it updates what
// is already there, so a changed APP_URL reaches the tools on the next start.

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

$course = $DB->get_record('course', ['shortname' => 'CHECKIN']);
if (!$course) {
    $course = create_course((object) [
        'fullname' => 'Event check-in (test)',
        'shortname' => 'CHECKIN',
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
        'name' => 'Event check-in (organizers)',
        'activity' => 'Event check-in: organizer screen',
        'intro' => 'Opens the check-in screen and log. Hidden from students.',
        'visible' => 0,
    ],
    [
        'clientid' => getenv('ATTENDEE_CLIENT_ID'),
        'name' => 'Event check-in',
        'activity' => 'Event check-in: set up your phone',
        'intro' => 'Open this on the phone you will bring to the event.',
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

    if (!$DB->record_exists('lti', ['course' => $course->id, 'typeid' => $typeid])) {
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

cli_writeln("testenv: course CHECKIN ready at {$CFG->wwwroot}/course/view.php?id={$course->id}");
