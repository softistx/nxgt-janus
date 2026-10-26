/**
 * A FIFO semaphore: `limit(n)` returns a function that runs a task at once
 * while fewer than `n` run, and queues it otherwise. The next queued task
 * starts as soon as a running one settles — resolved, rejected, or thrown
 * synchronously. No dependency.
 */
export function limit(
	concurrency: number,
): <T>(task: () => Promise<T>) => Promise<T> {
	let running = 0;
	const waiting: Array<() => void> = [];

	const release = (): void => {
		const next = waiting.shift();
		if (next === undefined) running -= 1;
		// The slot passes straight to the next task: `running` is unchanged.
		else next();
	};

	const run = async <T>(task: () => Promise<T>): Promise<T> => {
		try {
			return await task();
		} finally {
			release();
		}
	};

	return async <T>(task: () => Promise<T>): Promise<T> => {
		if (running < concurrency) {
			running += 1;
			return run(task);
		}
		await new Promise<void>((resolve) => waiting.push(resolve));
		return run(task);
	};
}

/**
 * Reads a hasher's `concurrency` option: an integer from 1 to 64, or the
 * hasher's default when left out.
 */
export function concurrencyOf(
	hasher: string,
	value: number | undefined,
	fallback: number,
): number {
	const concurrency = value ?? fallback;
	if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 64) {
		throw new TypeError(
			`${hasher}: concurrency is how many hashes may run at once, an integer from 1 to 64 — ${fallback} is the default`,
		);
	}
	return concurrency;
}
