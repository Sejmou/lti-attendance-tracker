// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { RowData } from '@tanstack/table-core';

declare module '@tanstack/table-core' {
	// Both parameters must match TanStack's declaration, used or not.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	interface ColumnMeta<TData extends RowData, TValue> {
		/** Classes for the column's head and cells, such as `text-right`. */
		class?: string;
	}
}

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
