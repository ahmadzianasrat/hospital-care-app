import { isConfigured } from './lib/supabase'
import { OfflineProvider } from './lib/offline/context'
import { useSession, useAccessStatus, useIdleLogout } from './hooks'
import Login from './components/Login'
import Home from './components/Home'

const IDLE_MINUTES = 10

export default function App() {
  const { session, loading } = useSession()
  const access = useAccessStatus(session)
  useIdleLogout(Boolean(session), IDLE_MINUTES)

  if (!isConfigured) {
    return (
      <Shell>
        <div className="rounded-xl bg-amber-50 border border-amber-300 p-4 text-sm">
          <p className="font-semibold mb-1">Setup needed</p>
          <p>
            Copy <code>.env.example</code> to <code>.env</code>, fill in your Supabase URL and anon key, then restart
            <code> npm run dev</code>.
          </p>
        </div>
      </Shell>
    )
  }

  if (loading) return <Shell><p className="text-slate-500">Loading…</p></Shell>
  if (!session) return <Shell><Login /></Shell>

  return (
    <OfflineProvider>
      <Shell>
        <Home session={session} access={access} />
      </Shell>
    </OfflineProvider>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full flex justify-center">
      <div className="w-full max-w-md p-4 space-y-4">{children}</div>
    </div>
  )
}
