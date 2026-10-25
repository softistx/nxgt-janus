import { describe, expect, it } from 'bun:test';
import { janusAvatarTypeDefs } from './sdl';

describe('janusAvatarTypeDefs', () => {
	it('is graphql/janus-avatar.graphqls, byte for byte', async () => {
		const shipped = await Bun.file(
			new URL('../../graphql/janus-avatar.graphqls', import.meta.url),
		).text();
		expect(janusAvatarTypeDefs).toBe(shipped);
	});
});
