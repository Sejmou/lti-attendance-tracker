<script lang="ts">
	import { onMount, tick, type ComponentProps } from 'svelte';
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
	import MyAttendance from '$lib/components/my-attendance.svelte';
	import QrScanner from '$lib/components/qr-scanner.svelte';
	import ScanConfirmation from '$lib/components/scan-confirmation.svelte';
	import { m } from '$lib/paraglide/messages';
	import type { PageServerData } from './$types';

	let { data }: { data: PageServerData } = $props();

	let token = $state('');
	let firstName = $state('');
	let embedded = $state(false);
	let mounted = $state(false);
	let view = $state<'home' | 'scanning' | 'attendance'>('home');
	let problem = $state('');
	let busy = $state(false);

	let me = $state<{
		keyId: string | null;
		events: ComponentProps<typeof MyAttendance>['events'];
	}>();
	let localKeyId = $state<string>();
	let meForm = $state<HTMLFormElement>();

	let publicKey = $state('');
	let signature = $state('');
	let linking = $state(false);
	let enrollForm = $state<HTMLFormElement>();
	let pendingKey: CryptoKey | undefined;

	// Scanning with this page: the launch that opened it vouches for the
	// attendee, the code for their being at the door.
	let code = $state('');
	let scanForm = $state<HTMLFormElement>();
	let scanned = $state<ComponentProps<typeof ScanConfirmation>['scanned'] | null>(null);

	const link = $derived(
		embedded
			? 'embedded'
			: linking
				? 'linking'
				: !me
					? null
					: me.keyId === null
						? 'none'
						: me.keyId === localKeyId
							? 'linked'
							: 'elsewhere'
	);

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
		localKeyId = (await loadDeviceKey().catch(() => undefined))?.keyId;
		mounted = true;
		if (token) {
			await tick();
			meForm?.requestSubmit();
		}
	});

	const failed = (result: { type: string; data?: Record<string, unknown> }) =>
		(result.type === 'failure' && typeof result.data?.message === 'string'
			? result.data.message
			: null) ?? m.enroll_page_expired();

	const afterMe: SubmitFunction = () => {
		return async ({ result }) => {
			if (result.type !== 'success' || !result.data?.me) {
				problem = failed(result);
				return;
			}
			me = result.data.me as NonNullable<typeof me>;
		};
	};

	async function setUp() {
		linking = true;
		problem = '';
		try {
			const pair = await createKeyPair();
			publicKey = JSON.stringify(await exportPublicKey(pair.publicKey));
			signature = await sign(pair.privateKey, enrollMessage(token));
			pendingKey = pair.privateKey;
		} catch {
			linking = false;
			// crypto.subtle only exists over HTTPS; private windows may refuse storage.
			problem = m.enroll_key_create_failed();
			return;
		}
		await tick();
		enrollForm?.requestSubmit();
	}

	// The key is only kept once the server has stored its public half.
	const saveOnSuccess: SubmitFunction = () => {
		return async ({ result }) => {
			if (result.type === 'success' && typeof result.data?.keyId === 'string' && pendingKey) {
				try {
					await saveDeviceKey({ keyId: result.data.keyId, privateKey: pendingKey });
					localKeyId = result.data.keyId;
					if (me) me.keyId = result.data.keyId;
				} catch {
					problem = m.enroll_key_save_failed();
				}
			} else {
				problem = failed(result);
			}
			pendingKey = undefined;
			linking = false;
		};
	};

	/**
	 * Only the code screen's own code, which points at /scan with the
	 * code in `t`. The origin isn't compared: the server checks the code itself,
	 * and a proxy or tailnet name may make ORIGIN differ from what this page is.
	 */
	function codeFrom(text: string) {
		try {
			const url = new URL(text);
			return url.pathname === resolve('/scan') ? url.searchParams.get('t') : null;
		} catch {
			return null;
		}
	}

	async function codeRead(text: string) {
		if (busy) return;
		const found = codeFrom(text);
		if (!found) {
			problem = m.enroll_scan_not_ours();
			return;
		}
		problem = '';
		busy = true;
		code = found;
		await tick();
		scanForm?.requestSubmit();
	}

	const afterScan: SubmitFunction = () => {
		return async ({ result }) => {
			view = 'home';
			busy = false;
			if (result.type === 'success' && result.data?.scanned) {
				scanned = result.data.scanned as NonNullable<typeof scanned>;
				// So the new scan shows under "My attendance".
				meForm?.requestSubmit();
			} else {
				problem = failed(result);
			}
		};
	};

	const option =
		'flex w-full flex-col items-start gap-1 rounded-lg border border-gray-200 p-4 text-left transition hover:bg-gray-50';
	const primary =
		'w-full rounded-md bg-blue-600 px-4 py-2 text-white transition hover:bg-blue-700 disabled:opacity-50';
	const secondary =
		'w-full rounded-md border border-gray-300 px-4 py-2 transition hover:bg-gray-50 disabled:opacity-50';

	function open(next: typeof view) {
		problem = '';
		scanned = null;
		view = next;
	}
