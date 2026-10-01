import type { Session } from '@supabase/supabase-js'
import { supabase, FACILITY_TZ } from '../lib/supabase'
import { useState } from 'react'
import { useNow } from '../hooks'
import FeedbackForm from './FeedbackForm'
import { ROLE_LABELS, type AccessStatus } from '../types'
import BreakGlass from './BreakGlass'
import Roster from './Roster'
import Workspace from './Workspace'

type Props = {
  session: Session
  access: {
    status: AccessStatus | null
    error: string | null
    loading: boolean
    refresh: () => void
    stale: boolean
    checkedAt: string | null
  }
}

// The gate: decides between "loading", "problem", "not on duty" and the real app.
// A network error is NOT treated as a "problem" once we already know who this is - it only means
// we could not re-confirm duty status just now. The app keeps working with the last answer, and
// StaleBanner says so. Only a real error, or having nothing at all, blocks the screen.
export default function Home({ session, access }: Props) {
  const now = useNow()
  const [showFeedback, setShowFeedback] = useState(false)
  const { status, error, loading, refresh, stale, checkedAt } = access
  const clock = now.toLocaleTimeString('en-GB', { timeZone: FACILITY_TZ, hour: '2-digit', minute: '2-digit' })

  if (loading) return <p className="text-slate-500">Loading…</p>

  if (error && !status) {
    return (
      <div className="space-y-3">
        <p className="rounded-xl bg-red-50 border border-red-300 p-4 text-sm">{error}</p>
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

  if (status.on_duty) {
    return (
      <>
        <StaleBanner stale={stale} checkedAt={checkedAt} />
        <Workspace status={status} />
      </>
    )
  }

  if (showFeedback) return <FeedbackForm onBack={() => setShowFeedback(false)} />

  return (
    <div className="space-y-4">
      <StaleBanner stale={stale} checkedAt={checkedAt} />
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
      <Roster staffId={status.staff_id} facilityId={status.facility_id} />
      <button onClick={() => setShowFeedback(true)} className="w-full rounded-xl bg-white border border-slate-300 py-3 font-medium">
        Report a problem
      </button>
      <SignOut />
    </div>
  )
}

// Tells the truth when we are running on a cached answer instead of a fresh one, rather than
// silently pretending everything is confirmed.
function StaleBanner({ stale, checkedAt }: { stale: boolean; checkedAt: string | null }) {
  if (!stale) return null
  const time = checkedAt
    ? new Date(checkedAt).toLocaleTimeString('en-GB', { timeZone: FACILITY_TZ, hour: '2-digit', minute: '2-digit' })
    : null
  return (
    <p className="rounded-xl bg-slate-800 text-white text-sm p-3">
      Offline: showing your status as of {time ?? 'last connection'}. It will re-check automatically once you are
      back online.
    </p>
  )
}

function SignOut() {
  return (
    <button onClick={() => supabase.auth.signOut()} className="w-full rounded-xl bg-white border border-slate-300 py-3 font-medium">
      Sign out
    </button>
  )
}
