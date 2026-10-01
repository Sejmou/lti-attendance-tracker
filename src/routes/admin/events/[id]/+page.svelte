<script lang="ts">
	import { resolve } from '$app/paths';
	import QrCodeIcon from '@lucide/svelte/icons/qr-code';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Table from '$lib/components/ui/table';
	import { deviceName } from '$lib/device-name';
	import { m } from '$lib/paraglide/messages';
	import { getLocale } from '$lib/paraglide/runtime';
	import { formatDateTime, wallClock } from '$lib/time';
	import type { PageServerData } from './$types';

	let { data }: { data: PageServerData } = $props();

	const event = $derived(data.event);
	const scannedOut = $derived(data.attendance.filter((row) => row.scannedOut).length);

	const day = (at: Date) =>
		formatDateTime(at, getLocale(), { weekday: 'short', day: 'numeric', month: 'short' });
	const time = (at: Date) =>
		formatDateTime(at, getLocale(), { hour: '2-digit', minute: '2-digit' });
	// Scan times on the event's own day need no date; anything else does.
	const at = (moment: Date) =>
		wallClock(moment).date === wallClock(event.startsAt).date
			? time(moment)
			: `${day(moment)}, ${time(moment)}`;

	const when = $derived.by(() => {
		if (event.allDay) {
			const last = new Date(event.endsAt.getTime() - 1);
			return wallClock(last).date === wallClock(event.startsAt).date
				? `${day(event.startsAt)} · ${m.events_all_day()}`
				: `${day(event.startsAt)} – ${day(last)} · ${m.events_all_day()}`;
		}
		return wallClock(event.startsAt).date === wallClock(event.endsAt).date
			? `${day(event.startsAt)}, ${time(event.startsAt)}–${time(event.endsAt)}`
			: `${day(event.startsAt)}, ${time(event.startsAt)} – ${day(event.endsAt)}, ${time(event.endsAt)}`;
	});

	const methods = {
		device: m.scans_method_device,
		lti: m.scans_method_lti,
		host: m.scans_method_host
	};

	const hints: Partial<Record<keyof typeof methods, () => string>> = {
		host: m.scans_host_hint,
		lti: m.scans_lti_hint
	};
</script>

<svelte:head><title>{event.title} · {m.attendance_title()}</title></svelte:head>

<main class="mx-auto flex min-h-svh max-w-5xl flex-col gap-8 p-6">
	<header class="flex flex-wrap items-start justify-between gap-4">
		<div class="flex flex-col gap-1">
			<h1 class="text-2xl font-semibold">{event.title}</h1>
			<p class="text-muted-foreground">
				{when}{event.location ? ` · ${event.location}` : ''}
			</p>
			<span class="flex flex-wrap gap-1">
				<Badge variant="outline">
					{event.source === 'calendar' ? m.events_source_calendar() : m.events_source_manual()}
				</Badge>
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
			{m.attendance_scanned_in({ count: data.attendance.length })} ·
			{m.attendance_scanned_out({ count: scannedOut })}
		</p>
		{#if data.attendance.length === 0}
			<p class="text-muted-foreground">{m.scans_none()}</p>
		{:else}
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>{m.scans_col_attendee()}</Table.Head>
						<Table.Head>{m.attendance_col_in()}</Table.Head>
						<Table.Head>{m.attendance_col_out()}</Table.Head>
						<Table.Head class="text-right">{m.events_col_scans()}</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.attendance as row (row.scanner)}
						<Table.Row>
							<Table.Cell class="whitespace-normal">
								{#if row.email === null}
									<span class="text-muted-foreground italic">{m.scans_deleted_attendee()}</span>
								{:else}
									<span class="font-medium">{row.firstName} {row.lastName}</span>
									<span class="block text-xs text-muted-foreground">{row.email}</span>
								{/if}
							</Table.Cell>
							<Table.Cell class="tabular-nums">{at(row.scannedIn)}</Table.Cell>
							<Table.Cell class="tabular-nums">
								{row.scannedOut ? at(row.scannedOut) : '—'}
							</Table.Cell>
							<Table.Cell class="text-right tabular-nums">{row.scans}</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
			<p class="text-sm text-muted-foreground">{m.attendance_footnote()}</p>
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
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>{m.scans_col_when()}</Table.Head>
						<Table.Head>{m.scans_col_attendee()}</Table.Head>
						<Table.Head>{m.scans_col_method()}</Table.Head>
						<Table.Head>{m.scans_col_address()}</Table.Head>
						<Table.Head>{m.scans_col_device()}</Table.Head>
						<Table.Head>{m.scans_col_scan()}</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.log.rows as row (row.codeScanId + row.scanner)}
						<Table.Row>
							<Table.Cell class="tabular-nums">{at(row.at)}</Table.Cell>
							<Table.Cell class="whitespace-normal">
								{#if row.email === null}
									<span class="text-muted-foreground italic">{m.scans_deleted_attendee()}</span>
								{:else}
									{row.firstName}
									{row.lastName}
									<span class="block text-xs text-muted-foreground">{row.email}</span>
								{/if}
							</Table.Cell>
							<Table.Cell title={hints[row.method]?.()}>{methods[row.method]()}</Table.Cell>
							<!-- A prefix is plenty to see two match; the full hash says no more. -->
							<Table.Cell class="font-mono text-xs" title={m.scans_address_hint()}>
								{row.ipHash?.slice(0, 8) ?? '—'}
								{#if row.sharedAddress}
									<Badge variant="secondary" title={m.scans_shared_hint()}>{m.scans_shared()}</Badge
									>
								{/if}
							</Table.Cell>
							<Table.Cell title={row.userAgent ?? ''}>{deviceName(row.userAgent)}</Table.Cell>
							<Table.Cell class="font-mono text-xs text-muted-foreground">
								{row.codeScanId}
								{#if row.repeat}
									<Badge variant="secondary" class="font-sans" title={m.scans_again_hint()}>
										{m.scans_again()}
									</Badge>
								{/if}
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
			<p class="text-sm text-muted-foreground">{m.scans_footnote()}</p>
		</section>
	{/if}

	<div class="flex gap-4">
		<a href={resolve('/admin/events')} class="text-blue-600 underline">{m.events_title()}</a>
		<a href={resolve('/admin')} class="text-blue-600 underline">{m.admin_title()}</a>
	</div>
</main>
