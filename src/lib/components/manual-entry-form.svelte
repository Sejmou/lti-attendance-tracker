<script lang="ts">
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import { m } from '$lib/paraglide/messages';

	/**
	 * The last resort on the scan page: who they are, typed in. Hidden behind a
	 * link, so nobody takes it for the normal way in.
	 *
	 * Sends the device key's signature along when the browser has one, so the
	 * log can say whose phone it was typed in on.
	 */
	let { keyId, signature }: { keyId: string; signature: string } = $props();

	let open = $state(false);
	let details = $state({ email: '', firstName: '', lastName: '' });

	// Remembered on this phone only, so scanning out isn't typing it all again.
	const STORAGE_KEY = 'manual-entry-details';

	onMount(() => {
		try {
			const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
			if (saved) details = { ...details, ...saved };
		} catch {
			// Nothing remembered, or storage is off: they type it in.
		}
	});

	function remember() {
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(details));
		} catch {
			// Only a convenience.
		}
	}
</script>

{#if !open}
	<button
		type="button"
		class="text-left text-sm text-gray-600 underline"
		onclick={() => (open = true)}
	>
		{m.scan_manual_hint()}
	</button>
{:else}
	<section class="flex flex-col gap-4">
		<h2 class="text-lg font-semibold">{m.scan_manual_heading()}</h2>
		<p class="text-gray-600">{m.scan_manual_text()}</p>
		<form method="post" action="?/manualEntry" use:enhance onsubmit={remember}>
			<input type="hidden" name="keyId" value={keyId} />
			<input type="hidden" name="signature" value={signature} />
			<Field.Group>
				<Field.Field>
					<Field.Label for="manual-email">{m.scan_manual_email()}</Field.Label>
					<Input
						id="manual-email"
						name="email"
						type="email"
						autocomplete="email"
						required
						bind:value={details.email}
					/>
				</Field.Field>
				<Field.Field>
					<Field.Label for="manual-first-name">{m.scan_manual_first_name()}</Field.Label>
					<Input
						id="manual-first-name"
						name="firstName"
						autocomplete="given-name"
						required
						bind:value={details.firstName}
					/>
				</Field.Field>
				<Field.Field>
					<Field.Label for="manual-last-name">{m.scan_manual_last_name()}</Field.Label>
					<Input
						id="manual-last-name"
						name="lastName"
						autocomplete="family-name"
						required
						bind:value={details.lastName}
					/>
				</Field.Field>
				<Button type="submit">{m.scan_manual_submit()}</Button>
			</Field.Group>
		</form>
	</section>
{/if}
