<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import QrCodeIcon from '@lucide/svelte/icons/qr-code';
	import type { ColumnDef } from '@tanstack/table-core';
	import DataTable from '$lib/components/data-table.svelte';
	import EventSourceHelp from '$lib/components/event-source-help.svelte';
	import EventSourceIcon from '$lib/components/event-source-icon.svelte';
	import { renderSnippet } from '$lib/components/ui/data-table';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { deviceName } from '$lib/device-name';
	import { attendanceShare } from '$lib/attendance-share';
	import { m } from '$lib/messages';
	import { getLocale } from '$lib/paraglide/runtime';
	import { day, eventWhen, time } from '$lib/event-when';
	import { wallClock } from '$lib/time';
	import type { ActionData, PageServerData } from './$types';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	const event = $derived(data.event);
	const scannedOut = $derived(data.attendance.filter((row) => row.scannedOut).length);
	const present = $derived(data.attendance.filter((row) => row.verified).length);

	// Scan times on the event's own day need no date; anything else does.
	const at = (moment: Date) =>
		wallClock(moment).date === wallClock(event.startsAt).date
			? time(moment)
			: `${day(moment)}, ${time(moment)}`;

	const when = $derived(eventWhen(event));

	const methods = {
		device: m.scans_method_device,
		lti: m.scans_method_lti,
		host: m.scans_method_host,
		manual: m.scans_method_manual
	};

	const hints: Partial<Record<keyof typeof methods, () => string>> = {
		host: m.scans_host_hint,
		lti: m.scans_lti_hint,
		manual: m.scans_manual_entry_hint
	};

	type AttendanceRow = PageServerData['attendance'][number];

	// The same figure attendees see for themselves. Typed-in details nobody
	// assigned to an account don't count as attending, so they get none.
	const share = (row: AttendanceRow) =>
		row.verified ? attendanceShare(event, row.scannedIn, row.scannedOut) : null;
	const percent = new Intl.NumberFormat(getLocale(), {
		style: 'percent',
		maximumFractionDigits: 0
	});

	const attendanceColumns: ColumnDef<AttendanceRow>[] = [
		{
			id: 'attendee',
			accessorFn: (row) => (row.email === null ? '' : `${row.lastName} ${row.firstName}`),
			sortingFn: 'text',
			header: m.scans_col_attendee(),
			cell: ({ row }) => renderSnippet(attendanceCell, row.original),
			meta: { class: 'whitespace-normal' }
		},
		{
			id: 'in',
			accessorFn: (row) => row.scannedIn,
			sortingFn: 'datetime',
			header: m.attendance_col_in(),
			cell: ({ row }) => at(row.original.scannedIn),
			meta: { class: 'tabular-nums' }
		},
		{
			id: 'out',
			accessorFn: (row) => row.scannedOut ?? undefined,
			sortingFn: 'datetime',
			sortUndefined: 'last',
			header: m.attendance_col_out(),
			cell: ({ row }) => (row.original.scannedOut ? at(row.original.scannedOut) : '—'),
			meta: { class: 'tabular-nums' }
		},
		{
			id: 'share',
			accessorFn: (row) => share(row) ?? undefined,
			sortUndefined: 'last',
			header: m.attendance_col_share(),
			cell: ({ row }) => {
				const value = share(row.original);
				return value === null ? '—' : percent.format(value);
			},
			meta: { class: 'text-right tabular-nums' }
		},
		{
			accessorKey: 'scans',
			header: m.events_col_scans(),
			meta: { class: 'text-right tabular-nums' }
		}
	];

	const attendanceSearch = (row: AttendanceRow) =>
		[row.firstName, row.lastName, row.email, ...row.linkedFrom.map((typed) => typed.email)].join(
			' '
		);

	type LogRow = PageServerData['log']['rows'][number];

	const logColumns: ColumnDef<LogRow>[] = [
		{
			id: 'when',
			accessorFn: (row) => row.at,
			sortingFn: 'datetime',
			header: m.scans_col_when(),
			cell: ({ row }) => at(row.original.at),
			meta: { class: 'tabular-nums' }
		},
		{
			id: 'attendee',
			accessorFn: (row) => (row.email === null ? '' : `${row.lastName} ${row.firstName}`),
			sortingFn: 'text',
			header: m.scans_col_attendee(),
			cell: ({ row }) => renderSnippet(attendeeCell, row.original),
			meta: { class: 'whitespace-normal' }
		},
		{
			id: 'method',
			accessorFn: (row) => methods[row.method](),
			sortingFn: 'text',
			header: m.scans_col_method(),
			cell: ({ row }) => renderSnippet(methodCell, row.original)
		},
		{
			id: 'address',
			accessorFn: (row) => row.ipHash ?? '',
			sortingFn: 'text',
			header: m.scans_col_address(),
			cell: ({ row }) => renderSnippet(addressCell, row.original)
		},
		{
			id: 'device',
			accessorFn: (row) => deviceName(row.userAgent),
			sortingFn: 'text',
			header: m.scans_col_device(),
			cell: ({ row }) => renderSnippet(deviceCell, row.original)
		},
		{
			id: 'scan',
			accessorFn: (row) => String(row.codeScanId),
			sortingFn: 'alphanumeric',
			header: m.scans_col_scan(),
			cell: ({ row }) => renderSnippet(scanCell, row.original)
		}
	];

	const logSearch = (row: LogRow) =>
		[
			row.firstName,
			row.lastName,
			row.email,
			row.typedEmail,
			methods[row.method](),
			row.ipHash?.slice(0, 8),
			deviceName(row.userAgent),
			row.codeScanId
		].join(' ');
