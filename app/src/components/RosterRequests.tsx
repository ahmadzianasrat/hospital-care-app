import { useCallback, useEffect, useState } from 'react'
import { supabase, FACILITY_TZ } from '../lib/supabase'
import { errMsg } from '../lib/format'
import type { RosterRequestRow, View } from '../types'
import { BackBar, Card, ErrorBox, TextArea } from './ui'

const dayLabel = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: FACILITY_TZ })

export default function RosterRequests({ go }: { go: (v: View) => void }) {
  const [rows, setRows] = useState<RosterRequestRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [note, setNote] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('roster_requests')
      .select('id, request_type, reason, status, roster_entry_id, cover_staff_id, staff:staff_id(full_name,app_role), cover_staff:cover_staff_id(full_name,app_role), roster_entries(work_date, shift_types(name))')
      .eq('status', 'pending')
      .order('created_at')
    if (error) return setError(errMsg(error))
    setRows((data ?? []) as unknown as RosterRequestRow[])
  }, [])
  useEffect(() => { load() }, [load])

  async function decide(id: string, approve: boolean) {
    setBusyId(id)
    const { error } = await supabase.rpc('decide_roster_request', { p_request_id: id, p_approve: approve, p_note: note[id] ?? null })
    setBusyId(null)
    if (error) setError(errMsg(error))
    else load()
  }

  return (
    <div className="space-y-3">
      <BackBar title="Roster requests" onBack={() => go({ name: 'home' })} />
      <ErrorBox message={error} />
      {rows.length === 0 && <Card><p className="text-sm text-slate-600">No pending requests.</p></Card>}
      {rows.map((r) => (
        <Card key={r.id} className="space-y-2">
          <p className="font-medium">{r.staff?.full_name} - {r.request_type === 'leave' ? 'Leave request' : 'Cover request'}</p>
          <p className="text-sm text-slate-600">
            {r.roster_entries && `${dayLabel(r.roster_entries.work_date)} · ${r.roster_entries.shift_types?.name ?? ''}`}
          </p>
          <p className="text-sm">{r.reason}</p>
          {r.request_type === 'cover' && <p className="text-sm">Proposed cover: <b>{r.cover_staff?.full_name}</b></p>}
          <TextArea label="Note (optional)" value={note[r.id] ?? ''} onChange={(v) => setNote((n) => ({ ...n, [r.id]: v }))} rows={2} />
          <div className="flex gap-2">
            <button onClick={() => decide(r.id, true)} disabled={busyId === r.id} className="flex-1 rounded-xl bg-teal-700 text-white font-semibold py-3 disabled:opacity-50">Approve</button>
            <button onClick={() => decide(r.id, false)} disabled={busyId === r.id} className="flex-1 rounded-xl bg-white border border-red-400 text-red-700 py-3 disabled:opacity-50">Deny</button>
          </div>
        </Card>
      ))}
    </div>
  )
}
