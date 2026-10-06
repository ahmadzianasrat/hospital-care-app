import { useCallback, useEffect, useState } from 'react'
import { supabase, FACILITY_TZ } from '../lib/supabase'
import { errMsg, waitLabel } from '../lib/format'
import { useNow } from '../hooks'
import type { EncounterRow, PatientRow, View } from '../types'
import { BackBar, ErrorBox } from './ui'

type Row = EncounterRow & { bedLabel?: string }

const PRIORITY_ORDER = ['red', 'orange', 'yellow', 'green', null] as const
const SECTION: Record<string, { label: string; header: string; border: string }> = {
  red: { label: 'Immediate', header: 'bg-red-600', border: 'border-red-600' },
  orange: { label: 'Very urgent', header: 'bg-orange-500', border: 'border-orange-500' },
  yellow: { label: 'Urgent', header: 'bg-yellow-400 text-slate-900', border: 'border-yellow-500' },
  green: { label: 'Non-urgent', header: 'bg-green-600', border: 'border-green-600' },
  none: { label: 'Not yet triaged', header: 'bg-slate-700', border: 'border-slate-500' },
}
const STATUS_LABEL: Record<string, string> = {
  waiting_triage: 'Waiting for triage', waiting_opd: 'Waiting for OPD', in_opd: 'With doctor', admitted: 'Admitted',
}

export default function MassCasualtyBoard({ facilityId, go }: { facilityId: string; go: (v: View) => void }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const now = useNow(10_000)

  const load = useCallback(async () => {
    const e = await supabase
      .from('encounters')
      .select('id, patient_id, facility_id, status, arrived_at, triage_priority, triage_decision, opd_doctor_id, patients(*)')
      .eq('facility_id', facilityId)
      .in('status', ['waiting_triage', 'waiting_opd', 'in_opd', 'admitted'])
    if (e.error) return setError(errMsg(e.error))
    const list = (e.data ?? []) as unknown as Row[]

    const admittedIds = list.filter((r) => r.status === 'admitted').map((r) => r.id)
    if (admittedIds.length > 0) {
      const stays = await supabase.from('bed_stays').select('encounter_id, beds(code, wards(name))').in('encounter_id', admittedIds).is('to_at', null)
      const byEnc = new Map((stays.data ?? []).map((s) => [s.encounter_id as string, s.beds as unknown as { code: string; wards: { name: string } } | null]))
      for (const r of list) {
        const bed = byEnc.get(r.id)
        r.bedLabel = bed ? `${bed.wards?.name ?? ''} · Bed ${bed.code}` : 'No bed assigned'
      }
    }
    setError(null)
    setRows(list)
  }, [facilityId])

  useEffect(() => {
    load()
    const id = setInterval(load, 10_000)
    return () => clearInterval(id)
  }, [load])

  const total = rows?.length ?? 0

  return (
    <div className="space-y-3">
      <BackBar title="Mass casualty board" onBack={() => go({ name: 'home' })} />
      <div className="flex items-center justify-between rounded-xl bg-slate-900 text-white px-4 py-3">
        <span className="font-semibold">{total} active patient{total === 1 ? '' : 's'}</span>
        <span className="text-xs text-slate-300">Updates every 10s</span>
      </div>
      <ErrorBox message={error} />
      {rows === null && <p className="text-slate-500">Loading…</p>}

      {PRIORITY_ORDER.map((priority) => {
        const key = priority ?? 'none'
        const section = SECTION[key]
        const group = (rows ?? []).filter((r) => r.triage_priority === priority)
          .sort((a, b) => a.arrived_at.localeCompare(b.arrived_at))
        if (group.length === 0) return null
        return (
          <div key={key} className="space-y-1">
            <div className={`rounded-lg px-3 py-1.5 text-white text-sm font-bold ${section.header}`}>
              {section.label} ({group.length})
            </div>
            {group.map((r) => {
              const p = r.patients as PatientRow
              return (
                <div key={r.id} className={`rounded-lg border-l-4 bg-white shadow-sm px-3 py-2 ${section.border}`}>
                  <div className="flex justify-between items-baseline">
                    <span className="font-mono font-bold text-base text-teal-800">{p?.display_id}</span>
                    <span className="text-xs font-semibold text-amber-700">{waitLabel(r.arrived_at, now)}</span>
                  </div>
                  <p className="font-medium">{p?.full_name}</p>
                  <p className="text-sm text-slate-600">
                    {STATUS_LABEL[r.status] ?? r.status}{r.status === 'admitted' && r.bedLabel ? ` · ${r.bedLabel}` : ''}
                  </p>
                  {p?.allergy_status === 'known' && <p className="text-xs font-semibold text-red-700">Allergy: {p.allergy_details}</p>}
                </div>
              )
            })}
          </div>
        )
      })}
      {rows && rows.length === 0 && <p className="text-sm text-slate-600 text-center py-6">No active patients right now.</p>}
      <p className="text-xs text-slate-400 text-center">{now.toLocaleTimeString('en-GB', { timeZone: FACILITY_TZ })}</p>
    </div>
  )
}