</script>

<svelte:head><title>{event.title} · {m.attendance_title()}</title></svelte:head>

{#snippet attendanceCell(row: AttendanceRow)}
	{#if row.email === null}
		<span class="text-muted-foreground italic">{m.scans_deleted_attendee()}</span>
	{:else}
		<span class="font-medium">{row.firstName} {row.lastName}</span>
		<span class="block text-xs text-muted-foreground">{row.email}</span>
	{/if}
	{#if row.manualScans > 0}
		<Badge
			variant="outline"
			title={m.attendance_manual_hint({ count: row.manualScans, total: row.scans })}
		>
			{m.scans_method_manual()}
		</Badge>
	{/if}
	{#if row.flagged}
		<Badge variant="destructive" title={m.attendance_flagged_hint()}>
			{m.attendance_flagged()}
		</Badge>
	{/if}
	{#each row.suggestions as account (account.id)}
		<form
			method="post"
			action="?/link"
			use:enhance
			class="mt-1 flex flex-wrap items-center gap-2 text-xs"
		>
			<input type="hidden" name="reportedAs" value={row.userId} />
			<input type="hidden" name="userId" value={account.id} />
			<span>
				{m.link_suggestion({ name: `${account.firstName} ${account.lastName}` })}
			</span>
			<Button type="submit" size="xs" variant="outline" title={m.link_hint()}>
				{m.link_button()}
			</Button>
		</form>
	{/each}
	{#each row.linkedFrom as typed (typed.reportedAs)}
		<form
			method="post"
			action="?/unlink"
			use:enhance
			class="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
		>
			<input type="hidden" name="reportedAs" value={typed.reportedAs} />
			<span>{m.linked_from({ email: typed.email })}</span>
			<Button type="submit" size="xs" variant="ghost">{m.unlink_button()}</Button>
		</form>
	{/each}
{/snippet}

{#snippet attendeeCell(row: LogRow)}
	{#if row.email === null}
		<span class="text-muted-foreground italic">{m.scans_deleted_attendee()}</span>
	{:else}
		{row.firstName}
		{row.lastName}
		<span class="block text-xs text-muted-foreground">{row.email}</span>
	{/if}
	{#if row.otherPersonsPhone}
		{@const owner = row.keyOwnerFirstName
			? `${row.keyOwnerFirstName} ${row.keyOwnerLastName}`
			: '?'}
		<Badge variant="destructive" title={m.scans_other_phone_hint({ name: owner })}>
			{m.scans_other_phone({ name: owner })}
		</Badge>
	{/if}
	{#if row.typedEmail && row.reportedAs !== row.userId}
		<span class="block text-xs text-muted-foreground">
			{m.linked_from({ email: row.typedEmail })}
		</span>
	{/if}
{/snippet}

{#snippet methodCell(row: LogRow)}
	<span title={hints[row.method]?.()}>{methods[row.method]()}</span>
{/snippet}

{#snippet addressCell(row: LogRow)}
	<!-- A prefix is plenty to see two match; the full hash says no more. -->
	<span class="font-mono text-xs" title={m.scans_address_hint()}
		>{row.ipHash?.slice(0, 8) ?? '—'}</span
	>
	{#if row.sharedAddress}
		<Badge variant="secondary" title={m.scans_shared_hint()}>{m.scans_shared()}</Badge>
	{/if}
{/snippet}

{#snippet deviceCell(row: LogRow)}
	<span title={row.userAgent ?? ''}>{deviceName(row.userAgent)}</span>
	{#if row.sharedBrowser}
		<Badge variant="destructive" title={m.scans_shared_browser_hint()}>
			{m.scans_shared_browser()}
		</Badge>
	{/if}
{/snippet}

{#snippet scanCell(row: LogRow)}
	<span class="font-mono text-xs text-muted-foreground">{row.codeScanId}</span>
	{#if row.repeat}
		<Badge variant="secondary" title={m.scans_again_hint()}>{m.scans_again()}</Badge>
	{/if}
{/snippet}

<main class="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 p-6">
	<header class="flex flex-wrap items-start justify-between gap-4">
		<div class="flex flex-col gap-1">
			<h1 class="text-2xl font-semibold">{event.title}</h1>
			<p class="text-muted-foreground">
				{when}{event.location ? ` · ${event.location}` : ''}
			</p>
			<span class="flex flex-wrap items-center gap-1">
				<EventSourceIcon source={event.source} />
				<EventSourceHelp
					calendar={data.calendar ?? (event.source === 'calendar' ? { editUrl: null } : null)}
				/>
				{#if event.removedAt}
					<Badge variant="destructive" title={m.events_removed_hint()}>{m.events_removed()}</Badge>
				{/if}
			</span>
		</div>
		<!-- Button passes href through as is; resolving it is ours to do. -->
		<Button href={resolve('/admin/events/[id]/code', { id: event.id })}>
			<QrCodeIcon />
			{m.code_pick_show()}
		</Button>
	</header>

	<section class="flex flex-col gap-3">
		<h2 class="text-lg font-semibold">{m.attendance_title()}</h2>
		<p class="text-sm text-muted-foreground">
			{m.attendance_present({ count: present })} ·
			{#if present < data.attendance.length}
				<span title={m.unconfirmed_hint()}>
					{m.attendance_unconfirmed({ count: data.attendance.length - present })}
				</span>
				·
			{/if}
			{m.attendance_scanned_out({ count: scannedOut })}
		</p>
		{#if data.attendance.length === 0}
			<p class="text-muted-foreground">{m.scans_none()}</p>
		{:else}
			<DataTable
				data={data.attendance}
				columns={attendanceColumns}
				placeholder={m.table_search_people()}
				sorting={[{ id: 'in', desc: false }]}
				search={attendanceSearch}
				rowId={(row) => row.scanner}
			/>
			{#if form && 'linkFailed' in form}
				<p class="text-sm text-red-600" role="alert">{m.link_failed()}</p>
			{/if}
			<p class="text-sm text-muted-foreground">{m.attendance_footnote()}</p>
			<p class="text-sm text-muted-foreground">{m.attendance_share_footnote()}</p>
		{/if}
	</section>

	{#if data.log.rows.length > 0}
		<section class="flex flex-col gap-3">
			<h2 class="text-lg font-semibold">{m.scan_log()}</h2>
			<p class="text-sm text-muted-foreground">
				{m.scans_count({ count: data.log.rows.length })} ·
				{m.attendees_count({ count: data.log.attendees })} ·
				{m.addresses_count({ count: data.log.addresses })}
			</p>
			<DataTable
				data={data.log.rows}
				columns={logColumns}
				placeholder={m.table_search_scans()}
				sorting={[{ id: 'when', desc: true }]}
				search={logSearch}
				rowId={(row) => `${row.codeScanId}${row.scanner}`}
			/>
			<p class="text-sm text-muted-foreground">{m.scans_footnote()}</p>
		</section>
	{/if}
</main>
