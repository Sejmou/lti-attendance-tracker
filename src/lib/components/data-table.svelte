<script lang="ts" generics="T">
	import {
		getCoreRowModel,
		getFilteredRowModel,
		getSortedRowModel,
		type ColumnDef,
		type SortingState
	} from '@tanstack/table-core';
	import ArrowDownIcon from '@lucide/svelte/icons/arrow-down';
	import ArrowUpIcon from '@lucide/svelte/icons/arrow-up';
	import { createSvelteTable, FlexRender } from '$lib/components/ui/data-table';
	import { Input } from '$lib/components/ui/input';
	import * as Table from '$lib/components/ui/table';
	import { m } from '$lib/messages';
	import type { Snippet } from 'svelte';
	import type { ClassValue } from 'svelte/elements';

	let {
		data,
		columns,
		sorting = $bindable(),
		search,
		rowId,
		rowClass,
		toolbar,
		placeholder = m.table_search()
	}: {
		data: T[];
		columns: ColumnDef<T>[];
		/** Bind it to change the sorting from outside, as a filter of the page's may. */
		sorting: SortingState;
		/** Everything in a row the filter box should find. */
		search: (row: T) => string;
		rowId: (row: T) => string;
		rowClass?: (row: T) => ClassValue;
		/** The search box's text, ideally naming what it searches. */
		placeholder?: string;
		/** More controls next to the filter box. */
		toolbar?: Snippet;
	} = $props();

	let filter = $state('');

	const table = createSvelteTable({
		get data() {
			return data;
		},
		get columns() {
			return columns;
		},
		state: {
			get sorting() {
				return sorting;
			},
			get globalFilter() {
				return filter;
			}
		},
		onSortingChange: (next) => (sorting = typeof next === 'function' ? next(sorting) : next),
		enableSortingRemoval: false,
		getColumnCanGlobalFilter: () => true,
		globalFilterFn: (row, _column, query: string) =>
			search(row.original).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
		getRowId: (row) => rowId(row),
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getFilteredRowModel: getFilteredRowModel()
	});

	const rows = $derived(table.getRowModel().rows);
</script>

<div class="flex flex-wrap items-center gap-3">
	<Input
		type="search"
		class="max-w-xs"
		{placeholder}
		aria-label={placeholder}
		bind:value={filter}
	/>
	{@render toolbar?.()}
</div>

<Table.Root>
	<Table.Header>
		{#each table.getHeaderGroups() as group (group.id)}
			<Table.Row>
				{#each group.headers as header (header.id)}
					{@const sorted = header.column.getIsSorted()}
					<Table.Head
						class={header.column.columnDef.meta?.class}
						aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none'}
					>
						{#if header.column.getCanSort()}
							<button
								type="button"
								class="inline-flex items-center gap-1 hover:underline"
								title={m.table_sort_hint()}
								onclick={header.column.getToggleSortingHandler()}
							>
								<FlexRender
									content={header.column.columnDef.header}
									context={header.getContext()}
								/>
								{#if sorted === 'asc'}<ArrowUpIcon class="size-3.5" />{/if}
								{#if sorted === 'desc'}<ArrowDownIcon class="size-3.5" />{/if}
							</button>
						{:else}
							<FlexRender content={header.column.columnDef.header} context={header.getContext()} />
						{/if}
					</Table.Head>
				{/each}
			</Table.Row>
		{/each}
	</Table.Header>
	<Table.Body>
		{#each rows as row (row.id)}
			<Table.Row class={rowClass?.(row.original)}>
				{#each row.getVisibleCells() as cell (cell.id)}
					<Table.Cell class={cell.column.columnDef.meta?.class}>
						<FlexRender content={cell.column.columnDef.cell} context={cell.getContext()} />
					</Table.Cell>
				{/each}
			</Table.Row>
		{:else}
			<Table.Row>
				<Table.Cell colspan={columns.length} class="text-center text-muted-foreground">
					{m.table_no_matches()}
				</Table.Cell>
			</Table.Row>
		{/each}
	</Table.Body>
</Table.Root>
