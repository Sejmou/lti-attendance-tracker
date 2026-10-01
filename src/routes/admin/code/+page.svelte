<script lang="ts">
	import { resolve } from '$app/paths';
	import QrCodeIcon from '@lucide/svelte/icons/qr-code';
	import { Badge } from '$lib/components/ui/badge';
	import CalendarSyncStatus from '$lib/components/calendar-sync-status.svelte';
	import { Button } from '$lib/components/ui/button';
	import { m } from '$lib/paraglide/messages';
	import { getLocale } from '$lib/paraglide/runtime';
	import { formatDateTime, wallClock } from '$lib/time';
	import type { PageServerData } from './$types';

	let { data }: { data: PageServerData } = $props();

	type Row = PageServerData['events'][number];

	const suggested = $derived(data.events.find((e) => e.id === data.suggested));
	const others = $derived(data.events.filter((e) => e.id !== data.suggested));

	const day = (at: Date) =>
		formatDateTime(at, getLocale(), { weekday: 'short', day: 'numeric', month: 'short' });
	const time = (at: Date) =>
		formatDateTime(at, getLocale(), { hour: '2-digit', minute: '2-digit' });
	const when = (row: Row) =>
		row.allDay
			? `${day(row.startsAt)} · ${m.events_all_day()}`
			: wallClock(row.startsAt).date === wallClock(row.endsAt).date
				? `${day(row.startsAt)}, ${time(row.startsAt)}–${time(row.endsAt)}`
				: `${day(row.startsAt)}, ${time(row.startsAt)} – ${day(row.endsAt)}, ${time(row.endsAt)}`;
	const running = (row: Row) => row.startsAt <= data.now && data.now < row.endsAt;
	// Button passes href through as is; resolving it is the caller's job.
	const codeFor = (row: Row) => resolve('/admin/events/[id]/code', { id: row.id });
</script>

<svelte:head><title>{m.show_code()}</title></svelte:head>

<main class="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-6">
	<h1 class="text-2xl font-semibold">{m.code_pick_heading()}</h1>
	<CalendarSyncStatus sync={data.sync} />

	{#if !suggested}
		<p class="text-muted-foreground">{m.code_pick_none()}</p>
	{:else}
		<section class="flex flex-col gap-3 border border-border p-5">
			<p class="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
				{m.code_pick_suggested()}
			</p>
			<div>
				<p class="text-xl font-medium">{suggested.title}</p>
				<p class="text-muted-foreground">
					{when(suggested)}{suggested.location ? ` · ${suggested.location}` : ''}
				</p>
				{#if running(suggested)}<Badge class="mt-2">{m.events_ongoing()}</Badge>{/if}
			</div>
			<Button href={codeFor(suggested)} class="self-start">
				<QrCodeIcon />
				{m.code_pick_show()}
			</Button>
		</section>

		{#if others.length > 0}
			<section class="flex flex-col gap-2">
				<h2 class="text-sm font-medium text-muted-foreground">{m.code_pick_others()}</h2>
				<ul class="divide-y divide-border border-y border-border">
					{#each others as row (row.id)}
						<li class="flex flex-wrap items-center justify-between gap-3 py-3">
							<div>
								<p class="font-medium">
									{row.title}
									{#if running(row)}<Badge class="ml-1">{m.events_ongoing()}</Badge>{/if}
								</p>
								<p class="text-sm text-muted-foreground">{when(row)}</p>
							</div>
							<Button href={codeFor(row)} variant="outline" size="sm">
								{m.code_pick_show()}
							</Button>
						</li>
					{/each}
				</ul>
			</section>
		{/if}
	{/if}

	<div class="flex gap-4">
		<a href={resolve('/admin/events')} class="text-blue-600 underline">{m.events_title()}</a>
		<a href={resolve('/admin')} class="text-blue-600 underline">{m.admin_title()}</a>
	</div>
</main>
