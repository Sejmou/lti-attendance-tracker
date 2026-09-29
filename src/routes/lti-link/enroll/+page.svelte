<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import type { SubmitFunction } from '@sveltejs/kit';
	import {
		createKeyPair,
		enrollMessage,
		exportPublicKey,
		loadDeviceKey,
		saveDeviceKey,
		sign
	} from '$lib/device-key';
	import { m } from '$lib/paraglide/messages';
	import type { ActionData, PageServerData } from './$types';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	let token = $state('');
	let firstName = $state('');
	let embedded = $state(false);
	let alreadySetUp = $state(false);
	let mounted = $state(false);

	let publicKey = $state('');
	let signature = $state('');
	let busy = $state(false);
	let done = $state(false);
	let problem = $state('');

	let enrollForm = $state<HTMLFormElement>();
	let pendingKey: CryptoKey | undefined;

	onMount(async () => {
		// The launch hands the token over in the fragment, which no server sees.
		// Out of the address bar straight away, so it isn't bookmarked or shared.
		token = location.hash.slice(1);
		if (token) history.replaceState(history.state, '', location.pathname + location.search);
		try {
			firstName = JSON.parse(
				atob(token.split('.')[0].replaceAll('-', '+').replaceAll('_', '/'))
			).firstName;
		} catch {
			// Only a greeting.
		}

		// Inside Moodle's frame, storage belongs to Moodle's site as much as ours:
		// a key saved here would be invisible to the tab a QR scan opens.
		embedded = window.self !== window.top;
		alreadySetUp = Boolean(await loadDeviceKey().catch(() => undefined));
		mounted = true;
	});

	async function setUp() {
		busy = true;
		problem = '';
		try {
			const pair = await createKeyPair();
			publicKey = JSON.stringify(await exportPublicKey(pair.publicKey));
			signature = await sign(pair.privateKey, enrollMessage(token));
			pendingKey = pair.privateKey;
		} catch {
			busy = false;
			// crypto.subtle only exists over HTTPS; private windows may refuse storage.
			problem = m.enroll_key_create_failed();
			return;
		}
		await tick();
		enrollForm?.requestSubmit();
	}

	// The key is only kept once the server has stored its public half.
	const saveOnSuccess: SubmitFunction = () => {
		return async ({ result, update }) => {
			if (result.type === 'success' && typeof result.data?.keyId === 'string' && pendingKey) {
				try {
					await saveDeviceKey({ keyId: result.data.keyId, privateKey: pendingKey });
					done = true;
				} catch {
					problem = m.enroll_key_save_failed();
				}
			}
			pendingKey = undefined;
			busy = false;
			await update();
		};
	};
</script>

<svelte:head><title>{m.enroll_title()}</title></svelte:head>

<main class="mx-auto flex min-h-svh max-w-sm flex-col justify-center gap-6 p-6">
	{#if data.problem}
		<h1 class="text-2xl font-semibold">{m.enroll_problem_heading()}</h1>
		<p class="text-gray-600">{data.problem}</p>
	{:else if !mounted}
		<p class="text-gray-600">{m.loading()}</p>
	{:else if !token}
		<h1 class="text-2xl font-semibold">{m.enroll_open_from_moodle_heading()}</h1>
		<p class="text-gray-600">
			{m.enroll_open_from_moodle_text()}
		</p>
	{:else if done}
		<h1 class="text-2xl font-semibold">{m.enroll_done_heading()}</h1>
		<p class="text-gray-600">
			{m.enroll_done_text()}
		</p>
		<p class="text-sm text-gray-500">
			{m.enroll_done_note()}
		</p>
	{:else if embedded}
		<h1 class="text-2xl font-semibold">
			{firstName ? m.enroll_greeting_name({ name: firstName }) : m.enroll_greeting()}
		</h1>
		<p class="text-gray-600">
			{m.enroll_embedded_text()}
		</p>
		<button
			type="button"
			onclick={() => window.open(`${resolve('/lti-link/enroll')}#${token}`, '_blank', 'noopener')}
			class="w-full rounded-md bg-blue-600 px-4 py-2 text-white transition hover:bg-blue-700"
		>
			{m.enroll_continue_new_tab()}
		</button>
	{:else}
		<h1 class="text-2xl font-semibold">
			{firstName ? m.enroll_greeting_name({ name: firstName }) : m.enroll_greeting()}
		</h1>
		<p class="text-gray-600">
			<strong>{m.enroll_intro_phone()}</strong>
			{m.enroll_intro_browser()}
		</p>
		{#if alreadySetUp}
			<p class="text-sm text-gray-500">
				{m.enroll_already_set_up()}
			</p>
		{/if}
		<button
			type="button"
			onclick={setUp}
			disabled={busy}
			class="w-full rounded-md bg-blue-600 px-4 py-2 text-white transition hover:bg-blue-700 disabled:opacity-50"
		>
			{busy ? m.enroll_setting_up() : m.enroll_set_up()}
		</button>

		<form method="post" action="?/enroll" hidden bind:this={enrollForm} use:enhance={saveOnSuccess}>
			<input type="hidden" name="token" value={token} />
			<input type="hidden" name="publicKey" value={publicKey} />
			<input type="hidden" name="signature" value={signature} />
		</form>
	{/if}

	<p class="text-sm text-red-600" role="alert">
		{problem || (form && 'message' in form ? form.message : '')}
	</p>
</main>
