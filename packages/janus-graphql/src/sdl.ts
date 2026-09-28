/**
 * The directives and the enum this package reads, as SDL: put it beside your
 * own type definitions. The same text ships as `graphql/janus.graphqls`, for
 * a code generator or an editor that reads files — `sdl.spec.ts` holds that
 * the two are identical.
 *
 * ```ts
 * createSchema({ typeDefs: [janusTypeDefs, typeDefs], resolvers });
 * ```
 */
export const janusTypeDefs: string = `"""
Only a signed-in user reaches this field, or every field of this type or
interface. With \`type\`, only a user of one of these user types: any other is
answered FORBIDDEN.
"""
directive @authenticated(
	type: [String!]
) on OBJECT | INTERFACE | FIELD_DEFINITION

"""
What a denied \`@permission\` answers.
"""
enum PermissionDenial {
	"""
	404: the object is not told to exist. The default.
	"""
	NOT_FOUND
	"""
	403: the object exists, and this user may not do this to it.
	"""
	FORBIDDEN
}

"""
Only a user holding permission \`name\` on the object of \`type\` whose id \`id\`
reads reaches this field, or every field of this type or interface. \`id\` is
\`args.<path>\` or \`parent.<path>\`: \`args.id\` on a field and \`parent.id\` on a
type or an interface when absent. A list of ids requires the permission on
every one. Repeated, every one must hold, in the order written.
"""
directive @permission(
	name: String!
	type: String!
	id: String
	onDeny: PermissionDenial! = NOT_FOUND
) repeatable on OBJECT | INTERFACE | FIELD_DEFINITION
`;
