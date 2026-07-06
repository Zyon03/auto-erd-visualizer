import { useEffect, useRef, useState } from 'react'

export type SessionEventsStatus = 'open' | 'error'

export function useSessionEvents(sessionId: number, onEvent: (event: unknown) => void, onOpen?: () => void) {
  const handlerRef = useRef(onEvent)
  handlerRef.current = onEvent
  const openRef = useRef(onOpen)
  openRef.current = onOpen
  const [status, setStatus] = useState<SessionEventsStatus>('open')

  useEffect(() => {
    setStatus('open')
    const source = new EventSource(`/api/sessions/${sessionId}/events`)
    // Fires on the initial connection AND every automatic reconnect after a drop -- the one
    // reliable signal that this stream may just have missed events (e.g. a turn_complete
    // published while disconnected), so the caller gets a chance to reconcile against the
    // server's actual state instead of trusting whatever it last knew.
    source.onopen = () => {
      setStatus('open')
      openRef.current?.()
    }
    source.onmessage = (e) => {
      setStatus('open')
      handlerRef.current(JSON.parse(e.data))
    }
    source.onerror = () => {
      setStatus('error')
    }
    return () => source.close()
  }, [sessionId])

  return status
}
