import { useState, useEffect, useCallback } from 'react'
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

  const poll = useCallback(async () => {
    const result = await checkConnection()
    const now = new Date()
    setState({ connected: result.connected, lastChecked: now, reason: result.reason })

    // Write to connection log
    try {
      await db.connectionLog.add({ connected: result.connected, reason: result.reason, checkedAt: now })
      // Prune old entries
      const count = await db.connectionLog.count()
      if (count > MAX_LOG_ENTRIES) {
        const oldest = await db.connectionLog.orderBy('checkedAt').limit(count - MAX_LOG_ENTRIES).primaryKeys()
        await db.connectionLog.bulkDelete(oldest)
      }
    } catch { /* best-effort logging */ }
  }, [])

  useEffect(() => {
    poll()
    const id = setInterval(poll, POLL_INTERVAL)
    return () => clearInterval(id)
  }, [poll])

  return state
}
