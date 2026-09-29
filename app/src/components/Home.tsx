import type { Session } from '@supabase/supabase-js'
import { supabase, FACILITY_TZ } from '../lib/supabase'
import { useNow } from '../hooks'
import { ROLE_LABELS, type AccessStatus } from '../types'
import BreakGlass from './BreakGlass'
import Roster from './Roster'
import Workspace from './Workspace'

type Props = {
  session: Session
  access: { status: AccessStatus | null; error: string | null; loading: boolean; refresh: () => void }
}

// The gate: decides between "loading", "problem", "not on duty" and the real app.
export default function Home({ session, access }: Props) {
  const now = useNow()
  const { status, error, loading, refresh } = access
  const clock = now.toLocaleTimeString('en-GB', { timeZone: FACILITY_TZ, hour: '2-digit', minute: '2-digit' })

  if (loading) return <p className="text-slate-500">Loading…</p>

  if (error) {
    return (
      <div className="space-y-3">
        <p className="rounded-xl bg-red-50 border border-red-300 p-4 text-sm">Could not reach the database: {error}</p>
        <SignOut />
      </div>
    )
  }

  if (!status) {
    return (
      <div className="space-y-3">
        <p className="rounded-xl bg-amber-50 border border-amber-300 p-4 text-sm">
          You are signed in as <b>{session.user.email}</b>, but this login is not linked to a staff record. Ask an admin.
        </p>
        <SignOut />
      </div>
    )
  }

  if (status.on_duty) return <Workspace status={status} />

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold">{status.full_name}</h1>
          <p className="text-sm text-slate-600">{ROLE_LABELS[status.app_role] ?? status.app_role} · {status.facility_code}</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold tabular-nums">{clock}</p>
          <p className="text-xs text-slate-500">Facility time</p>
        </div>
      </header>
      <div className="rounded-xl bg-slate-100 border border-slate-300 p-4">
        <p className="font-semibold">Not on duty right now.</p>
        <p className="text-sm text-slate-600">
          Patient data opens 5 minutes before your shift and closes 15 minutes after it ends. You can still see your shifts below.
        </p>
      </div>
      <BreakGlass onDone={refresh} />
      <Roster staffId={status.staff_id} />
      <SignOut />
    </div>
  )
}

function SignOut() {
  return (
    <button onClick={() => supabase.auth.signOut()} className="w-full rounded-xl bg-white border border-slate-300 py-3 font-medium">
      Sign out
    </button>
  )
}
