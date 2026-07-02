import type { ChatMessage } from '../mutations/chatMessages'

export function resolveTurnMessage(priorMessages: ChatMessage[], userMessage: string): string {
  let lastUserOrAssistantIndex = -1
  for (let i = priorMessages.length - 1; i >= 0; i--) {
    if (priorMessages[i].role === 'user' || priorMessages[i].role === 'assistant') {
      lastUserOrAssistantIndex = i
      break
    }
  }

  const pendingSystemNotes = priorMessages
    .slice(lastUserOrAssistantIndex + 1)
    .filter((m) => m.role === 'system')
    .map((m) => `[${m.content}]`)

  return pendingSystemNotes.length > 0 ? `${pendingSystemNotes.join('\n')}\n\n${userMessage}` : userMessage
}
