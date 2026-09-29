<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import DatePicker from '$lib/components/date-picker.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import type { EventFieldError, EventFieldErrors, EventFields } from '$lib/event-form';
	import { m } from '$lib/paraglide/messages';
	import { TIMEZONE } from '$lib/time';

	/**
	 * Creates a manual event, or edits one (`id`). The fields belong to the
	 * page, which fills them before opening; this only edits and posts them.
	 */
	let {
		open = $bindable(false),
		id,
		fields = $bindable()
	}: { open?: boolean; id: string | null; fields: EventFields } = $props();

	let errors = $state<EventFieldErrors>({});
	let busy = $state(false);

	const messages: Record<EventFieldError, () => string> = {
		required: m.event_form_required,
		invalid: m.event_form_invalid,
		before_start: m.event_form_before_start
	};
	const error = (key: keyof EventFieldErrors) => {
		const code = errors[key];
		return code ? [{ message: messages[code]() }] : undefined;
	};

	// A start moved past the end takes the end along, so the dates can't cross.
	function setStartDate(date: string) {
		fields.startDate = date;
		errors.start = undefined;
		if (date && (!fields.endDate || fields.endDate < date)) fields.endDate = date;
	}

	function setEndDate(date: string) {
		fields.endDate = date;
		errors.end = undefined;
	}

	const submit: SubmitFunction = () => {
		busy = true;
		return async ({ result, update }) => {
			busy = false;
			if (result.type === 'failure') {
				errors = (result.data?.errors as EventFieldErrors | undefined) ?? {};
				return;
			}
			errors = {};
			open = false;
			await update();
		};
	};
</script>

<Dialog.Root bind:open onOpenChange={() => (errors = {})}>
	<Dialog.Content class="sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>{id ? m.event_form_edit_title() : m.event_form_new_title()}</Dialog.Title>
			<Dialog.Description>{m.event_form_timezone({ zone: TIMEZONE })}</Dialog.Description>
		</Dialog.Header>

		<form method="post" action={id ? '?/update' : '?/create'} use:enhance={submit}>
			{#if id}<input type="hidden" name="id" value={id} />{/if}
			<Field.Group>
				<Field.Field data-invalid={errors.title ? true : undefined}>
					<Field.Label for="event-title">{m.event_form_title()}</Field.Label>
					<Input
						id="event-title"
						name="title"
						bind:value={fields.title}
						oninput={() => (errors.title = undefined)}
						aria-invalid={errors.title ? true : undefined}
					/>
					<Field.Error errors={error('title')} />
				</Field.Field>

				<Field.Field>
					<Field.Label for="event-location">{m.event_form_location()}</Field.Label>
					<Input id="event-location" name="location" bind:value={fields.location} />
				</Field.Field>

				<Field.Set>
					<Field.Legend variant="label">{m.event_form_start()}</Field.Legend>
					<div class="grid grid-cols-[1fr_8rem] gap-3">
						<Field.Field data-invalid={errors.start ? true : undefined}>
							<Field.Label for="event-start-date" class="sr-only">{m.event_form_date()}</Field.Label
							>
							<DatePicker
								id="event-start-date"
								name="startDate"
								bind:value={() => fields.startDate, setStartDate}
								placeholder={m.event_form_pick_date()}
								invalid={Boolean(errors.start)}
							/>
						</Field.Field>
						<Field.Field data-invalid={errors.start ? true : undefined}>
							<Field.Label for="event-start-time" class="sr-only">{m.event_form_time()}</Field.Label
							>
							<Input
								id="event-start-time"
								name="startTime"
								type="time"
								bind:value={fields.startTime}
								oninput={() => (errors.start = undefined)}
								aria-invalid={errors.start ? true : undefined}
							/>
						</Field.Field>
					</div>
					<Field.Error errors={error('start')} />
				</Field.Set>

				<Field.Set>
					<Field.Legend variant="label">{m.event_form_end()}</Field.Legend>
					<div class="grid grid-cols-[1fr_8rem] gap-3">
						<Field.Field data-invalid={errors.end ? true : undefined}>
							<Field.Label for="event-end-date" class="sr-only">{m.event_form_date()}</Field.Label>
							<DatePicker
								id="event-end-date"
								name="endDate"
								bind:value={() => fields.endDate, setEndDate}
								placeholder={m.event_form_pick_date()}
								invalid={Boolean(errors.end)}
							/>
						</Field.Field>
						<Field.Field data-invalid={errors.end ? true : undefined}>
							<Field.Label for="event-end-time" class="sr-only">{m.event_form_time()}</Field.Label>
							<Input
								id="event-end-time"
								name="endTime"
								type="time"
								bind:value={fields.endTime}
								oninput={() => (errors.end = undefined)}
								aria-invalid={errors.end ? true : undefined}
							/>
						</Field.Field>
					</div>
					<Field.Error errors={error('end')} />
				</Field.Set>
			</Field.Group>

			<Dialog.Footer class="mt-6">
				<Dialog.Close>
					{#snippet child({ props })}
						<Button {...props} variant="outline">{m.events_cancel()}</Button>
					{/snippet}
				</Dialog.Close>
				<Button type="submit" disabled={busy}>{m.event_form_save()}</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
