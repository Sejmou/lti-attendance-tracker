<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ColumnDef } from '@tanstack/table-core';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import DataTable from '$lib/components/data-table.svelte';
	import { renderSnippet } from '$lib/components/ui/data-table';
	import { deviceName } from '$lib/device-name';
	import { m } from '$lib/paraglide/messages';
	import { getLocale } from '$lib/paraglide/runtime';
	import { formatDateTime } from '$lib/time';
	import type { ActionData, PageServerData } from './$types';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	type Row = PageServerData['attendees'][number];

	let deleting = $state<Row | null>(null);

	const date = (at: Date) => formatDateTime(at, getLocale(), { dateStyle: 'medium' });
	const dateTime = (at: Date) =>
		formatDateTime(at, getLocale(), { dateStyle: 'medium', timeStyle: 'short' });

	const columns: ColumnDef<Row>[] = [
		{
			id: 'name',
			accessorFn: (row) => `${row.lastName} ${row.firstName}`,
			sortingFn: 'text',
			header: m.attendees_col_name(),
			cell: ({ row }) => renderSnippet(nameCell, row.original),
			meta: { class: 'whitespace-normal' }
		},
		{
			id: 'firstSeen',
			accessorFn: (row) => row.createdAt,
			sortingFn: 'datetime',
			header: m.attendees_col_first_seen(),
			cell: ({ row }) => date(row.original.createdAt),
			meta: { class: 'tabular-nums' }
		},
		{
			id: 'lastSeen',
			accessorFn: (row) => row.lastSeenAt,
			sortingFn: 'datetime',
			header: m.attendees_col_last_seen(),
			cell: ({ row }) => date(row.original.lastSeenAt),
			meta: { class: 'tabular-nums' }
		},
		{
			accessorKey: 'scans',
			header: m.events_col_scans(),
			meta: { class: 'text-right tabular-nums' }
		},
		{
			id: 'phone',
			enableSorting: false,
			header: m.attendees_col_phone(),
			cell: ({ row }) => renderSnippet(phoneCell, row.original),
			meta: { class: 'whitespace-normal' }
		},
		{
			id: 'actions',
			enableSorting: false,
			header: () => renderSnippet(actionsHead),
			cell: ({ row }) => renderSnippet(actionsCell, row.original),
			meta: { class: 'text-right' }
		}
	];
</script>

<svelte:head><title>{m.attendees_title()}</title></svelte:head>

{#snippet nameCell(row: Row)}
	<span class="font-medium">{row.firstName} {row.lastName}</span>
	{#if row.manualEntry}
		<Badge variant="outline" title={m.attendees_manual_hint()}>
			{m.scans_method_manual()}
		</Badge>
	{/if}
	<span class="block text-xs text-muted-foreground">{row.email}</span>
{/snippet}

{#snippet phoneCell(row: Row)}
	{#if row.linked}
		<Badge variant="secondary">{m.attendees_phone_linked()}</Badge>
	{:else}
		<span class="text-muted-foreground">—</span>
	{/if}
	<!-- Every setup, replaced ones included: phone after phone stands out. -->
	{#if row.enrollments.length > 0}
		<details class="mt-1 text-xs text-muted-foreground">
			<summary class="cursor-pointer">
				{m.attendees_enrollments({ count: row.enrollments.length })}
			</summary>
			<ul class="mt-1 flex flex-col gap-0.5">
				{#each row.enrollments as setup, i (i)}
					<li class="tabular-nums" title={setup.userAgent ?? ''}>
						{dateTime(setup.enrolledAt)} · {deviceName(setup.userAgent)}
					</li>
				{/each}
			</ul>
		</details>
	{/if}
{/snippet}

{#snippet actionsHead()}
	<span class="sr-only">{m.events_col_actions()}</span>
{/snippet}

{#snippet actionsCell(row: Row)}
	<Button variant="ghost" size="sm" onclick={() => (deleting = row)}>
		{m.attendees_delete()}
	</Button>
{/snippet}

<main class="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-6">
	<h1 class="text-2xl font-semibold">{m.attendees_title()}</h1>

	<p class="text-sm text-muted-foreground">
		{m.attendees_intro()}
		{#if form && 'deleted' in form}
			<span class="block" role="status">{m.attendees_deleted()}</span>
		{:else if form && 'missing' in form}
			<span class="block text-destructive" role="alert">{m.attendees_missing()}</span>
		{/if}
	</p>

	{#if data.attendees.length === 0}
		<p class="text-muted-foreground">{m.attendees_none()}</p>
	{:else}
		<!-- Longest gone first: those are the ones to think about deleting. -->
		<DataTable
			placeholder={m.table_search_people()}
			data={data.attendees}
			{columns}
			sorting={[{ id: 'lastSeen', desc: false }]}
			search={(row) => `${row.firstName} ${row.lastName} ${row.email}`}
			rowId={(row) => row.id}
		/>
	{/if}
</main>

<AlertDialog.Root bind:open={() => deleting !== null, (open) => !open && (deleting = null)}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{m.attendees_delete_title()}</AlertDialog.Title>
			<AlertDialog.Description>
				{m.attendees_delete_text({
					name: `${deleting?.firstName ?? ''} ${deleting?.lastName ?? ''}`,
					email: deleting?.email ?? ''
				})}
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
					{m.attendees_delete()}
				</AlertDialog.Action>
			</form>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
