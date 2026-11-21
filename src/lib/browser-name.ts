/**
 * What people call the browser a user agent belongs to, or null if it is none
 * of the common ones (an app's built-in browser, say). Order matters: nearly
 * every user agent claims Safari, and Chromium-based ones claim Chrome too.
 */
export function browserName(userAgent: string) {
	if (/SamsungBrowser\//.test(userAgent)) return 'Samsung Internet';
	if (/EdgiOS\/|EdgA?\//.test(userAgent)) return 'Edge';
	if (/FxiOS\/|Firefox\//.test(userAgent)) return 'Firefox';
	if (/OPiOS\/|OPR\//.test(userAgent)) return 'Opera';
	if (/CriOS\/|Chrome\//.test(userAgent)) return 'Chrome';
	if (/Version\/[\d.]+.*Safari\//.test(userAgent)) return 'Safari';
	return null;
}
