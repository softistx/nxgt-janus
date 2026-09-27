import { LONGEST } from '../options';

/** The timers that wake the pump when a retry of this process's falls due. */
export interface Reminders {
	/** Wakes the pump at `dueAt` — or after the longest wait a timer holds. */
	add(dueAt: number): void;
	/** Clears every timer still set. */
	clear(): void;
}

/** Every timer is unref'd: none holds the process open. */
export function remindersOf(wake: (at: number) => void): Reminders {
	const timers = new Set<ReturnType<typeof setTimeout>>();
	return {
		add(dueAt) {
			const timer = setTimeout(
				() => {
					timers.delete(timer);
					wake(dueAt);
				},
				Math.min(Math.max(dueAt - Date.now(), 0), LONGEST),
			);
			timer.unref?.();
			timers.add(timer);
		},
		clear() {
			for (const timer of timers) clearTimeout(timer);
			timers.clear();
		},
	};
}
