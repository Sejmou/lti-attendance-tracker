// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface Locals {
			/** Signed in by launching the admin tool; see hooks.server.ts. */
			admin?: { id: string; email: string; firstName: string; lastName: string };
		}

		// interface Error {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
