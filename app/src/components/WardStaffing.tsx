import { useCallback, useEffect, useState } from 'react'
import { supabase, FACILITY_TZ } from '../lib/supabase'
import { errMsg } from '../lib/format'
import type { ShiftTypeRow, StaffingRow, View, WardRow } from '../types'
import { BackBar, Card, ErrorBox } from './ui'

const dateStr = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: FACILITY_TZ })
const dayLabel = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: FACILITY_TZ })

export default function WardStaffing({ facilityId, go }: { facilityId: string; go: (v: View) => void }) {
  const [wards, setWards] = useState<WardRow[]>([])
  const [shiftTypes, setShiftTypes] = useState<ShiftTypeRow[]>([])
  const [rows, setRows] = useState<StaffingRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [reqWard, setReqWard] = useState('')
  const [reqShift, setReqShift] = useState('')
  const [reqMin, setReqMin] = useState('2')

  const load = useCallback(async () => {
    const today = new Date()
    const from = dateStr(today)
    const until = new Date(today)
    until.setDate(until.getDate() + 6)
    const to = dateStr(until)

    const { data, error } = await supabase.rpc('ward_staffing_overview', { p_from: from, p_to: to })
    if (error) return setError(errMsg(error))
    setError(null)
    setRows((data ?? []) as StaffingRow[])
  }, [])

  useEffect(() => {
    supabase.from('wards').select('id, code, name').eq('facility_id', facilityId).order('code').then(({ data }) => setWards((data ?? []) as WardRow[]))
    supabase.from('shift_types').select('*').eq('facility_id', facilityId).not('rotation_order', 'is', null).order('rotation_order')
      .then(({ data }) => setShiftTypes((data ?? []) as ShiftTypeRow[]))
    load()
  }, [facilityId, load])

  async function saveRequirement() {
    if (!reqWard || !reqShift) return
    setBusy(true)
    setError(null)
    const { error } = await supabase.rpc('set_ward_staffing_requirement', { p_ward_id: reqWard, p_shift_type_id: reqShift, p_min_staff: Number(reqMin) })
    setBusy(false)
    if (error) return setError(errMsg(error))
    load()
  }

  const byDay = new Map<string, StaffingRow[]>()
  for (const r of rows) {
    const key = r.work_date
    if (!byDay.has(key)) byDay.set(key, [])
    byDay.get(key)!.push(r)
  }

  return (
    <div className="space-y-3">
      <BackBar title="Ward staffing" onBack={() => go({ name: 'home' })} />
      <ErrorBox message={error} />

      <Card className="space-y-3">
        <h2 className="font-semibold">Set a minimum</h2>
        <select value={reqWard} onChange={(e) => setReqWard(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
          <option value="">Ward…</option>
          {wards.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <select value={reqShift} onChange={(e) => setReqShift(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
          <option value="">Shift…</option>
          {shiftTypes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <input type="number" min={0} value={reqMin} onChange={(e) => setReqMin(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <button onClick={saveRequirement} disabled={busy || !reqWard || !reqShift} className="w-full rounded-xl bg-teal-700 text-white font-semibold py-3 disabled:opacity-50">
          Save minimum
        </button>
      </Card>

      <h2 className="font-semibold text-sm text-slate-600">Next 7 days</h2>
      {rows.length === 0 && <Card><p className="text-sm text-slate-600">No staffing minimums set yet.</p></Card>}
      {[...byDay.entries()].map(([date, dayRows]) => (
        <Card key={date} className="space-y-1">
          <p className="font-medium text-sm">{dayLabel(date)}</p>
          {dayRows.map((r, i) => (
            <div key={i} className={`flex justify-between text-sm rounded-lg px-2 py-1 ${r.assigned < r.required ? 'bg-red-50 text-red-800 font-semibold' : 'bg-emerald-50 text-emerald-800'}`}>
              <span>{r.ward_name} - {r.shift_name}</span>
              <span>{r.assigned} / {r.required}</span>
            </div>
          ))}
        </Card>
      ))}
    </div>
  )
}