</script>

<svelte:head><title>{m.enroll_title()}</title></svelte:head>

<main class="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 p-6">
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
	{:else if scanned}
		<ScanConfirmation {scanned} />
		<button type="button" onclick={() => open('attendance')} class={secondary}>
			{m.attendance_heading()}
		</button>
	{:else if view === 'scanning'}
		<p class="text-gray-600">{busy ? m.scan_in_progress() : m.enroll_scan_prompt()}</p>
		<QrScanner
			onscan={codeRead}
			onerror={() => {
				view = 'home';
				problem = embedded ? m.enroll_camera_failed_embedded() : m.enroll_camera_failed();
			}}
		/>
		<button type="button" onclick={() => (view = 'home')} disabled={busy} class={secondary}>
			{m.enroll_scan_cancel()}
		</button>
	{:else if view === 'attendance'}
		<button type="button" onclick={() => (view = 'home')} class="self-start text-blue-600">
			← {m.enroll_back()}
		</button>
		{#if me}
			<MyAttendance events={me.events} />
		{:else}
			<p class="text-gray-600">{m.loading()}</p>
		{/if}
	{:else}
		<h1 class="text-2xl font-semibold">
			{firstName ? m.enroll_greeting_name({ name: firstName }) : m.enroll_greeting()}
		</h1>

		<button type="button" onclick={() => open('scanning')} class={option}>
			<span class="text-lg font-semibold">{m.enroll_scan_option()}</span>
			<span class="text-gray-600">{m.enroll_scan_option_text()}</span>
		</button>
		<button type="button" onclick={() => open('attendance')} class={option}>
			<span class="text-lg font-semibold">{m.attendance_heading()}</span>
			{#if me}
				<span class="text-gray-600">{m.attendance_events({ count: me.events.length })}</span>
			{/if}
		</button>

		{#if link === 'linked'}
			<p class="text-sm text-gray-600">✓ {m.enroll_linked()}</p>
		{:else if link}
			<section class="flex flex-col gap-3 rounded-lg border border-gray-200 p-4">
				<h2 class="text-lg font-semibold">{m.enroll_link_heading()}</h2>
				<p class="text-gray-600">{m.enroll_link_text()}</p>
				{#if link === 'embedded'}
					<p class="text-gray-600">{m.enroll_embedded_link()}</p>
					<button
						type="button"
						onclick={() =>
							window.open(`${resolve('/lti-link/enroll')}#${token}`, '_blank', 'noopener')}
						class={primary}
					>
						{m.enroll_continue_new_tab()}
					</button>
				{:else}
					{#if link === 'elsewhere'}
						<p class="text-gray-600">{m.enroll_linked_elsewhere()}</p>
					{/if}
					<button type="button" onclick={setUp} disabled={link === 'linking'} class={primary}>
						{link === 'linking'
							? m.enroll_linking()
							: link === 'elsewhere'
								? m.enroll_link_here()
								: m.enroll_link()}
					</button>
					{#if link === 'elsewhere'}
						<p class="text-sm text-gray-500">{m.enroll_link_here_note()}</p>
					{/if}
				{/if}
			</section>
		{/if}
	{/if}

	<form method="post" action="?/me" hidden bind:this={meForm} use:enhance={afterMe}>
		<input type="hidden" name="token" value={token} />
	</form>
	<form method="post" action="?/enroll" hidden bind:this={enrollForm} use:enhance={saveOnSuccess}>
		<input type="hidden" name="token" value={token} />
		<input type="hidden" name="publicKey" value={publicKey} />
		<input type="hidden" name="signature" value={signature} />
	</form>
	<form method="post" action="?/scan" hidden bind:this={scanForm} use:enhance={afterScan}>
		<input type="hidden" name="token" value={token} />
		<input type="hidden" name="code" value={code} />
	</form>

	<p class="text-sm text-red-600" role="alert">{problem}</p>
</main>
