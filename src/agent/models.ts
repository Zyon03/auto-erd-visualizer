/** Aliases accepted by `claude --model` for the latest release in each family. */
export const MODEL_OPTIONS = ['sonnet', 'opus', 'haiku', 'fable'] as const
export type ModelOption = (typeof MODEL_OPTIONS)[number]
