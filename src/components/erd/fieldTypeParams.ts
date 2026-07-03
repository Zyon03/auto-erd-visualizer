/** Types where a length genuinely affects storage/validation. int/bigint historically had a
 *  MySQL "display width" (e.g. int(11)), but it's vestigial in modern practice — doesn't affect
 *  storage, range, or validation in any database — so it's deliberately excluded here rather than
 *  included just because the AI or a user might expect to see it. */
export const TYPES_WITH_LENGTH: readonly string[] = ['varchar', 'char']

/** Types where precision+scale (two numbers, e.g. decimal(10,2)) matter. */
export const TYPES_WITH_PRECISION: readonly string[] = ['decimal', 'float']

export interface ParsedFieldType {
  base: string
  params: string[]
}

/** `Field.type` is a single free-text column (e.g. "varchar(255)", "decimal(10,2)", "int") — the
 *  AI already writes lengths this way per the system prompt, so parsing/reformatting this one
 *  string is how the manual UI adds length/precision editing without any schema or tool-call
 *  shape change. */
export function parseFieldType(type: string): ParsedFieldType {
  const match = type.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\((.*)\)$/)
  if (!match) return { base: type, params: [] }
  const [, base, paramsRaw] = match
  const params = paramsRaw
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
  return { base, params }
}

export function formatFieldType(base: string, params: string[]): string {
  const cleaned = params.map((p) => p.trim()).filter((p) => p.length > 0)
  return cleaned.length > 0 ? `${base}(${cleaned.join(',')})` : base
}
