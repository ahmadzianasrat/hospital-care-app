import { useCallback, useEffect, useState } from 'react'
import { supabase, FACILITY_TZ } from '../lib/supabase'
import { errMsg } from '../lib/format'
import type { ShiftTypeRow, StaffRow, View, WardRow } from '../types'
import { BackBar, Card, ErrorBox } from './ui'

const SHIFT_COLOR: Record<string, string> = {
  morning: 'bg-amber-100 text-amber-800', night: 'bg-indigo-100 text-indigo-800',
  sleep: 'bg-sky-100 text-sky-800', off: 'bg-slate-100 text-slate-500',
}
const LEAVE_CODES = ['paid_leave', 'unpaid_leave', 'maternity_leave', 'national_holiday', 'study_leave']
type DayCell = { date: string; shiftTypeId: string | null; shiftCode: string | null; status: string | null }
const dateStr = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: FACILITY_TZ })
const dayLabel = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export default function RosterBuilder({ facilityId, go }: { facilityId: string; go: (v: View) => void }) {
  const [staff, setStaff] = useState<StaffRow[]>([])
  const [shiftTypes, setShiftTypes] = useState<ShiftTypeRow[]>([])
  const [wards, setWards] = useState<WardRow[]>([])
  const [selectedStaff, setSelectedStaff] = useState('')
  const [weekOffset, setWeekOffset] = useState(0)
  const [days, setDays] = useState<DayCell[]>([])
  const [phase, setPhase] = useState<{ name: string; mornings_only: boolean } | null>(null)
  const [openDay, setOpenDay] = useState<string | null>(null)
  const [wardChoice, setWardChoice] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const now = new Date()
  const [genYear, setGenYear] = useState(now.getFullYear())
  const [genMonth, setGenMonth] = useState(now.getMonth() + 1)
  const [genStartCode, setGenStartCode] = useState('')
  const [genMsg, setGenMsg] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('staff').select('id, full_name, app_role, profession, active').eq('facility_id', facilityId).eq('active', true).order('full_name')
      .then(({ data }) => setStaff((data ?? []) as StaffRow[]))
    supabase.from('shift_types').select('*').eq('facility_id', facilityId).order('rotation_order')
      .then(({ data }) => setShiftTypes((data ?? []) as ShiftTypeRow[]))
    supabase.from('wards').select('id, code, name').eq('facility_id', facilityId).order('code')
      .then(({ data }) => setWards((data ?? []) as WardRow[]))
  }, [facilityId])

  const loadWeek = useCallback(async () => {
    if (!selectedStaff) return setDays([])
    const start = new Date()
    start.setDate(start.getDate() + weekOffset * 7)
    const dates = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start)
      d.setDate(d.getDate() + i)
      return dateStr(d)
    })
    const { data, error } = await supabase
      .from('roster_entries')
      .select('work_date, status, shift_types(code)')
      .eq('staff_id', selectedStaff)
      .in('work_date', dates)
    if (error) return setError(errMsg(error))
    setError(null)
    setDays(dates.map((d) => {
      const row = (data ?? []).find((r) => r.work_date === d) as unknown as { work_date: string; status: string; shift_types: { code: string } } | undefined
      return { date: d, shiftTypeId: null, shiftCode: row?.shift_types?.code ?? null, status: row?.status ?? null }
    }))
    const p = await supabase.rpc('get_trainee_phase', { p_staff_id: selectedStaff })
    const row = (p.data as { name: string; mornings_only: boolean }[] | null)?.[0]
    setPhase(row ?? null)
  }, [selectedStaff, weekOffset])

  useEffect(() => { loadWeek() }, [loadWeek])

  async function setShift(date: string, shiftTypeId: string) {
    setBusy(true)
    setError(null)
    const { error } = await supabase.rpc('upsert_roster_entry', {
      p_staff_id: selectedStaff, p_work_date: date, p_shift_type_id: shiftTypeId, p_ward_id: wardChoice || null,
    })
    setBusy(false)
    if (error) return setError(errMsg(error))
    setOpenDay(null)
    loadWeek()
  }

  async function publishWeek() {
    setBusy(true)
    setError(null)
    const draftDates = days.filter((d) => d.status === 'draft').map((d) => d.date)
    const { data } = await supabase.from('roster_entries').select('id').eq('staff_id', selectedStaff).in('work_date', draftDates)
    for (const row of data ?? []) {
      await supabase.rpc('publish_roster_entry', { p_id: row.id })
    }
    setBusy(false)
    loadWeek()
  }

  async function generateMonth() {
    setBusy(true)
    setError(null)
    setGenMsg(null)
    const { data, error } = await supabase.rpc('generate_month_roster', {
      p_staff_id: selectedStaff, p_year: genYear, p_month: genMonth,
      p_ward_id: wardChoice || null, p_start_code: genStartCode || null,
    })
    setBusy(false)
    if (error) return setError(errMsg(error))
    setGenMsg(`Generated ${data} day(s) as drafts, continuing their usual morning/night/sleep/off cycle. Review and publish week by week below, or swap in specific days (e.g. leave) using "Change" on any day.`)
    loadWeek()
  }

  const cycleShifts = shiftTypes.filter((s) => !LEAVE_CODES.includes(s.code))
  const leaveShifts = shiftTypes.filter((s) => LEAVE_CODES.includes(s.code))

  return (
    <div className="space-y-3">
      <BackBar title="Build roster" onBack={() => go({ name: 'home' })} />
      <Card className="space-y-2">
        <label className="block text-sm">
          <span className="text-slate-600">Staff member</span>
          <select value={selectedStaff} onChange={(e) => setSelectedStaff(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-base bg-white">
            <option value="">Select…</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name} ({s.app_role})</option>)}
          </select>
        </label>
        {phase && (
          <p className={`text-xs rounded-lg p-2 ${phase.mornings_only ? 'bg-amber-50 text-amber-800 border border-amber-300' : 'bg-slate-50 text-slate-600'}`}>
            Trainee phase: {phase.name}{phase.mornings_only ? ' - mornings only' : ''}
          </p>
        )}
      </Card>

      {selectedStaff && (
        <>
          <Card className="space-y-3">
            <h2 className="font-semibold">Generate a whole month</h2>
            <p className="text-xs text-slate-500">
              Fills every day with the morning → night → sleep → off cycle, continuing from this person's
              last cycle shift (or pick a starting point below for someone with no history yet). Creates
              drafts only - nothing is published automatically.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <select value={genMonth} onChange={(e) => setGenMonth(Number(e.target.value))} className="rounded-lg border border-slate-300 px-2 py-2 text-sm bg-white">
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
              <input type="number" value={genYear} onChange={(e) => setGenYear(Number(e.target.value))} className="rounded-lg border border-slate-300 px-2 py-2 text-sm" />
            </div>
            <select value={genStartCode} onChange={(e) => setGenStartCode(e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm bg-white">
              <option value="">Continue from last month automatically</option>
              {cycleShifts.map((s) => <option key={s.id} value={s.code}>Start this month on: {s.name}</option>)}
            </select>
            <select value={wardChoice} onChange={(e) => setWardChoice(e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm bg-white">
              <option value="">No ward</option>
              {wards.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            <button onClick={generateMonth} disabled={busy} className="w-full rounded-xl bg-teal-700 text-white font-semibold py-3 disabled:opacity-50">
              {busy ? 'Generating…' : 'Generate month'}
            </button>
            {genMsg && <p className="text-xs text-emerald-800 bg-emerald-50 rounded-lg p-2">{genMsg}</p>}
          </Card>

          <div className="flex items-center justify-between">
            <button onClick={() => setWeekOffset((w) => w - 1)} className="rounded-lg bg-white border border-slate-300 px-3 py-2 text-sm">← Previous</button>
            <span className="text-sm font-medium">{weekOffset === 0 ? 'This week' : weekOffset > 0 ? `+${weekOffset} week(s)` : `${weekOffset} week(s)`}</span>
            <button onClick={() => setWeekOffset((w) => w + 1)} className="rounded-lg bg-white border border-slate-300 px-3 py-2 text-sm">Next →</button>
          </div>

          <ErrorBox message={error} />
          <div className="space-y-2">
            {days.map((d) => (
              <Card key={d.date} className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">{dayLabel(d.date)}</span>
                  <span className="flex items-center gap-2">
                    {d.shiftCode && (
                      <span className={`text-xs font-semibold rounded-full px-2 py-0.5 ${SHIFT_COLOR[d.shiftCode] ?? 'bg-purple-100 text-purple-800'}`}>
                        {shiftTypes.find((s) => s.code === d.shiftCode)?.name ?? d.shiftCode}{d.status === 'draft' ? ' (draft)' : ''}
                      </span>
                    )}
                    <button onClick={() => setOpenDay(openDay === d.date ? null : d.date)} className="text-xs text-teal-700 underline">
                      {d.shiftCode ? 'Change' : 'Assign'}
                    </button>
                  </span>
                </div>
                {openDay === d.date && (
                  <div className="space-y-2 border-t pt-2">
                    <p className="text-xs text-slate-500">Shift</p>
                    <div className="flex flex-wrap gap-2">
                      {cycleShifts.map((st) => (
                        <button key={st.id} onClick={() => setShift(d.date, st.id)} disabled={busy} className="rounded-lg bg-slate-800 text-white text-xs px-3 py-2 disabled:opacity-50">
                          {st.name}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-slate-500 pt-1">Leave</p>
                    <div className="flex flex-wrap gap-2">
                      {leaveShifts.map((st) => (
                        <button key={st.id} onClick={() => setShift(d.date, st.id)} disabled={busy} className="rounded-lg bg-purple-700 text-white text-xs px-3 py-2 disabled:opacity-50">
                          {st.name}
                        </button>
                      ))}
                    </div>
                    <select value={wardChoice} onChange={(e) => setWardChoice(e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm bg-white">
                      <option value="">No ward</option>
                      {wards.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                  </div>
                )}
              </Card>
            ))}
          </div>

          {days.some((d) => d.status === 'draft') && (
            <button onClick={publishWeek} disabled={busy} className="w-full rounded-xl bg-teal-700 text-white font-semibold py-3 disabled:opacity-50">
              Publish this week's draft shifts
            </button>
          )}
        </>
      )}
    </div>
  )
}
