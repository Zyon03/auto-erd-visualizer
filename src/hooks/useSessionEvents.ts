import { useEffect, useRef, useState } from 'react'

export type SessionEventsStatus = 'open' | 'error'

export function useSessionEvents(sessionId: number, onEvent: (event: unknown) => void) {
  const handlerRef = useRef(onEvent)
  handlerRef.current = onEvent
  const [status, setStatus] = useState<SessionEventsStatus>('open')

  useEffect(() => {
    setStatus('open')
    const source = new EventSource(`/api/sessions/${sessionId}/events`)
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
