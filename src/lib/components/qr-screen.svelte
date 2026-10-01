<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { Snippet } from 'svelte';
	import { m } from '$lib/paraglide/messages';

	let {
		title,
		subtitle,
		qr,
		msUntilNextBucket,
		expanded = false,
		oncollapse,
		children
	}: {
		title: string;
		subtitle?: string;
		qr: string;
		msUntilNextBucket: number;
		/** The code alone, as large as the screen allows; `children` aren't shown. */
		expanded?: boolean;
		oncollapse?: () => void;
		children: Snippet;
	} = $props();

	// The code is derived from the clock, so refetch exactly when it rolls over
	// rather than on a fixed interval that would drift out of step with it.
	$effect(() => {
		const id = setTimeout(() => invalidateAll(), msUntilNextBucket);
		return () => clearTimeout(id);
	});
</script>

<svelte:window onkeydown={(e) => expanded && e.key === 'Escape' && oncollapse?.()} />

{#snippet code(size: string)}
	<div class="aspect-square rounded-xl bg-white p-4 shadow-sm [&_svg]:size-full {size}">
		<!-- eslint-disable-next-line svelte/no-at-html-tags -- our own server-rendered SVG -->
		{@html qr}
	</div>
{/snippet}

{#if expanded}
	<!-- Over everything, footer included, so nothing can push the code off the
	     screen: the smaller of its width and height, less the padding and the
	     button below it. -->
	<main
		class="fixed inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-background p-4"
	>
		{@render code('w-[min(100vw-2rem,100svh-4rem)]')}
		<button type="button" class="text-sm text-blue-600 underline" onclick={oncollapse}>
			{m.qr_scans_show()}
		</button>
	</main>
{:else}
	<!-- Stacked on small screens; from lg the code takes the left column at full
	     height and everything else moves to a column beside it. -->
	<main
		class="grid w-full flex-1 content-start justify-items-center gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:grid-rows-[auto_1fr] lg:content-center"
	>
		<hgroup class="text-center lg:col-start-2 lg:justify-self-start lg:text-left">
			<h1 class="text-3xl font-semibold">{title}</h1>
			{#if subtitle}
				<p class="mt-1 text-lg text-gray-600">{subtitle}</p>
			{/if}
		</hgroup>

		<!-- The full width, but never taller than the viewport (less the padding and the footer). -->
		{@render code(
			'w-[min(100%,calc(100svh-5.5rem))] lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:self-center'
		)}

		<div
			class="flex w-full max-w-md flex-col items-center gap-6 text-center lg:col-start-2 lg:items-start lg:text-left"
		>
			{@render children()}
		</div>
	</main>
{/if}
