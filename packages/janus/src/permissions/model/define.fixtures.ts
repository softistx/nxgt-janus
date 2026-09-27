import type { ModelConfig } from './config';
import { defineModel } from './define';

export const subjects = ['patient', 'staff'] as const;

/** Defines from JavaScript: the types would refuse most of these first. */
export const define = (config: Record<string, unknown>) => () =>
	defineModel(config as unknown as ModelConfig as never);
