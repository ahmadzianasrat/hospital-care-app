import { useCallback, useEffect, useState } from 'react'
import { supabase, FACILITY_TZ } from '../lib/supabase'
import { errMsg } from '../lib/format'
import type { RosterRow, StaffRow } from '../types'
import { ErrorBox } from './ui'

const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : '')

export default function Roster({ staffId, facilityId }: { staffId: string; facilityId?: string }) {
  const [rows, setRows] = useState<RosterRow[] | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [type, setType] = useState<'leave' | 'cover'>('leave')
  const [reason, setReason] = useState('')
  const [coverWith, setCoverWith] = useState('')
  const [staff, setStaff] = useState<StaffRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sentIds, setSentIds] = useState<Set<string>>(new Set())

  const load = useCallback(() => {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: FACILITY_TZ })
    supabase
      .from('roster_entries')
      .select('id, work_date, status, shift_types(name,start_time,end_time), wards(name)')
      .eq('staff_id', staffId)
      .eq('status', 'published')
      .gte('work_date', today)
      .order('work_date')
      .limit(7)
      .then(({ data }) => setRows((data ?? []) as unknown as RosterRow[]))
  }, [staffId])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (!facilityId || !openId) return
    supabase.from('staff').select('id, full_name, app_role, profession, active').eq('facility_id', facilityId).eq('active', true).neq('id', staffId).order('full_name')
      .then(({ data }) => setStaff((data ?? []) as StaffRow[]))
  }, [facilityId, openId, staffId])

  async function submit(entryId: string) {
    setBusy(true)
    setError(null)
    const { error } = await supabase.rpc('request_roster_change', {
      p_roster_entry_id: entryId, p_request_type: type, p_reason: reason.trim(),
      p_cover_staff_id: type === 'cover' ? coverWith || null : null,
    })
    setBusy(false)
    if (error) return setError(errMsg(error))
    setSentIds((s) => new Set(s).add(entryId))
    setOpenId(null)
    setReason('')
    setCoverWith('')
  }

  return (
    <section className="bg-white rounded-2xl shadow p-4">
      <h2 className="font-semibold mb-2">My upcoming shifts</h2>
      {rows === null && <p className="text-sm text-slate-500">Loading…</p>}
      {rows?.length === 0 && <p className="text-sm text-slate-500">No published shifts.</p>}
      <ul className="divide-y">
        {rows?.map((r) => (
          <li key={r.id} className="py-2 text-sm space-y-2">
            <div className="flex justify-between">
              <span>{r.work_date}</span>
              <span className="text-slate-600">
                {r.shift_types?.name} {hhmm(r.shift_types?.start_time)}–{hhmm(r.shift_types?.end_time)}
                {r.wards ? ` · ${r.wards.name}` : ''}
              </span>
            </div>
            {sentIds.has(r.id) ? (
              <p className="text-xs text-emerald-700">Request sent, waiting for approval.</p>
            ) : facilityId ? (
              openId === r.id ? (
                <div className="space-y-2 border-t pt-2">
                  <div className="flex gap-2">
                    <button onClick={() => setType('leave')} className={`flex-1 rounded-lg py-2 text-xs font-medium ${type === 'leave' ? 'bg-teal-700 text-white' : 'bg-slate-100'}`}>Request leave</button>
                    <button onClick={() => setType('cover')} className={`flex-1 rounded-lg py-2 text-xs font-medium ${type === 'cover' ? 'bg-teal-700 text-white' : 'bg-slate-100'}`}>Ask for cover</button>
                  </div>
                  {type === 'cover' && (
                    <select value={coverWith} onChange={(e) => setCoverWith(e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-2 text-xs bg-white">
                      <option value="">Who will cover?</option>
                      {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                    </select>
                  )}
                  <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" className="w-full rounded-lg border border-slate-300 px-2 py-2 text-xs" />
                  <ErrorBox message={error} />
                  <div className="flex gap-2">
                    <button
                      onClick={() => submit(r.id)}
                      disabled={busy || reason.trim().length < 3 || (type === 'cover' && !coverWith)}
                      className="flex-1 rounded-lg bg-teal-700 text-white text-xs font-semibold py-2 disabled:opacity-50"
                    >
                      Send request
                    </button>
                    <button onClick={() => setOpenId(null)} className="flex-1 rounded-lg bg-white border border-slate-300 text-xs py-2">Cancel</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setOpenId(r.id)} className="text-xs text-teal-700 underline">Request a change</button>
              )
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  )
}
