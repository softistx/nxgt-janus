/**
 * `@nxgt/janus-mongo` — the MongoDB adapter for `@nxgt/janus`.
 *
 * Implements all three stores of the `@nxgt/janus` store port, and the relation
 * store of `@nxgt/janus/permissions`, over one database, on `@nxgt/mongo`. It defines **no error class**: every refusal is `@nxgt/janus`'s
 * own, from the peer the application installed, so `instanceof` holds across
 * the two packages.
 */

export {
	createMongoAdapter,
	type MongoAdapter,
	syncMongoAdapter,
} from './adapter';
export { janusCollections, sessions, tokens, users } from './collections';
export {
	createMongoRelations,
	relations,
	syncMongoRelations,
} from './relations';
export { createMongoStores, syncMongoStores } from './stores';
