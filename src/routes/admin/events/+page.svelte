<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import PencilLineIcon from '@lucide/svelte/icons/pencil-line';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import ClipboardCheckIcon from '@lucide/svelte/icons/clipboard-check';
	import QrCodeIcon from '@lucide/svelte/icons/qr-code';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import TrashIcon from '@lucide/svelte/icons/trash';
	import type { ColumnDef, SortingState } from '@tanstack/table-core';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import DataTable from '$lib/components/data-table.svelte';
	import { renderSnippet } from '$lib/components/ui/data-table';
	import type { EventFields } from '$lib/event-form';
	import { eventWhen } from '$lib/event-when';
	import { m } from '$lib/messages';
	import { getLocale } from '$lib/paraglide/runtime';
	import { formatDateTime, wallClock } from '$lib/time';
	import CalendarSyncStatus from '$lib/components/calendar-sync-status.svelte';
	import EventSourceHelp from '$lib/components/event-source-help.svelte';
	import EventSourceIcon from '$lib/components/event-source-icon.svelte';
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

	/** Why an event can't be deleted here, or null if it can. */
	const undeletable = (row: Row) =>
		row.source === 'calendar'
			? m.events_delete_calendar()
			: row.scans > 0
				? m.events_delete_blocked()
				: null;

	// Running events count as upcoming: they're where organizers look. "Current"
	// adds the last two weeks, whose attendance organizers come to check.
	type Period = 'current' | 'upcoming' | 'past' | 'all';
	const RECENT_MS = 14 * 24 * 60 * 60_000;
	let period = $state<Period>('current');
	let sorting = $state<SortingState>([{ id: 'when', desc: false }]);
	const events = $derived(
		period === 'all'
			? data.events
			: period === 'current'
				? data.events.filter((row) => row.endsAt.getTime() > data.now.getTime() - RECENT_MS)
				: data.events.filter((row) => (period === 'past') === past(row))
	);

	function choosePeriod(next: string) {
		// The group lets the active item be clicked off; keep one chosen.
		if (!next) return;
		period = next as Period;
		// Past events newest first, or the list starts a month ago.
		sorting = [{ id: 'when', desc: period === 'past' }];
	}

	const ongoing = (row: Row) => row.startsAt <= data.now && data.now < row.endsAt;
	const past = (row: Row) => row.endsAt <= data.now;

	const columns: ColumnDef<Row>[] = [
		{
			id: 'when',
			accessorFn: (row) => row.startsAt,
			sortingFn: 'datetime',
			header: m.events_col_when(),
			cell: ({ row }) => eventWhen(row.original, { allDayNote: false }),
			meta: { class: 'whitespace-nowrap' }
		},
		{
			accessorKey: 'title',
			sortingFn: 'text',
			header: m.events_col_title(),
			cell: ({ row }) => renderSnippet(titleCell, row.original),
			meta: { class: 'whitespace-normal' }
		},
		{
			id: 'location',
			accessorFn: (row) => row.location ?? '',
			sortingFn: 'text',
			header: m.events_col_location(),
			cell: ({ row }) => row.original.location ?? '—',
			meta: { class: 'whitespace-normal' }
		},
		{
			accessorKey: 'attendees',
			header: m.events_col_attendees(),
			cell: ({ row }) => renderSnippet(attendeesCell, row.original),
			meta: { class: 'text-right tabular-nums' }
		},
		{
			accessorKey: 'unconfirmed',
			header: () => renderSnippet(unconfirmedHead),
			cell: ({ row }) => renderSnippet(unconfirmedCell, row.original),
			meta: { class: 'text-right tabular-nums' }
		},
		{
			id: 'actions',
			enableSorting: false,
			header: () => renderSnippet(actionsHead),
			cell: ({ row }) => renderSnippet(actionsCell, row.original),
			meta: { class: 'text-right whitespace-nowrap' }
		}
	];

	const syncMessage = $derived.by(() => {
		if (form && 'syncFailed' in form) return m.events_sync_failed();
		if (form && 'synced' in form && form.synced) return m.events_sync_result(form.synced);
		return null;
	});
</script>

<svelte:head><title>{m.events_title()}</title></svelte:head>

