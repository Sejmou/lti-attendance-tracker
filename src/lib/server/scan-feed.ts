import { EventEmitter } from 'node:events';

export type FeedScan = {
	id: string;
	eventId: string;
	firstName: string;
	lastName: string;
	at: number;
	/** Which way it counts as things stand: see `direction`. */
	direction: 'in' | 'out';
	/** How many people have scanned for the event now, this scan included. */
	present: number;
};

/**
 * Fans each new scan out to the open code screens, so a name nobody at the
 * door recognises shows up while its owner is still in the room.
 *
 * ponytail: in-process, like the throttle. One box at one event; a second
 * instance would need something like Postgres LISTEN or Redis pub/sub.
 */
const emitter = new EventEmitter().setMaxListeners(0);

export function publishScan(scan: FeedScan) {
	emitter.emit('scan', scan);
}

export function onScan(listener: (scan: FeedScan) => void) {
	emitter.on('scan', listener);
	return () => void emitter.off('scan', listener);
}
