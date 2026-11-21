import { expect, test, vi } from 'vitest';
import { m as untouched } from '$lib/paraglide/messages';
import { m } from './messages';

// $env/dynamic/public is what Vite loaded, so the test sets it here.
const env = vi.hoisted(() => ({}) as Record<string, string | undefined>);
vi.mock('$env/dynamic/public', () => ({ env }));

test('Moodle is called what PUBLIC_LMS_NAME says, and left as it is without it', () => {
	expect(m.enroll_open_from_moodle_heading()).toBe(untouched.enroll_open_from_moodle_heading());

	env.PUBLIC_LMS_NAME = 'TUWEL';
	expect(m.enroll_open_from_moodle_heading()).toBe(
		untouched.enroll_open_from_moodle_heading().replaceAll('Moodle', 'TUWEL')
	);
	expect(m.enroll_open_from_moodle_heading()).not.toContain('Moodle');
	// Messages with inputs still get them.
	expect(m.enroll_greeting_name({ name: 'Ada' })).toBe(
		untouched.enroll_greeting_name({ name: 'Ada' })
	);
});