{#snippet titleCell(row: Row)}
	<span class="inline-flex items-center gap-1.5">
		<EventSourceIcon source={row.source} />
		<span class="font-medium">{row.title}</span>
	</span>
	{#if ongoing(row) || row.removedAt}
		<span class="mt-1 flex flex-wrap gap-1">
			{#if ongoing(row)}<Badge>{m.events_ongoing()}</Badge>{/if}
			{#if row.removedAt}
				<Badge variant="destructive" title={m.events_removed_hint()}>
					{m.events_removed()}
				</Badge>
			{/if}
		</span>
	{/if}
{/snippet}

<!-- Where the eye goes for "who came": straight to the event's attendance. -->
{#snippet attendeesCell(row: Row)}
	<a
		href={resolve('/admin/events/[id]', { id: row.id })}
		class="underline underline-offset-4"
		aria-label={m.events_attendance_open({ title: row.title })}>{row.attendees}</a
	>
{/snippet}

{#snippet unconfirmedHead()}
	<span title={m.unconfirmed_hint()}>{m.events_col_unconfirmed()}</span>
{/snippet}

<!-- Takes the row, like every cell: FlexRender spreads what it's given into a
     new object, so a bare number would arrive as `{ attach }`. -->
{#snippet unconfirmedCell(row: Row)}
	<span class={[row.unconfirmed === 0 && 'text-muted-foreground']}>{row.unconfirmed}</span>
{/snippet}

{#snippet actionsHead()}
	<span class="sr-only">{m.events_col_actions()}</span>
{/snippet}

{#snippet actionsCell(row: Row)}
	<Tooltip.Root>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				<Button
					{...props}
					href={resolve('/admin/events/[id]', { id: row.id })}
					variant="ghost"
					size="icon-sm"
					aria-label={m.events_show_attendance()}
				>
					<ClipboardCheckIcon />
				</Button>
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content>{m.events_show_attendance()}</Tooltip.Content>
	</Tooltip.Root>
	<Tooltip.Root>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				<!-- Button passes href through as is; resolving it is ours to do. -->
				<Button
					{...props}
					href={resolve('/admin/events/[id]/code', { id: row.id })}
					variant="ghost"
					size="icon-sm"
					aria-label={m.events_show_code()}
				>
					<QrCodeIcon />
				</Button>
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content>{m.events_show_code()}</Tooltip.Content>
	</Tooltip.Root>
	{@const calendarUrl = data.calendar?.editUrl}
	<Tooltip.Root>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				{#if row.source === 'manual'}
					<Button
						{...props}
						variant="ghost"
						size="icon-sm"
						aria-label={m.events_edit()}
						onclick={() => edit(row)}
					>
						<PencilLineIcon />
					</Button>
				{:else if calendarUrl}
					<Button
						{...props}
						href={calendarUrl}
						target="_blank"
						rel="noopener noreferrer"
						variant="ghost"
						size="icon-sm"
						aria-label={m.events_edit_calendar()}
					>
						<PencilLineIcon />
					</Button>
				{:else}
					<!-- As with delete below: aria-disabled keeps the reason reachable. -->
					<Button
						{...props}
						variant="ghost"
						size="icon-sm"
						class="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
						aria-disabled="true"
						aria-label={m.events_edit_calendar_unlinked()}
					>
						<PencilLineIcon />
					</Button>
				{/if}
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content class="max-w-64">
			{row.source === 'manual'
				? m.events_edit()
				: calendarUrl
					? m.events_edit_calendar()
					: m.events_edit_calendar_unlinked()}
		</Tooltip.Content>
	</Tooltip.Root>
	{@const reason = undeletable(row)}
	<Tooltip.Root>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				<!-- aria-disabled, not disabled: a disabled button gets no hover or
				     focus, and the tooltip saying why would never show. -->
				<Button
					{...props}
					variant="ghost"
					size="icon-sm"
					class="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
					aria-disabled={reason !== null}
					aria-label={reason ?? m.events_delete()}
					onclick={() => {
						if (reason === null) deleting = row;
					}}
				>
					<TrashIcon />
				</Button>
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content class="max-w-64">{reason ?? m.events_delete()}</Tooltip.Content>
	</Tooltip.Root>
{/snippet}

<main class="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-6">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div class="flex items-center gap-1">
			<h1 class="text-2xl font-semibold">{m.events_title()}</h1>
			<!-- Synced events outlive a removed feed; they still need explaining. -->
			<EventSourceHelp
				calendar={data.calendar ??
					(data.events.some((row) => row.source === 'calendar') ? { editUrl: null } : null)}
			/>
		</div>
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
	<CalendarSyncStatus sync={data.sync} />

	{#if data.events.length === 0}
		<p class="text-muted-foreground">{m.events_none()}</p>
	{:else}
		<DataTable
			placeholder={m.table_search_events()}
			data={events}
			{columns}
			bind:sorting
			search={(row) => `${row.title} ${row.location ?? ''}`}
			rowId={(row) => row.id}
			rowClass={(row) => [past(row) && 'text-muted-foreground']}
		>
			{#snippet toolbar()}
				<ToggleGroup.Root
					type="single"
					variant="outline"
					value={period}
					onValueChange={choosePeriod}
					aria-label={m.events_period()}
				>
					<ToggleGroup.Item value="current">{m.events_period_current()}</ToggleGroup.Item>
					<ToggleGroup.Item value="upcoming">{m.events_period_upcoming()}</ToggleGroup.Item>
					<ToggleGroup.Item value="past">{m.events_period_past()}</ToggleGroup.Item>
					<ToggleGroup.Item value="all">{m.events_period_all()}</ToggleGroup.Item>
				</ToggleGroup.Root>
			{/snippet}
		</DataTable>
	{/if}
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
