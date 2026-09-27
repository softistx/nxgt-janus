import { mintId, type SessionRecord } from '@nxgt/janus';

// What the stores.*.spec.ts files share beside test/case.ts's redisPerFile():
// the expiry the sessions they insert run to, and the sessions themselves.

export const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

export function session(overrides: Partial<SessionRecord> = {}): SessionRecord {
	return {
		id: mintId(),
		tokenHash: mintId().replaceAll('-', ''),
		userId: mintId(),
		authenticatedAt: new Date(),
		expiresAt,
		revokedAt: null,
		createdAt: new Date(),
		...overrides,
	};
}
