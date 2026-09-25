import { createMongoAdapter, syncMongoAdapter } from '@nxgt/janus-mongo';
import type { SyncReport } from '@nxgt/mongo';
import type { Db } from 'mongodb';
import type { HealthOf, Probe } from '../shared/health';
import { timed } from '../shared/health';
import { assembleKit, type Closers, type KitOf } from '../shared/kit';
import {
	checkConfig,
	type KitConfig,
	type MongoConfig,
	mongoDatabase,
} from './config';

/** What `ping` answers: `{ ok, mongo, redis? }`. */
export type Health = HealthOf<'mongo'>;

/** What `connectKit` answers: `auth`, `access` when configured, and the rest. */
export type Kit<A extends object, P extends object> = KitOf<A, P, Db, 'mongo'>;

/**
 * Opens the connections, checks that Janus's collections are in sync, and
 * builds `auth` and `access` over them.
 *
 * ```ts
 * export const kit = await connectKit(config);
 * const current = await kit.auth.authenticate(request);
 * await kit.close(); // or `await using kit = await connectKit(config)`
 * ```
 *
 * **It fails here, not at the first sign-in**: a MongoDB that does not
 * answer, or collections `syncMongoAdapter` has not brought in line, reject
 * with an `Error` naming what to do, after closing whatever it had opened.
 */
export async function connectKit<A extends object, P extends object = never>(
	config: KitConfig<A, P>,
): Promise<Kit<A, P>> {
	checkConfig(config, 'connectKit');
	return await assembleKit(config, async (closers) => {
		const { db, probe, opened } = await openMongo(config.mongo, closers);
		await assertSynced(db, opened);
		const { store, relations } = createMongoAdapter(db);
		return { database: mongoDatabase, db, store, relations, probe };
	});
}

async function openMongo(
	mongo: MongoConfig,
	closers: Closers,
): Promise<{ db: Db; probe: Probe; opened: boolean }> {
	if (mongo.url === undefined) {
		const { db } = mongo;
		return {
			db,
			probe: (timeoutMs) => timed(() => db.command({ ping: 1 }), timeoutMs),
			opened: false,
		};
	}
	const { connectMongo } = await import('@nxgt/mongo');
	const connection = await connectMongo(mongo.url, {
		serverSelectionTimeoutMS: 5_000,
		...mongo.clientOptions,
	}).catch((cause: unknown) => {
		// A refused configuration — this URL already connected with other
		// options — is not an outage: it passes through as it is.
		if (cause instanceof TypeError) throw cause;
		throw new Error(
			'connectKit: MongoDB did not answer. Check `mongo.url`, and that the server is reachable.',
			{ cause },
		);
	});
	closers.push(() => connection.close());
	return {
		db: connection.db,
		probe: (timeoutMs) => connection.ping({ timeoutMS: timeoutMs }),
		opened: true,
	};
}

/**
 * The four collections, compared with `@nxgt/janus-mongo`'s definitions and
 * nothing written. A missing collection is worse here than a missing table:
 * MongoDB creates it on the first write, **without the unique index on
 * logins**, and two users could then share one.
 */
async function assertSynced(db: Db, opened: boolean) {
	let reports: SyncReport[];
	try {
		reports = await syncMongoAdapter(db, { dryRun: true });
	} catch (cause) {
		throw new Error(
			opened
				? 'connectKit: MongoDB did not answer. Check `mongo.url`, and that the server is reachable.'
				: 'connectKit: the Db in `mongo.db` did not answer.',
			{ cause },
		);
	}
	const behind = reports.flatMap((report) => {
		const differs = drift(report);
		return differs.length === 0
			? []
			: [`${report.name} (${differs.join(', ')})`];
	});
	if (behind.length > 0) {
		throw new Error(
			`connectKit: Janus's collections are not in sync with @nxgt/janus-mongo: ${behind.join(', ')}. Run syncMongoAdapter(db), a deployment step, against the database \`mongo\` names.`,
		);
	}
}

/** What `syncMongoAdapter` would change in one collection. */
function drift(report: SyncReport): string[] {
	if (report.created) return ['missing'];
	const differs: string[] = [];
	if (report.validator !== 'unchanged') differs.push('validator');
	if (
		report.options.changed.length > 0 ||
		report.options.immutable.length > 0
	) {
		differs.push('options');
	}
	if (
		report.indexes.created.length > 0 ||
		report.indexes.recreated.length > 0
	) {
		differs.push('indexes');
	}
	return differs;
}
