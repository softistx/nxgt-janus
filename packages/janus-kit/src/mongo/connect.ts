import { createMongoAdapter, syncMongoAdapter } from '@nxgt/janus-mongo';
import { connectMongo, type SyncReport } from '@nxgt/mongo';
import { type Db, MongoRuntimeError } from 'mongodb';
import type { HealthOf } from '../shared/health';
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
 * answer, or a collection or index `syncMongoAdapter` has not created,
 * rejects with an `Error` naming what to do — a URL the driver cannot read,
 * with a `TypeError` — after closing whatever it had opened. Collections that
 * only differ from these definitions start, with a process warning.
 */
export async function connectKit<A extends object, P extends object = never>(
	config: KitConfig<A, P>,
): Promise<Kit<A, P>> {
	checkConfig(config, 'connectKit');
	return await assembleKit(config, async (closers) => {
		const { db, opened } = await openMongo(config.mongo, closers);
		await assertSynced(db, opened);
		const { store, relations } = createMongoAdapter(db);
		return {
			database: mongoDatabase,
			db,
			store,
			relations,
			probe: (timeoutMs) => timed(() => db.command({ ping: 1 }), timeoutMs),
		};
	});
}

async function openMongo(
	mongo: MongoConfig,
	closers: Closers,
): Promise<{ db: Db; opened: boolean }> {
	if (mongo.url === undefined) return { db: mongo.db, opened: false };
	const connection = await connectMongo(mongo.url, {
		serverSelectionTimeoutMS: 5_000,
		...mongo.clientOptions,
	}).catch((cause: unknown) => {
		// A refused configuration — this URL already connected with other
		// options — is not an outage: it passes through as it is.
		if (cause instanceof TypeError) throw cause;
		// Nor is a URL the driver cannot read, refused before any server is
		// contacted — as Bun's `SQL` refuses one for `/drizzle`. Never quoted:
		// it may hold a password. `mongodb-connection-string-url` throws a
		// `MongoParseError` of its own, not the driver's class — measured — so
		// it is matched by name.
		if (
			cause instanceof MongoRuntimeError ||
			(cause instanceof Error && cause.name === 'MongoParseError')
		) {
			throw new TypeError(
				'connectKit: `mongo.url` is not a connection string the driver can read.',
				{ cause },
			);
		}
		throw new Error(
			'connectKit: MongoDB did not answer. Check `mongo.url`, and that the server is reachable.',
			{ cause },
		);
	});
	closers.push(() => connection.close());
	return { db: connection.db, opened: true };
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
	const missing = reports.flatMap((report) => {
		const lacks = unsafe(report);
		return lacks.length === 0 ? [] : [`${report.name} (${lacks.join(', ')})`];
	});
	if (missing.length > 0) {
		throw new Error(
			`connectKit: Janus's collections are not in sync with @nxgt/janus-mongo: ${missing.join(', ')}. Run syncMongoAdapter(db), a deployment step, against the database \`mongo\` names.`,
		);
	}
	const drifted = reports.flatMap((report) => {
		const differs = drift(report);
		return differs.length === 0
			? []
			: [`${report.name} (${differs.join(', ')})`];
	});
	if (drifted.length > 0) {
		process.emitWarning(
			`connectKit: Janus's collections differ from this @nxgt/janus-mongo's definitions: ${drifted.join(', ')}. Run syncMongoAdapter(db) once every instance runs this version.`,
			{ code: 'JANUS_KIT_COLLECTIONS_DRIFTED' },
		);
	}
}

/**
 * What would make the stores unsafe: a missing collection, or a missing
 * index — the login index keeps two users from sharing a login. It stops
 * the kit.
 */
function unsafe(report: SyncReport): string[] {
	if (report.created) return ['missing'];
	return report.indexes.created.length > 0 ? ['indexes'] : [];
}

/**
 * What differs from this process's definitions, in either direction: a
 * validator, an option, an index with other options. **Only a warning**: in a
 * rolling deploy, or a rollback, the previous release meets the next one's
 * collections, and must still start.
 */
function drift(report: SyncReport): string[] {
	if (report.created) return [];
	const differs: string[] = [];
	if (report.validator !== 'unchanged') differs.push('validator');
	if (
		report.options.changed.length > 0 ||
		report.options.immutable.length > 0
	) {
		differs.push('options');
	}
	if (report.indexes.recreated.length > 0) differs.push('indexes');
	return differs;
}
