<script lang="ts">
	import { resolve } from '$app/paths';
	import { fly } from 'svelte/transition';
	import QrScreen from '$lib/components/qr-screen.svelte';
	import { eventWhen } from '$lib/event-when';
	import { m } from '$lib/paraglide/messages';
	import { getLocale } from '$lib/paraglide/runtime';
	import { formatDateTime } from '$lib/time';
	import type { PageServerData } from './$types';

	let { data }: { data: PageServerData } = $props();

	type Arrival = PageServerData['recent'][number];

	const TOAST_MS = 6_000;
	// A rush at the door would otherwise stack them down over the code.
	const MAX_TOASTS = 3;
	const SHOW_SCANS_KEY = 'code-screen-show-scans';

	// Names on a big screen aren't always wanted, so the list can be hidden,
	// which leaves the code alone on the screen. Remembered in this browser
	// only, and read once mounted so the server render (which can't know) and
	// the first client render agree.
	let showScans = $state(true);
	$effect(() => {
		try {
			showScans = localStorage.getItem(SHOW_SCANS_KEY) !== 'false';
		} catch {
			// Storage blocked: keep the default.
		}
	});
	function toggleScans() {
		showScans = !showScans;
		try {
			localStorage.setItem(SHOW_SCANS_KEY, String(showScans));
		} catch {
			// Storage blocked: the choice lasts until the page is left.
		}
	}

	/** Arrivals pushed since the page loaded; `data.recent` catches up on each rotation. */
	let live = $state<Arrival[]>([]);
	let toasts = $state<Arrival[]>([]);
	// Each scan brings the count along; it only grows, so the higher of that
	// and the last load is the current one.
	let livePresent = $state(0);
	const present = $derived(Math.max(data.present, livePresent));

	const recent = $derived(
		[...live, ...data.recent]
			.filter((arrival, i, all) => all.findIndex((a) => a.id === arrival.id) === i)
			.sort((a, b) => b.at.getTime() - a.at.getTime())
			.slice(0, 5)
	);

	// Every scan, as it happens, on the screen people are standing in front
	// of. A link used by the wrong person shows a name that isn't theirs.
	$effect(() => {
		const source = new EventSource(resolve('/admin/events/[id]/stream', { id: data.event.id }));
		source.onmessage = (message) => {
			const event = JSON.parse(message.data);
			const arrival: Arrival = { ...event, at: new Date(event.at) };
			livePresent = Math.max(livePresent, event.present);

			live = [arrival, ...live].slice(0, 5);
			// The oldest give way early; their timers then find nothing to remove.
			toasts = [...toasts, arrival].slice(-MAX_TOASTS);
			setTimeout(() => (toasts = toasts.filter((t) => t.id !== arrival.id)), TOAST_MS);
		};
		return () => source.close();
	});

	const time = (at: Date) =>
		formatDateTime(at, getLocale(), { hour: '2-digit', minute: '2-digit' });
</script>

<svelte:head><title>{m.show_code()}</title></svelte:head>

<QrScreen
	title={data.event.title}
	subtitle={eventWhen(data.event)}
	qr={data.qr}
	msUntilNextBucket={data.msUntilNextBucket}
	expanded={!showScans}
	oncollapse={toggleScans}
>
	<p class="text-gray-600">
		{m.qr_present({ count: present })}
		{m.qr_keep_open()}
	</p>

	<section class="w-full text-left">
		<div class="mb-2 flex items-baseline justify-between gap-4">
			<h2 class="text-sm font-medium text-gray-500">{m.qr_last_scans()}</h2>
			<button type="button" class="text-sm text-blue-600 underline" onclick={toggleScans}>
				{m.qr_scans_hide()}
			</button>
		</div>
		{#if recent.length === 0}
			<p class="text-gray-500">{m.qr_nobody_yet()}</p>
		{:else}
			<ol class="divide-y divide-gray-100 rounded-lg border border-gray-200">
				{#each recent as arrival (arrival.id)}
					<li class="flex justify-between gap-4 px-3 py-2">
						<span>{arrival.displayName ?? m.scans_deleted_attendee()}</span>
						<span class="text-gray-500 tabular-nums">
							{arrival.direction === 'in' ? m.qr_in() : m.qr_out()} · {time(arrival.at)}
						</span>
					</li>
				{/each}
			</ol>
		{/if}
	</section>

	<div class="flex flex-wrap justify-center gap-4 lg:justify-start">
		<a href={resolve('/admin/code')} class="text-blue-600 underline">{m.code_other_event()}</a>
		<a href={resolve('/admin')} class="text-blue-600 underline">{m.admin_title()}</a>
		<a href={resolve('/admin/events/[id]', { id: data.event.id })} class="text-blue-600 underline">
			{m.attendance_title()}
		</a>
	</div>
</QrScreen>

<div
	class="pointer-events-none fixed top-4 right-4 left-4 z-20 flex flex-col items-end gap-2"
	aria-live="polite"
>
	{#each toasts as toast (toast.id)}
		<div
			transition:fly={{ x: 80 }}
			class="rounded-lg bg-green-600 px-5 py-3 text-lg text-white shadow-lg"
		>
			✓ {(toast.direction === 'in' ? m.qr_scanned_in : m.qr_scanned_out)({
				name: toast.displayName ?? m.scans_deleted_attendee()
			})}
		</div>
	{/each}
</div>
