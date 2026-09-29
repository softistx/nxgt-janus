/** Resolves the device tokens' keys: the sealer that signs and checks them. */

import { resolveSealer } from '../sealing';
import type { DevicesConfig } from './janus-config';
import type { ResolvedConfig } from './resolved-config';

export function resolveDevices(
	config: DevicesConfig | undefined,
	where: string,
): ResolvedConfig['devices'] {
	if (config === undefined) return null;
	// `?.`: a JavaScript caller's `devices: null` gets resolveSealer's message.
	return { sealer: resolveSealer(config?.keys, `${where}: devices.keys`) };
}
