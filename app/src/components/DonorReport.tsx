import { useEffect, useState } from 'react'
import { supabase, FACILITY_TZ } from '../lib/supabase'
import { errMsg } from '../lib/format'
import type {
  IncidentBreakdownRow, LosRow, OtStatsRow, PriorityBreakdownRow, ReferralStatsRow, SummaryRow, View,
} from '../types'
import { ErrorBox } from './ui'

const RANGES = [{ label: 'Last 30 days', days: 30 }, { label: 'Last 90 days', days: 90 }, { label: 'Last year', days: 365 }]
function isoDaysAgo(days: number) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString()
}

// An aggregate-only version of the dashboard, formatted for sharing with a donor or ministry contact.
// Deliberately carries no patient names - only counts and averages - so it is safe for admin to see too,
// matching the same aggregate-only rule used on the main Dashboard.
export default function DonorReport({ go }: { go: (v: View) => void }) {
  const [days, setDays] = useState(30)
  const [summary, setSummary] = useState<SummaryRow[]>([])
  const [priority, setPriority] = useState<PriorityBreakdownRow[]>([])
  const [incident, setIncident] = useState<IncidentBreakdownRow[]>([])
  const [los, setLos] = useState<LosRow[]>([])
  const [ot, setOt] = useState<OtStatsRow[]>([])
  const [referrals, setReferrals] = useState<ReferralStatsRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      const from = isoDaysAgo(days)
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
      setError(firstError ? errMsg(firstError) : null)
      setSummary((s.data ?? []) as SummaryRow[])
      setPriority((p.data ?? []) as PriorityBreakdownRow[])
      setIncident((i.data ?? []) as IncidentBreakdownRow[])
      setLos((l.data ?? []) as LosRow[])
      setOt((o.data ?? []) as OtStatsRow[])
      setReferrals((r.data ?? []) as ReferralStatsRow[])
      setLoading(false)
    })()
  }, [days])

  const totalVisits = summary.reduce((n, s) => n + s.total_visits, 0)
  const totalOt = ot.reduce((n, o) => n + o.completed_cases, 0)
  const rangeLabel = RANGES.find((r) => r.days === days)?.label ?? ''

  return (
    <div className="bg-white -mx-4 px-4">
      <style>{`@media print { .no-print { display: none !important; } body { background: white !important; } }`}</style>
      <div className="no-print flex gap-2 py-3">
        <button onClick={() => go({ name: 'home' })} className="flex-1 rounded-xl bg-white border border-slate-300 py-3">← Back</button>
        <button onClick={() => window.print()} className="flex-1 rounded-xl bg-teal-700 text-white font-semibold py-3">Print</button>
      </div>
      <div className="no-print flex gap-2 mb-3">
        {RANGES.map((r) => (
          <button key={r.days} onClick={() => setDays(r.days)} className={`flex-1 rounded-lg py-2 text-xs font-medium ${days === r.days ? 'bg-teal-700 text-white' : 'bg-white border border-slate-300'}`}>
            {r.label}
          </button>
        ))}
      </div>
      <ErrorBox message={error} />
      {loading && <p className="text-slate-500 text-sm">Loading…</p>}

      {!loading && (
        <div className="border-2 border-slate-800 rounded-lg p-4 space-y-4 text-sm">
          <div className="border-b border-slate-300 pb-2">
            <p className="font-bold text-lg">Activity Summary</p>
            <p className="text-xs text-slate-500">{rangeLabel} · prepared {new Date().toLocaleDateString('en-GB', { timeZone: FACILITY_TZ })}</p>
          </div>

          {summary.map((s) => (
            <section key={s.facility_code} className="border-b border-slate-300 pb-2">
              <p className="font-bold">{s.facility_code}</p>
              <p>{s.total_visits} total visits · {s.discharged} discharged · {s.currently_admitted} currently admitted · {s.referred_out} referred out</p>
            </section>
          ))}
          <p className="font-semibold">Total across all facilities shown: {totalVisits} visits, {totalOt} surgical cases completed.</p>

          {priority.length > 0 && (
            <section className="border-b border-slate-300 pb-2">
              <p className="font-bold mb-1">Triage priority</p>
              {priority.map((p, i) => <p key={i}>{p.facility_code}: {p.priority} - {p.visits}</p>)}
            </section>
          )}

          {incident.length > 0 && (
            <section className="border-b border-slate-300 pb-2">
              <p className="font-bold mb-1">Injury / incident type</p>
              {incident.slice(0, 10).map((inc, i) => <p key={i}>{inc.facility_code}: {inc.incident} - {inc.visits}</p>)}
            </section>
          )}

          {los.length > 0 && (
            <section className="border-b border-slate-300 pb-2">
              <p className="font-bold mb-1">Length of stay</p>
              {los.map((l) => <p key={l.facility_code}>{l.facility_code}: {l.avg_hours ?? '-'} hours average ({l.discharged_count} discharged)</p>)}
            </section>
          )}

          {ot.some((o) => o.completed_cases > 0) && (
            <section className="border-b border-slate-300 pb-2">
              <p className="font-bold mb-1">Surgery</p>
              {ot.filter((o) => o.completed_cases > 0).map((o) => (
                <p key={o.facility_code}>{o.facility_code}: {o.completed_cases} completed ({o.emergency_cases} emergency, {o.elective_cases} elective), {o.alive_count} alive, {o.deceased_count} deceased</p>
              ))}
            </section>
          )}

          {referrals.some((r) => r.sent + r.received > 0) && (
            <section>
              <p className="font-bold mb-1">Referrals</p>
              {referrals.filter((r) => r.sent + r.received > 0).map((r) => (
                <p key={r.facility_code}>{r.facility_code}: {r.sent} sent, {r.received} received, {r.arrived} arrived</p>
              ))}
            </section>
          )}

          <p className="text-xs text-slate-400 border-t border-slate-300 pt-2">
            Counts only - no patient names are included in this report.
          </p>
        </div>
      )}
    </div>
  )
}
