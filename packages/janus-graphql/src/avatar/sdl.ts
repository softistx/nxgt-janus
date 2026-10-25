/**
 * The opt-in avatar type as SDL: put it beside your own type definitions when
 * accounts have avatars. The same text ships as
 * `graphql/janus-avatar.graphqls` — `sdl.spec.ts` holds that the two are
 * identical.
 *
 * `updatedAt` is an ISO-8601 `String` rather than a `DateTime`: the package
 * defines no scalar, so it cannot collide with the one your schema already
 * declares, or force you to declare one.
 *
 * ```ts
 * createSchema({ typeDefs: [janusTypeDefs, janusAvatarTypeDefs, typeDefs], resolvers });
 * ```
 */
export const janusAvatarTypeDefs: string = `"""
The image of an account, as the application's resolvers hand it out.
\`updatedAt\` is an ISO-8601 string, so the type needs no scalar.
"""
type JanusAvatar {
	"""
	The id the application stored the image under; changes with every upload.
	"""
	id: ID!
	"""
	When the avatar was set, as an ISO-8601 string.
	"""
	updatedAt: String!
	"""
	The URL of the application's own route that streams the image at this
	size, behind its session and access check. Never a public URL.
	"""
	url(size: Int!): String!
}
`;
