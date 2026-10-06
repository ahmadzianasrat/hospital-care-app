import { useCallback, useEffect, useState } from 'react'
import { supabase, FACILITY_TZ } from '../lib/supabase'
import { errMsg } from '../lib/format'
import { PRIORITY_STYLE, type Priority } from '../lib/format'
import type {
  ExportRow, IncidentBreakdownRow, LosRow, OtStatsRow, PriorityBreakdownRow, ReferralStatsRow, SummaryRow, View,
} from '../types'
import { BackBar, Card, ErrorBox } from './ui'

const RANGES = [
  { label: '7 days', days: 7 }, { label: '30 days', days: 30 }, { label: '90 days', days: 90 },
]

function isoDaysAgo(days: number) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString()
}

export default function Dashboard({ canExport, go }: { canExport: boolean; go: (v: View) => void }) {
  const [rangeDays, setRangeDays] = useState(30)
  const [summary, setSummary] = useState<SummaryRow[]>([])
  const [priority, setPriority] = useState<PriorityBreakdownRow[]>([])
  const [incident, setIncident] = useState<IncidentBreakdownRow[]>([])
  const [los, setLos] = useState<LosRow[]>([])
  const [ot, setOt] = useState<OtStatsRow[]>([])
  const [referrals, setReferrals] = useState<ReferralStatsRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const from = isoDaysAgo(rangeDays)
    const to = new Date().toISOString()
    const [s, p, i, l, o, r] = await Promise.all([
      supabase.rpc('report_summary', { p_from: from, p_to: to }),
      supabase.rpc('report_priority_breakdown', { p_from: from, p_to: to }),
      supabase.rpc('report_incident_breakdown', { p_from: from, p_to: to }),
      supabase.rpc('report_length_of_stay', { p_from: from, p_to: to }),
      supabase.rpc('report_ot_stats', { p_from: from, p_to: to }),
      supabase.rpc('report_referral_stats', { p_from: from, p_to: to }),
    ])
    const firstError = [s, p, i, l, o, r].find((x) => x.error)?.error
    if (firstError) setError(errMsg(firstError))
    else setError(null)
    setSummary((s.data ?? []) as SummaryRow[])
    setPriority((p.data ?? []) as PriorityBreakdownRow[])
    setIncident((i.data ?? []) as IncidentBreakdownRow[])
    setLos((l.data ?? []) as LosRow[])
    setOt((o.data ?? []) as OtStatsRow[])
    setReferrals((r.data ?? []) as ReferralStatsRow[])
    setLoading(false)
  }, [rangeDays])

  useEffect(() => { load() }, [load])

  async function exportCsv() {
    setExporting(true)
    const from = isoDaysAgo(rangeDays)
    const to = new Date().toISOString()
    const { data, error } = await supabase.rpc('report_encounters_export', { p_from: from, p_to: to })
    setExporting(false)
    if (error) return setError(errMsg(error))
    const rows = (data ?? []) as ExportRow[]
    const header = ['Facility', 'Patient ID', 'Name', 'Age', 'Sex', 'Arrived', 'Priority', 'Status', 'Diagnosis']
    const csvEscape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = [header.map(csvEscape).join(',')]
    for (const r of rows) {
      lines.push([
        r.facility_code, r.display_id, r.full_name, r.age_years, r.sex,
        new Date(r.arrived_at).toLocaleString('en-GB', { timeZone: FACILITY_TZ }),
        r.triage_priority, r.status, r.diagnosis,
      ].map(csvEscape).join(','))
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `visits-${rangeDays}days-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const totalVisits = summary.reduce((n, s) => n + s.total_visits, 0)

  return (
    <div className="space-y-3">
      <BackBar title="Dashboard" onBack={() => go({ name: 'home' })} />
      <div className="flex gap-2">
        {RANGES.map((r) => (
          <button
            key={r.days} onClick={() => setRangeDays(r.days)}
            className={`flex-1 rounded-lg py-2 text-sm font-medium ${rangeDays === r.days ? 'bg-teal-700 text-white' : 'bg-white border border-slate-300'}`}
          >
            Last {r.label}
          </button>
        ))}
      </div>
      <ErrorBox message={error} />
      {loading && <p className="text-slate-500 text-sm">Loading…</p>}

      {!loading && summary.length > 1 && (
        <Card>
          <p className="text-xs text-slate-500 mb-1">All facilities you can see</p>
          <p className="text-2xl font-bold">{totalVisits} <span className="text-sm font-normal text-slate-500">visits</span></p>
        </Card>
      )}

      {summary.map((s) => (
        <Card key={s.facility_code} className="space-y-2">
          <p className="font-semibold">{s.facility_code}</p>
          <div className="grid grid-cols-4 gap-2 text-center text-sm">
            <Stat label="Visits" value={s.total_visits} />
            <Stat label="Waiting" value={s.currently_waiting} />
            <Stat label="Admitted" value={s.currently_admitted} />
            <Stat label="Discharged" value={s.discharged} />
          </div>
        </Card>
      ))}

      {priority.length > 0 && (
        <Card className="space-y-2">
          <h2 className="font-semibold">Triage priority</h2>
          {priority.map((p, i) => (
            <Bar
              key={i} label={`${p.facility_code} - ${PRIORITY_STYLE[p.priority as Priority]?.label ?? p.priority}`}
              value={p.visits} max={Math.max(...priority.map((x) => x.visits))}
              color={PRIORITY_STYLE[p.priority as Priority]?.solid.split(' ')[0] ?? 'bg-slate-400'}
            />
          ))}
        </Card>
      )}

      {incident.length > 0 && (
        <Card className="space-y-2">
          <h2 className="font-semibold">Injury / incident type</h2>
          {incident.slice(0, 8).map((inc, i) => (
            <Bar key={i} label={`${inc.facility_code} - ${inc.incident}`} value={inc.visits} max={Math.max(...incident.map((x) => x.visits))} color="bg-teal-600" />
          ))}
        </Card>
      )}

      {los.length > 0 && (
        <Card className="space-y-1">
          <h2 className="font-semibold">Length of stay (arrival to discharge)</h2>
          {los.map((l) => (
            <p key={l.facility_code} className="text-sm">{l.facility_code}: {l.avg_hours ?? '-'} hours average, {l.discharged_count} discharged</p>
          ))}
        </Card>
      )}

      {ot.some((o) => o.completed_cases > 0) && (
        <Card className="space-y-1">
          <h2 className="font-semibold">Operating theatre</h2>
          {ot.filter((o) => o.completed_cases > 0).map((o) => (
            <p key={o.facility_code} className="text-sm">
              {o.facility_code}: {o.completed_cases} completed ({o.emergency_cases} emergency, {o.elective_cases} elective) ·
              {' '}{o.alive_count} alive, {o.deceased_count} deceased
            </p>
          ))}
        </Card>
      )}

      {referrals.some((r) => r.sent + r.received > 0) && (
        <Card className="space-y-1">
          <h2 className="font-semibold">Referrals</h2>
          {referrals.filter((r) => r.sent + r.received > 0).map((r) => (
            <p key={r.facility_code} className="text-sm">{r.facility_code}: {r.sent} sent, {r.received} received, {r.arrived} arrived</p>
          ))}
        </Card>
      )}

      {canExport && (
        <button onClick={exportCsv} disabled={exporting} className="w-full rounded-xl border border-teal-700 text-teal-800 font-semibold py-3 disabled:opacity-50">
          {exporting ? 'Preparing…' : 'Export patient list as CSV'}
        </button>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-lg font-bold">{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  )
}

function Bar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.max(6, (value / max) * 100) : 0
  return (
    <div>
      <div className="flex justify-between text-xs text-slate-600 mb-0.5">
        <span>{label}</span><span>{value}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
