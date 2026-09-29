/**
 * Runs a TypeScript entry through Vite's SSR loader so that SvelteKit's
 * `$env/*`, `$app/*` and `$lib/*` aliases resolve exactly as they do in the app.
 * Node can't load those on its own, and SvelteKit ships no script runner.
 *
 *   node scripts/run.js scripts/register-platform.ts --help
 */
import { createServer } from 'vite';

// Drop the entry path so the loaded module sees only its own arguments.
const [entry] = process.argv.splice(2, 1);
if (!entry) throw new Error('usage: node scripts/run.js <entry.ts> [args...]');

const server = await createServer({
	server: { middlewareMode: true },
	appType: 'custom',
	logLevel: 'silent'
});

try {
	await server.ssrLoadModule(entry);
} catch (error) {
	// Usage errors are for the person at the terminal; a Vite SSR stack is not.
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
} finally {
	await server.close();
}
