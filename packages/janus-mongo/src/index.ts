/**
 * `@nxgt/janus-mongo` — the MongoDB adapter for `@nxgt/janus`.
 *
 * Implements all three stores of the `@nxgt/janus` store port, over one database, on
 * `@nxgt/mongo`. It defines **no error class**: every refusal is `@nxgt/janus`'s
 * own, from the peer the application installed, so `instanceof` holds across
 * the two packages.
 */

export { janusCollections, sessions, tokens, users } from './collections';
export { createMongoStores, syncMongoStores } from './stores';
