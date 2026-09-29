import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * The lock around the Redis build, so two suites started at once — the root
 * `test` runs the packages in parallel — do not compile into the same
 * `.cache/redis/<version>` together, which fails both.
 *
 * `redis-memory-server` has a lock of its own, but it gives up waiting after
 * two minutes and takes a lock older than 110 seconds as stale, and the build
 * takes about two minutes: the second suite breaks in, or times out. This one
 * is a folder, made atomically by `mkdir`, holding the builder's PID; it waits
 * as long as that process lives, and is taken over once it died.
 */
const POLL_MS = 250;

/** Longer than any build measured; past it, the lock is reported, not taken. */
const WAIT_MS = 20 * 60_000;

/** Runs `build` while no other process builds `version` into `cache`. */
export async function underBuildLock<T>(
	cache: string,
	version: string,
	build: () => Promise<T>,
): Promise<T> {
	await mkdir(cache, { recursive: true });
	const lock = join(cache, `${version}.building`);
	await acquire(lock);
	try {
		return await build();
	} finally {
		await rm(lock, { recursive: true, force: true });
	}
}

async function acquire(lock: string): Promise<void> {
	const deadline = Date.now() + WAIT_MS;
	while (!(await tryLock(lock))) {
		const holder = await holderOf(lock);
		if (holder !== undefined && !isAlive(holder)) {
			await takeOver(lock, holder);
			continue;
		}
		if (Date.now() > deadline) {
			throw new Error(
				`test/build-lock.ts: ${lock} is still held after ${WAIT_MS / 60_000} minutes; remove it if no build is running`,
			);
		}
		await Bun.sleep(POLL_MS);
	}
}

/**
 * Clears a dead builder's lock. Only one waiter's `rename` can move it, so a
 * second waiter never removes the lock the first has taken since.
 */
async function takeOver(lock: string, holder: number): Promise<void> {
	const stale = `${lock}.stale.${process.pid}`;
	const moved = await rename(lock, stale).then(
		() => true,
		() => false,
	);
	if (!moved) return;
	if ((await holderOf(stale)) === holder) {
		await rm(stale, { recursive: true, force: true });
		return;
	}
	// Moved a lock taken since it was read: put it back, never remove it.
	await rename(stale, lock).catch(() => undefined);
}

async function tryLock(lock: string): Promise<boolean> {
	try {
		await mkdir(lock);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
		throw error;
	}
	await writeFile(join(lock, 'pid'), String(process.pid));
	return true;
}

/** The PID holding the lock, or `undefined` while it is still being written. */
async function holderOf(lock: string): Promise<number | undefined> {
	const text = await readFile(join(lock, 'pid'), 'utf8').then(
		(read) => read,
		() => '',
	);
	const pid = Number(text);
	return Number.isInteger(pid) && pid > 0 ? pid : undefined;
}

function isAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code !== 'ESRCH';
	}
}
