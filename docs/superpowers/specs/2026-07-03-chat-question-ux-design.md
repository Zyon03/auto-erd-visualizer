# Chat Panel — Pending-Question Drawer & Thinking Indicator

## Purpose

Two related problems in the chat panel (`src/components/chat/ChatPanel.tsx`, `src/components/chat/ChatMessageBubble.tsx`):

1. **Bug:** when the AI calls the `ask_question` MCP tool, the choice buttons render but are sometimes permanently disabled and unclickable, with no way to recover.
2. **UX gap:** even when clickable, the question is rendered as just another inline chat bubble. It's easy to miss, and nothing signals that the AI is blocked waiting on a reply.

This spec also covers a related, smaller ask: the only feedback while the AI is working is a static `"Thinking..."` input placeholder, with no visible activity or sense of elapsed time.

## Root Cause (the bug)

`ChatMessageBubble`'s question rendering is only clickable when it's positionally the *last* message: `interactive={index === visibleMessages.length - 1}` (`ChatPanel.tsx`). The system prompt only tells the model to stop calling tools after `ask_question` — it doesn't forbid closing prose. When the model's turn ends with any trailing text, `turn_complete` appends that text as a new assistant message (`ChatPanel.tsx`, the `if (event.text)` branch), which becomes the new last message. The question card's `interactive` flips to `false` and never recovers, since the array only grows. This is a structural bug, not a timing one — "is this question still answerable" must not depend on array position.

## Design

### 1. Derived pending-question state (the fix)

Replace the position-based `interactive` check with a derived value in `ChatPanel`:

```ts
const pendingQuestion = useMemo(() => {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role === 'user') return null
    if (m.role === 'assistant') {
      const q = decodeQuestion(m.content)
      return q ? { ...q, messageId: m.id } : null
    }
    // role === 'system' (tool-step / error) — keep scanning backward
  }
  return null
}, [messages])
```

Scanning backward: hitting a `user` message first means the most recent AI activity has already been replied to — nothing pending. Hitting a question-decoding `assistant` message first means it's pending, **regardless of what non-question assistant text came after it** — trailing prose no longer buries the question. Hitting a non-question `assistant` message first (the AI's normal reply, no question involved) means nothing pending.

This is single-source-of-truth (derived from `messages`, no separate state to keep in sync), self-clears the instant the user's reply is appended (already how `handleSend` works today — no new logic needed there), and works identically on a fresh page load or a live update, so a mid-question page refresh still shows the question as answerable.

`ChatMessageBubble`'s question rendering in the scrollback becomes **permanently read-only** — no click handlers, no `interactive`/`disabled` props. It's a historical record; all live interaction moves to the new drawer (below). The `interactive` prop is removed from `ChatMessageBubble` entirely.

### 2. `PendingQuestionDrawer` component

A new component absorbing the current `QuestionCard`'s live-interaction logic (single-select pills, multi-select pills + Send button, "Other…" free-text field) — that logic is lifted out of `ChatMessageBubble.tsx` rather than duplicated.

**Placement:** rendered in `ChatPanel` between the scrollable history and the input row. Visible whenever `pendingQuestion` is set, **regardless of `chatMode`** (full/compact/expanded) — collapsing the history never hides it, since it's the reason the panel is blocked.

**Visual treatment:** bordered container with an accent-colored border/glow (distinct from the neutral `border-line` used elsewhere), a `HelpCircle` icon, and a small "Waiting for your answer" label, so the blocked state reads clearly without needing motion.

**Behavior:** buttons are `disabled={turnInFlight}` — same flag as today. This is still correct and necessary (a second concurrent `claude -p --resume` process must not spawn before the first one's process has actually exited — see the existing comment in `ChatPanel.tsx`'s `ask_question` handler), but it's no longer a permanent trap, since `pendingQuestion` is now robust to trailing messages. In practice this disables the drawer for the brief window between the `ask_question` SSE event and `turn_complete`, as originally intended.

Answering — via a drawer choice pill, the multi-select Send button, the drawer's Other field, or simply typing a reply directly in the main chat input — all funnel into the existing `handleSend`, which appends a `user` message and thereby clears `pendingQuestion` automatically. No special-casing needed for "answer via main input" since that path already exists. The only change on the main input side is cosmetic: its placeholder becomes `"Type your answer…"` while a question is pending.

### 3. Thinking indicator

Currently the status row only renders when `workingNote` is truthy, so there's a gap with **zero feedback** between hitting Send and the first SSE event arriving. Changes to `ChatPanel.tsx`:

- The status row's render condition changes from `{workingNote && (...)}` to `{turnInFlight && (...)}`, with the label falling back to `"Thinking…"` when `workingNote` is `null`.
- A small spinner (lucide `Loader2` with `animate-spin`) replaces the existing static pulsing dot in that row.
- An `elapsedSeconds` counter starts at 0 the instant `turnInFlight` becomes `true` (a `setInterval` ticking once per second), resets to 0 on each new send, and stops when the turn ends. It runs continuously for the whole turn — not reset per step — so `"Thinking… 4s"` becomes `"Adding a table… 11s"` as the turn progresses, giving a true sense of total wait time.

## Component/File Changes

- `src/components/chat/ChatPanel.tsx`: add `pendingQuestion` (`useMemo`), add `elapsedSeconds` state + interval effect, render `PendingQuestionDrawer`, update the status row condition/label, update input placeholder, remove `interactive` prop from `ChatMessageBubble` usage.
- `src/components/chat/ChatMessageBubble.tsx`: `QuestionCard` becomes read-only (no `onAnswer`/`interactive`/`disabled` props); its interactive pieces (choice pills, multi-select Send, Other field) move to the new component.
- `src/components/chat/PendingQuestionDrawer.tsx` (new): the extracted interactive question UI, taking `pendingQuestion`, `disabled`, and `onAnswer`.

## Testing Approach

- Unit test for the `pendingQuestion` derivation logic (pure function once extracted, or tested via the existing `questionMessage`/message-array patterns already used in `tests/agent/`) — covers: no messages, a question with no reply, a question followed by trailing assistant prose (the regression case), a question followed by a user reply, and a question followed by tool-step/system messages only.
- Manual testing for the drawer's visual states, the elapsed-seconds counter, and the full ask → drawer → answer → resumed-turn flow — matches the project's existing approach of manual testing for chat/agent live-UI behavior (per `2026-07-02-auto-erd-chat-agent-design.md`).

## Scope Notes / Explicitly Out of Scope

- No dismiss/close control on the drawer — it's not a blocking modal (the canvas and rest of the chat panel remain usable), it simply stays visible until answered.
- No change to the "Stop" button's behavior; if a turn is stopped before a question is asked, there's nothing to clear. If stopped after a question was already asked and answered is pending, the drawer correctly remains (per the derivation logic) since no `user` reply was added.
- No change to the backend agent loop, MCP tool, or system prompt — this is purely a frontend state/UI fix.
