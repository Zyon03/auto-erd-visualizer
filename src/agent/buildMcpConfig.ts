import path from 'node:path'

export function buildMcpConfig(sessionId: number, databasePath: string): string {
  return JSON.stringify({
    mcpServers: {
      erd: {
        command: 'npx',
        args: ['tsx', path.join(process.cwd(), 'src/mcp/server.ts')],
        env: {
          ERD_SESSION_ID: String(sessionId),
          DATABASE_PATH: databasePath,
        },
      },
    },
  })
}
