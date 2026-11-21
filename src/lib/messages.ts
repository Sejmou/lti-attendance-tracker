import { env } from '$env/dynamic/public';
import { m as messages } from '$lib/paraglide/messages';

/**
 * The UI's messages, with "Moodle" replaced by what the platform is called
 * where the app runs (PUBLIC_LMS_NAME, e.g. "TUWEL"). The texts only ever use
 * the name as it is, never inflected, so a plain replacement fits every
 * language. Import `m` from here, not from paraglide.
 */
export const m = Object.fromEntries(
	Object.entries(messages).map(([key, message]) => [
		key,
		(...args: unknown[]) => {
			const text = (message as (...args: unknown[]) => string)(...args);
			const name = env.PUBLIC_LMS_NAME;
			return name ? text.replaceAll('Moodle', name) : text;
		}
	])
) as typeof messages;
