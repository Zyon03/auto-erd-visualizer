import { describe, it, expect } from 'vitest'
import { buildMcpConfig } from '../../src/agent/buildMcpConfig'

describe('buildMcpConfig', () => {
  it('produces a valid mcp config JSON string pointing at the erd server', () => {
    const configJson = buildMcpConfig(42, '/tmp/auto-erd.db')
    const config = JSON.parse(configJson)

    expect(config.mcpServers.erd.command).toBe('npx')
    expect(config.mcpServers.erd.args).toContain('tsx')
    expect(config.mcpServers.erd.env.ERD_SESSION_ID).toBe('42')
    expect(config.mcpServers.erd.env.DATABASE_PATH).toBe('/tmp/auto-erd.db')
  })
})
