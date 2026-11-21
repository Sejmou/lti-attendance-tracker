<script lang="ts">
	import { page } from '$app/state';
	import { adminCrumbs } from '$lib/admin-breadcrumbs';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { m } from '$lib/paraglide/messages';

	let { children } = $props();

	const crumbs = $derived(adminCrumbs(page.route.id, page.data.event));
</script>

<!-- In the same place on every page, whatever the width of the page below. -->
{#if crumbs.length > 0}
	<Breadcrumb.Root aria-label={m.admin_breadcrumb_label()} class="px-6 pt-4">
		<Breadcrumb.List>
			{#each crumbs as crumb, i (i)}
				{#if i > 0}<Breadcrumb.Separator />{/if}
				<Breadcrumb.Item class="min-w-0">
					<!-- An event's title can be long; the trail still fits a phone. -->
					{#if crumb.href}
						<Breadcrumb.Link href={crumb.href} class="max-w-60 truncate"
							>{crumb.label}</Breadcrumb.Link
						>
					{:else}
						<Breadcrumb.Page class="max-w-60 truncate">{crumb.label}</Breadcrumb.Page>
					{/if}
				</Breadcrumb.Item>
			{/each}
		</Breadcrumb.List>
	</Breadcrumb.Root>
{/if}

<Tooltip.Provider>
	{@render children()}
</Tooltip.Provider>
