<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import { m } from '$lib/paraglide/messages';

	/**
	 * The camera, read for QR codes until this is unmounted. `onscan` gets every
	 * code it reads, ours or not, and may be called for the same one repeatedly:
	 * it is up to the page to stop scanning by removing this.
	 */
	let { onscan, onerror }: { onscan: (text: string) => void; onerror: () => void } = $props();

	let cameras = $state<MediaDeviceInfo[]>([]);
	/** The one picked from the list; until then, whichever faces away from the user. */
	let requested = $state('');
	let active = $state('');

	// How often a frame is decoded. Plenty for a code held still, and cheap
	// enough on an old phone.
	const DECODE_MS = 150;

	// Reruns when another camera is picked, stopping the one before.
	const scan: Attachment<HTMLVideoElement> = (el) => {
		const deviceId = requested;
		let stopped = false;
		let stream: MediaStream | undefined;
		let frame = 0;

		void (async () => {
			try {
				stream = await navigator.mediaDevices.getUserMedia({
					video: deviceId
						? { deviceId: { exact: deviceId } }
						: { facingMode: { ideal: 'environment' } },
					audio: false
				});
			} catch {
				// Refused, no camera, or not over HTTPS (mediaDevices is undefined then).
				if (!stopped) onerror();
				return;
			}
			if (stopped) return stream.getTracks().forEach((track) => track.stop());

			el.srcObject = stream;
			await el.play().catch(() => {});
			active = stream.getVideoTracks()[0]?.getSettings().deviceId ?? '';
			// Labelled only once the user has allowed the camera, hence not sooner.
			cameras = (await navigator.mediaDevices.enumerateDevices()).filter(
				(device) => device.kind === 'videoinput'
			);

			// Only loaded by those who scan, not everyone who opens the page.
			const { default: jsQR } = await import('jsqr');
			const canvas = document.createElement('canvas');
			const context = canvas.getContext('2d', { willReadFrequently: true });
			let last = 0;
			const decode = (at: number) => {
				if (stopped || !context) return;
				frame = requestAnimationFrame(decode);
				if (at - last < DECODE_MS || !el.videoWidth) return;
				last = at;
				// Scaled down: a code filling part of the picture reads as well at
				// this size, in a fraction of the time.
				const scale = Math.min(1, 640 / el.videoWidth);
				canvas.width = Math.round(el.videoWidth * scale);
				canvas.height = Math.round(el.videoHeight * scale);
				context.drawImage(el, 0, 0, canvas.width, canvas.height);
				const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
				const code = jsQR(data, width, height, { inversionAttempts: 'dontInvert' });
				if (code?.data) onscan(code.data);
			};
			frame = requestAnimationFrame(decode);
		})();

		return () => {
			stopped = true;
			cancelAnimationFrame(frame);
			stream?.getTracks().forEach((track) => track.stop());
		};
	};
</script>

<div class="flex flex-col gap-3">
	<!-- Muted and inline, or iOS won't play it without a tap, or plays it full screen. -->
	<video
		{@attach scan}
		class="aspect-square w-full rounded-lg bg-black object-cover"
		muted
		playsinline
	></video>

	{#if cameras.length > 1}
		<label class="flex items-center gap-2 text-sm text-gray-600">
			{m.enroll_scan_camera()}
			<select
				class="min-w-0 flex-1 rounded-md border border-gray-300 px-2 py-1"
				value={active}
				onchange={(event) => (requested = event.currentTarget.value)}
			>
				{#each cameras as camera, index (camera.deviceId)}
					<option value={camera.deviceId}>{camera.label || `${index + 1}`}</option>
				{/each}
			</select>
		</label>
	{/if}
</div>
