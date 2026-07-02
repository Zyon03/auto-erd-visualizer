import { useEffect, useRef } from 'react'

export function useSessionEvents(sessionId: number, onEvent: (event: unknown) => void) {
  const handlerRef = useRef(onEvent)
  handlerRef.current = onEvent

  useEffect(() => {
    const source = new EventSource(`/api/sessions/${sessionId}/events`)
    source.onmessage = (e) => {
      handlerRef.current(JSON.parse(e.data))
    }
    return () => source.close()
  }, [sessionId])
}
