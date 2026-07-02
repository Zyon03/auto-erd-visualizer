import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import readline from 'node:readline'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from '../db/schema'
import { addChatMessage, listChatMessages, type ChatMessage } from '../mutations/chatMessages'
import { getSession, setClaudeSessionId, clearClaudeSessionId } from '../mutations/sessions'
import { buildMcpConfig } from './buildMcpConfig'
import { createStreamJsonParser } from './parseStreamJson'
import { resolveTurnMessage } from './resolveTurnMessage'
import { registerRunningTurn, clearRunningTurn } from './runningTurns'

type Db = BetterSQLite3Database<typeof schema>

const TIMEOUT_MS = 5 * 60 * 1000

const SYSTEM_PROMPT =
  'You are an ERD-building assistant embedded in a personal tool. The user describes a data model in conversation; ' +
  'use the provided erd tools to incrementally build an entity-relationship diagram that matches what they describe. ' +
  'Call get_schema first if you need to see the current state. Give relationships a short, plain-language aiComment ' +
  'describing what the relationship means. You have no capabilities beyond the provided erd tools in this session.'

const ALLOWED_TOOLS = [
  'mcp__erd__get_schema',
  'mcp__erd__add_table',
  'mcp__erd__rename_table',
  'mcp__erd__delete_table',
  'mcp__erd__add_field',
  'mcp__erd__rename_field',
  'mcp__erd__update_field',
  'mcp__erd__delete_field',
  'mcp__erd__add_relationship',
  'mcp__erd__update_relationship',
  'mcp__erd__delete_relationship',
].join(',')

export type TurnEvent =
  | { type: 'tool_step'; toolName: string; stepText: string }
  | { type: 'assistant_note'; text: string }
  | { type: 'turn_complete'; text: string }
  | { type: 'turn_error'; message: string }

export function runTurn(
  db: Db,
  sessionId: number,
  rawUserMessage: string,
  databasePath: string,
  onEvent: (event: TurnEvent) => void,
): ChatMessage {
  const session = getSession(db, sessionId)
  if (!session) throw new Error(`Session ${sessionId} not found`)

  // Read history and resolve pending system notes BEFORE inserting this turn's user
  // message -- otherwise this message would immediately become the "last user message"
  // and resolveTurnMessage's pending-notes window would always be empty.
  const priorMessages = listChatMessages(db, sessionId)
  const resolvedMessage = resolveTurnMessage(priorMessages, rawUserMessage)
  const userMessageRow = addChatMessage(db, sessionId, 'user', rawUserMessage)

  const isFirstTurn = !session.claudeSessionId
  const claudeSessionId = session.claudeSessionId ?? randomUUID()
  if (isFirstTurn) {
    setClaudeSessionId(db, sessionId, claudeSessionId)
  }

  const mcpConfig = buildMcpConfig(sessionId, databasePath)

  const args = [
    '-p',
    resolvedMessage,
    isFirstTurn ? '--session-id' : '--resume',
    claudeSessionId,
    '--output-format',
    'stream-json',
    '--verbose',
    '--mcp-config',
    mcpConfig,
    '--strict-mcp-config',
    '--allowedTools',
    ALLOWED_TOOLS,
    '--setting-sources',
    '',
    '--disable-slash-commands',
    '--system-prompt',
    SYSTEM_PROMPT,
  ]

  if (session.model) {
    args.push('--model', session.model)
  }

  const child = spawn('claude', args, { cwd: process.cwd() })
  const parser = createStreamJsonParser()
  const rl = readline.createInterface({ input: child.stdout })

  let streamedAnything = false
  let settled = false
  let cancelledByUser = false

  registerRunningTurn(sessionId, {
    cancel: () => {
      cancelledByUser = true
      child.kill('SIGTERM')
    },
  })

  const watchdog = setTimeout(() => {
    if (settled) return
    child.kill('SIGTERM')
    finish({ type: 'turn_error', message: 'The AI stopped responding and was cancelled after 5 minutes of inactivity.' })
  }, TIMEOUT_MS)

  function resetWatchdog() {
    watchdog.refresh()
  }

  function finish(event: TurnEvent) {
    if (settled) return
    settled = true
    clearTimeout(watchdog)
    clearRunningTurn(sessionId)

    if (event.type === 'turn_error' && !streamedAnything && !cancelledByUser) {
      clearClaudeSessionId(db, sessionId)
    }

    if (event.type === 'turn_complete' && event.text) {
      addChatMessage(db, sessionId, 'assistant', event.text)
    } else if (event.type === 'turn_error') {
      addChatMessage(db, sessionId, 'system', event.message)
    }

    onEvent(event)
  }

  rl.on('line', (line) => {
    resetWatchdog()
    streamedAnything = true

    for (const evt of parser.parseLine(line)) {
      if (evt.kind === 'tool_step') {
        addChatMessage(db, sessionId, 'system', evt.stepText)
        onEvent({ type: 'tool_step', toolName: evt.toolName, stepText: evt.stepText })
      } else if (evt.kind === 'assistant_text') {
        // Transient narration, not a durable log entry — published over SSE only, never
        // written to chat_messages (unlike tool_step's system notes or the final turn_complete).
        onEvent({ type: 'assistant_note', text: evt.text })
      } else if (evt.kind === 'turn_result') {
        finish(evt.success ? { type: 'turn_complete', text: evt.text } : { type: 'turn_error', message: evt.text || 'The AI turn ended with an error.' })
      }
    }
  })

  child.on('error', () => {
    finish({ type: 'turn_error', message: 'Failed to start the AI agent process.' })
  })

  child.on('close', (code) => {
    if (settled) return
    if (cancelledByUser) {
      finish({ type: 'turn_error', message: 'Stopped.' })
      return
    }
    finish(
      code === 0
        ? { type: 'turn_complete', text: '' }
        : { type: 'turn_error', message: `The AI process exited unexpectedly (code ${code}).` },
    )
  })

  return userMessageRow
}
