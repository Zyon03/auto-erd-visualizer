# Chat Message Cursor Pagination — Implementation Plan

**Status:** Implemented 2026-07-03. Ended up as two functions (`listChatMessages` unchanged + new `listChatMessagesPage`) rather than one function with optional params — see Task 1 note.

**Goal:** Long-running sessions accumulate a lot of `chat_messages` rows — every AI tool call writes a `system`-role row (`Added table...`, `Added field...`, etc.), so an actively-built session can easily reach hundreds of rows. `listChatMessages` currently has no limit: the session route loader fetches the *entire* history on every load/switch, and `ChatPanel` mounts a `ChatMessageBubble` (+ ReactMarkdown) for every single one, even though the panel is a small floating region (`max-h-64`, or `max-h-[70vh]` expanded) that only ever shows a handful at a time. Fix: load only the most recent slice by default, lazy-load older pages on demand.

**Why cursor pagination, not virtualization:** Virtualization (react-window-style — only render what's on screen) solves rendering cost but still fetches and holds the *entire* history in memory/network, which is the actual dominant cost here (query + payload + mount cost scale with total history, not with what's visible). Cursor pagination fixes the thing that's actually slow.

**Explicitly not in scope:** the AI's own turn-resolution logic. `agent/resolveTurnMessage.ts` already only reads the *tail* of history (walks backward to the last user/assistant message, collects trailing system notes) — it doesn't need full history either, and nothing here should change how `runTurn.ts` reads chat history for building agent context. This plan only touches the *display* path (the route loader and `ChatPanel`).

## Design

- Initial load: last ~50 messages only (tune after trying it — enough to fill the `expanded` (70vh) view plus scroll headroom without feeling clipped).
- "Load earlier messages": a trigger at the top of the scrollable history — either a manual button/link or an `IntersectionObserver` on a sentinel element that fires when scrolled near the top. Fetches the next page older than the oldest currently-loaded message id, and prepends it.
- Prepending old messages above the current scroll position needs explicit scroll-position preservation (adjust `scrollTop` by the newly-added content's height) — browsers don't do this automatically, and without it the view visibly jumps.

## Tasks

- [x] **1. `mutations/chatMessages.ts`: add pagination params to `listChatMessages`**
  - Implemented as a *separate* function, `listChatMessagesPage(db, sessionId, { limit, beforeId? })`, rather than optional params on `listChatMessages` itself — a shared function returning either `ChatMessage[]` or `{ messages, hasMore }` depending on whether `limit` was passed would need a messier overloaded/union return type for no real benefit, since the only unpaginated caller (`runTurn.ts`) always wants the plain array anyway. `listChatMessages` is untouched.
  - `limit` alone → most recent `limit` rows. `beforeId` + `limit` → the `limit` rows immediately before that id. Both query `ORDER BY id DESC LIMIT (limit + 1)` then reverse in JS for ascending display order, fetching one extra row so `hasMore` is answered by the same query instead of a separate count.

- [x] **2. `server-fns/chat.ts`: wire pagination through**
  - `listChatMessagesFn` now always pages (`CHAT_PAGE_SIZE = 50` constant), returning `{ messages, hasMore }`.
  - New `loadEarlierChatMessagesFn({ sessionId, beforeId })` for on-demand older pages.

- [x] **3. `routes/sessions.$sessionId.tsx`: loader fetches only the initial page**
  - Loader destructures `{ messages, hasMore }` from `listChatMessagesFn` and threads both `initialMessages` and a new `initialHasMoreOlderMessages` down through `SessionView` → `SessionContent` → `ChatPanel`.

- [x] **4. `components/chat/ChatPanel.tsx`: load-earlier UI + scroll preservation**
  - `hasMoreOlder`/`loadingOlder` state; `loadEarlierChatMessagesFn` called directly via `useServerFn` (matching how `ChatPanel` already calls `sendMessageFn`/`cancelTurnFn` itself, rather than threading yet another handler down from the route).
  - Plain "Load earlier messages" button (not an IntersectionObserver — see open questions below), rendered above the message list only while `hasMoreOlder`.
  - Scroll preservation: a `pendingScrollAdjustRef` captures `scrollHeight` right before the prepend; the existing scroll-pinning `useLayoutEffect` branches on it — if set, adjusts `scrollTop` by the height delta and skips its normal "pin to bottom" behavior (which would otherwise incorrectly yank the view down to the bottom every time an older page loads, since that effect already runs on any `messages` change).

- [x] **5. Tests**
  - `tests/mutations/chatMessages.test.ts`: 6 new cases covering most-recent-first ordering, `hasMore` at both boundary conditions (exact fit vs. room to spare), `beforeId` paging back through multiple pages to the very start, and session isolation.
  - `runTurn.ts`'s unpaginated call site (`listChatMessages`, no test file for that module) is untouched — confirmed by inspection, not a test, since no dedicated test exists for it.

## Open questions to resolve when picking this back up

- Exact initial page size (50 is a starting guess, not measured against a real long session).
- Manual "Load earlier" button vs. auto-trigger on scroll-near-top — shipped manual, per the original plan's own recommendation. Revisit if it feels clunky in practice.
