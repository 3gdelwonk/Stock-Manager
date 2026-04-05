import { useState, useEffect, useRef } from 'react'
import { checkConnection } from './jarvis'
import { db } from './db'

export interface ConnectionState {
  connected: boolean | null
  lastChecked: Date | null
  reason?: string
}

const POLL_INTERVAL = 60_000 // 60 seconds
const MAX_LOG_ENTRIES = 100

export function useConnectionMonitor(): ConnectionState {
  const [state, setState] = useState<ConnectionState>({ connected: null, lastChecked: null })
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let cancelled = false

    async function poll() {
      const result = await checkConnection()
      if (cancelled) return
      const now = new Date()
      setState({ connected: result.connected, lastChecked: now, reason: result.reason })

      // Write to connection log (best-effort)
      try {
        await db.connectionLog.add({ connected: result.connected, reason: result.reason, checkedAt: now })
        const count = await db.connectionLog.count()
        if (count > MAX_LOG_ENTRIES) {
          const oldest = await db.connectionLog.orderBy('checkedAt').limit(count - MAX_LOG_ENTRIES).primaryKeys()
          await db.connectionLog.bulkDelete(oldest)
        }
      } catch { /* best-effort logging */ }

      // Schedule next poll only after current completes (avoids overlap)
      if (!cancelled) {
        timerRef.current = setTimeout(poll, POLL_INTERVAL)
      }
    }

    poll()
    return () => {
      cancelled = true
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return state
}
