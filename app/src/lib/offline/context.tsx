import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { get, set } from 'idb-keyval'
import { supabase } from '../supabase'
import { OfflineEngine, type KV, type RpcFn } from './engine'

const store: KV = { get: (k) => get(k) as never, set: (k, v) => set(k, v) }

const rpc: RpcFn = async (name, params) => {
  const { data, error } = await supabase.rpc(name, params)
  return { data, error: error ? { message: error.message, code: error.code } : null }
}

// navigator.onLine only means "has a network interface"; a weak/offline hospital link can still
// report true. We track it but the engine treats a failed request the same way either way.
function useOnline() {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}

const engine = new OfflineEngine({ rpc, store, isOnline: () => navigator.onLine })
let loaded = false

const Ctx = createContext<{ engine: OfflineEngine; online: boolean; version: number } | null>(null)

export function OfflineProvider({ children }: { children: ReactNode }) {
  const online = useOnline()
  const [version, setVersion] = useState(0)

  useEffect(() => {
    if (!loaded) {
      loaded = true
      engine.load()
    }
    return engine.subscribe(() => setVersion((v) => v + 1))
  }, [])

  return <Ctx.Provider value={{ engine, online, version }}>{children}</Ctx.Provider>
}

export function useOffline() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useOffline must be used inside <OfflineProvider>')
  return v
}
