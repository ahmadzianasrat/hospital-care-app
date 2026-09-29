import { useEffect, useState } from 'react'
import { supabase, FACILITY_TZ } from '../lib/supabase'
import type { RosterRow } from '../types'

const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : '')

export default function Roster({ staffId }: { staffId: string }) {
  const [rows, setRows] = useState<RosterRow[] | null>(null)

  useEffect(() => {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: FACILITY_TZ }) // YYYY-MM-DD
    supabase
      .from('roster_entries')
      .select('id, work_date, shift_types(name,start_time,end_time), wards(name)')
      .eq('staff_id', staffId)
      .eq('status', 'published')
      .gte('work_date', today)
      .order('work_date')
      .limit(7)
      .then(({ data }) => setRows((data ?? []) as unknown as RosterRow[]))
  }, [staffId])

  return (
    <section className="bg-white rounded-2xl shadow p-4">
      <h2 className="font-semibold mb-2">My upcoming shifts</h2>
      {rows === null && <p className="text-sm text-slate-500">Loading…</p>}
      {rows?.length === 0 && <p className="text-sm text-slate-500">No published shifts.</p>}
      <ul className="divide-y">
        {rows?.map((r) => (
          <li key={r.id} className="py-2 flex justify-between text-sm">
            <span>{r.work_date}</span>
            <span className="text-slate-600">
              {r.shift_types?.name} {hhmm(r.shift_types?.start_time)}–{hhmm(r.shift_types?.end_time)}
              {r.wards ? ` · ${r.wards.name}` : ''}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
