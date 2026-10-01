/**
 * The first part of a user agent's platform, e.g. "iPhone" or "Linux", to scan
 * a table by. Whoever wants the full string gets it as a title attribute.
 */
export const deviceName = (userAgent: string | null) =>
	userAgent
		?.match(/\((.*?)\)/)?.[1]
		?.split(';')[0]
		?.trim() ??
	userAgent?.slice(0, 24) ??
	'—';
