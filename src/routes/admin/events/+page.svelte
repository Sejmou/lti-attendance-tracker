<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Table from '$lib/components/ui/table';
	import type { EventFields } from '$lib/event-form';
	import { m } from '$lib/paraglide/messages';
	import { getLocale } from '$lib/paraglide/runtime';
	import { formatDateTime, wallClock } from '$lib/time';
	import EventDialog from './event-dialog.svelte';
	import type { ActionData, PageServerData } from './$types';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	type Row = PageServerData['events'][number];

	let editorOpen = $state(false);
	let editingId = $state<string | null>(null);
	let fields = $state<EventFields>(blank());

	let deleting = $state<Row | null>(null);
	let syncing = $state(false);

	/** Today, from the next full hour for an hour: something to adjust, not to fill in. */
	function blank(): EventFields {
		const hour = 60 * 60_000;
		const start = wallClock(new Date(Math.ceil(Date.now() / hour) * hour));
		const end = wallClock(new Date(Math.ceil(Date.now() / hour) * hour + hour));
		return {
			title: '',
			location: '',
			startDate: start.date,
			startTime: start.time,
			endDate: end.date,
			endTime: end.time
		};
	}

	function create() {
		editingId = null;
		fields = blank();
		editorOpen = true;
	}

	function edit(row: Row) {
		const start = wallClock(row.startsAt);
		const end = wallClock(row.endsAt);
		editingId = row.id;
		fields = {
			title: row.title,
			location: row.location ?? '',
			startDate: start.date,
			startTime: start.time,
			endDate: end.date,
			endTime: end.time
		};
		editorOpen = true;
	}

	const day = (at: Date) =>
		formatDateTime(at, getLocale(), { weekday: 'short', day: 'numeric', month: 'short' });
	const time = (at: Date) =>
		formatDateTime(at, getLocale(), { hour: '2-digit', minute: '2-digit' });

	function when(row: Row) {
		if (row.allDay) {
			// The end of a whole-day event is the midnight after it.
			const last = new Date(row.endsAt.getTime() - 1);
			const days =
				wallClock(last).date === wallClock(row.startsAt).date
					? day(row.startsAt)
					: `${day(row.startsAt)} – ${day(last)}`;
			return `${days} · ${m.events_all_day()}`;
		}
		return wallClock(row.startsAt).date === wallClock(row.endsAt).date
			? `${day(row.startsAt)}, ${time(row.startsAt)}–${time(row.endsAt)}`
			: `${day(row.startsAt)}, ${time(row.startsAt)} – ${day(row.endsAt)}, ${time(row.endsAt)}`;
	}

	const ongoing = (row: Row) => row.startsAt <= data.now && data.now < row.endsAt;
	const past = (row: Row) => row.endsAt <= data.now;

	const syncMessage = $derived.by(() => {
		if (form && 'syncFailed' in form) return m.events_sync_failed();
		if (form && 'synced' in form && form.synced) return m.events_sync_result(form.synced);
		return null;
	});
</script>

<svelte:head><title>{m.events_title()}</title></svelte:head>

<main class="mx-auto flex min-h-svh max-w-5xl flex-col gap-6 p-6">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<h1 class="text-2xl font-semibold">{m.events_title()}</h1>
		<div class="flex flex-wrap gap-2">
			{#if data.calendar}
				<form
					method="post"
					action="?/sync"
					use:enhance={() => {
						syncing = true;
						return async ({ update }) => {
							await update();
							syncing = false;
						};
					}}
				>
					<Button type="submit" variant="outline" disabled={syncing}>
						<RefreshCwIcon class={[syncing && 'animate-spin']} />
						{m.events_sync()}
					</Button>
				</form>
			{/if}
			<Button onclick={create}>
				<PlusIcon />
				{m.events_new()}
			</Button>
		</div>
	</div>

	<p class="text-sm text-muted-foreground">
		{#if !data.calendar}
			{m.events_no_calendar()}
		{:else if data.calendar.lastSync}
			{m.events_last_sync({
				when: formatDateTime(new Date(data.calendar.lastSync.at), getLocale(), {
					dateStyle: 'medium',
					timeStyle: 'short'
				})
			})}
		{:else}
			{m.events_never_synced()}
		{/if}
		{#if syncMessage}
			<span class="block" role="status">{syncMessage}</span>
		{/if}
		{#if form && 'hasScans' in form}
			<span class="block text-destructive" role="alert">{m.events_delete_blocked()}</span>
		{:else if form && 'missing' in form}
			<span class="block text-destructive" role="alert">{m.events_missing()}</span>
		{/if}
	</p>

	{#if data.events.length === 0}
		<p class="text-muted-foreground">{m.events_none()}</p>
	{:else}
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head>{m.events_col_when()}</Table.Head>
					<Table.Head>{m.events_col_title()}</Table.Head>
					<Table.Head>{m.events_col_location()}</Table.Head>
					<Table.Head class="text-right">{m.events_col_scans()}</Table.Head>
					<Table.Head><span class="sr-only">{m.events_col_actions()}</span></Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each data.events as row (row.id)}
					<Table.Row class={[past(row) && 'text-muted-foreground']}>
						<Table.Cell class="whitespace-nowrap">{when(row)}</Table.Cell>
						<Table.Cell class="whitespace-normal">
							<span class="font-medium">{row.title}</span>
							<span class="mt-1 flex flex-wrap gap-1">
								<Badge variant="outline">
									{row.source === 'calendar'
										? m.events_source_calendar()
										: m.events_source_manual()}
								</Badge>
								{#if ongoing(row)}<Badge>{m.events_ongoing()}</Badge>{/if}
								{#if row.removedAt}
									<Badge variant="destructive" title={m.events_removed_hint()}>
										{m.events_removed()}
									</Badge>
								{/if}
							</span>
						</Table.Cell>
						<Table.Cell class="whitespace-normal">{row.location ?? '—'}</Table.Cell>
						<Table.Cell class="text-right tabular-nums">{row.scans}</Table.Cell>
						<Table.Cell class="text-right whitespace-nowrap">
							{#if row.source === 'manual'}
								<Button variant="ghost" size="sm" onclick={() => edit(row)}>
									{m.events_edit()}
								</Button>
								<Button
									variant="ghost"
									size="sm"
									disabled={row.scans > 0}
									title={row.scans > 0 ? m.events_delete_blocked() : undefined}
									onclick={() => (deleting = row)}
								>
									{m.events_delete()}
								</Button>
							{:else}
								<span class="text-xs text-muted-foreground">{m.events_calendar_hint()}</span>
							{/if}
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	{/if}

	<a href={resolve('/admin')} class="text-blue-600 underline">{m.admin_title()}</a>
</main>

<EventDialog bind:open={editorOpen} id={editingId} bind:fields />

<AlertDialog.Root bind:open={() => deleting !== null, (open) => !open && (deleting = null)}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{m.events_delete_title()}</AlertDialog.Title>
			<AlertDialog.Description>
				{m.events_delete_text({ title: deleting?.title ?? '' })}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>{m.events_cancel()}</AlertDialog.Cancel>
			<form
				method="post"
				action="?/delete"
				use:enhance={() => {
					return async ({ update }) => {
						deleting = null;
						await update();
					};
				}}
			>
				<input type="hidden" name="id" value={deleting?.id} />
				<AlertDialog.Action type="submit" variant="destructive">
					{m.events_delete()}
				</AlertDialog.Action>
			</form>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
