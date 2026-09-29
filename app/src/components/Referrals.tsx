import { useCallback, useEffect, useState } from 'react'
import { supabase, FACILITY_TZ } from '../lib/supabase'
import { ageSex, errMsg, vitalsLine } from '../lib/format'
import { useOffline } from '../lib/offline/context'
import type { EncounterRow, PatientRow, ReferralRow, View } from '../types'
import { Card, ErrorBox, PriorityBadge } from './ui'

type Tab = 'incoming' | 'sent' | 'tosend'

const STATUS_LABEL: Record<string, string> = {
  sent: 'Sent, not yet seen', received: 'Acknowledged', arrived: 'Patient arrived', cancelled: 'Cancelled',
}
const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', { timeZone: FACILITY_TZ, hour: '2-digit', minute: '2-digit' })

export default function Referrals({ facilityId, staffId, go }: { facilityId: string; staffId: string; go: (v: View) => void }) {
  const { engine, version } = useOffline()
  void version
  const [tab, setTab] = useState<Tab>('incoming')
  const [refs, setRefs] = useState<ReferralRow[] | null>(null)
  const [toSend, setToSend] = useState<EncounterRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const r = await supabase
      .from('referrals')
      .select(
        'id, encounter_id, from_facility_id, to_facility_id, to_external, reason, eta, status, payload, created_at, arrived_patient_id, from:facilities!from_facility_id(code,name), to:facilities!to_facility_id(code,name), arrived:patients!arrived_patient_id(display_id)',
      )
      .or(`from_facility_id.eq.${facilityId},to_facility_id.eq.${facilityId}`)
      .order('created_at', { ascending: false })
      .limit(50)
    if (r.error) return setError(errMsg(r.error))
    const list = (r.data ?? []) as unknown as ReferralRow[]
    setRefs(list)

    // visits marked "refer" in the last 3 days that still have no live referral
    const since = new Date(Date.now() - 3 * 86400000).toISOString()
    const e = await supabase
      .from('encounters')
      .select('id, patient_id, facility_id, status, arrived_at, triage_priority, triage_decision, opd_doctor_id, patients(*)')
      .eq('facility_id', facilityId)
      .eq('status', 'referred_out')
      .gte('arrived_at', since)
      .order('arrived_at', { ascending: false })
    const live = new Set(list.filter((x) => x.status !== 'cancelled').map((x) => x.encounter_id))
    setToSend(((e.data ?? []) as unknown as EncounterRow[]).filter((x) => !live.has(x.id)))
    setError(null)
  }, [facilityId])

  useEffect(() => {
    load()
    const id = setInterval(load, 20_000)
    return () => clearInterval(id)
  }, [load])

  async function setStatus(id: string, status: 'received' | 'cancelled') {
    setBusyId(id)
    const { error } = await supabase.rpc('update_referral_status', { p_referral_id: id, p_status: status })
    setBusyId(null)
    if (error) setError(errMsg(error))
    else load()
  }

  const incoming = refs?.filter((r) => r.to_facility_id === facilityId) ?? []
  const sent = refs?.filter((r) => r.from_facility_id === facilityId) ?? []
  const newCount = incoming.filter((r) => r.status === 'sent').length

  const tabs: { key: Tab; label: string }[] = [
    { key: 'incoming', label: `Incoming${newCount ? ` (${newCount})` : ''}` },
    { key: 'sent', label: 'Sent' },
    { key: 'tosend', label: `To send${toSend.length ? ` (${toSend.length})` : ''}` },
  ]

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">Referrals</h1>
        <button onClick={load} className="text-sm rounded-lg bg-white border border-slate-300 px-3 py-2">Refresh</button>
      </div>
      <div className="flex gap-1 bg-slate-200 rounded-xl p-1">
        {tabs.map((t) => (
          <button
            key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold ${tab === t.key ? 'bg-white shadow' : 'text-slate-600'}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <ErrorBox message={error} />
      {refs === null && <p className="text-slate-500">Loading…</p>}

      {engine.itemsFor(staffId).some((i) => i.type === 'create_referral') && (
        <Card className="border-2 border-dashed border-slate-300">
          <p className="text-sm font-semibold text-slate-600 mb-1">Saved on this phone, not yet sent</p>
          <ul className="text-sm space-y-1">
            {engine.itemsFor(staffId).filter((i) => i.type === 'create_referral').map((i) => (
              <li key={i.id}>{(i.enc?.patients as PatientRow | undefined)?.display_id ?? i.label}</li>
            ))}
          </ul>
        </Card>
      )}

      {tab === 'incoming' && (
        <>
          {refs && incoming.length === 0 && <Card><p className="text-sm text-slate-600">No incoming referrals.</p></Card>}
          {incoming.map((r) => (
            <Card key={r.id} className="space-y-2">
              <Summary r={r} incoming />
              {r.status === 'sent' && (
                <button onClick={() => setStatus(r.id, 'received')} disabled={busyId === r.id} className="w-full rounded-xl bg-white border border-teal-700 text-teal-800 font-semibold py-3 disabled:opacity-60">
                  Acknowledge (we have seen it)
                </button>
              )}
              {(r.status === 'sent' || r.status === 'received') && (
                <button
                  onClick={() => go({ name: 'register', prefill: r.payload.patient, referralId: r.id })}
                  className="w-full rounded-xl bg-teal-700 text-white font-semibold py-3"
                >
                  Patient arrived: register here
                </button>
              )}
              {r.status === 'arrived' && r.arrived && (
                <button onClick={() => r.arrived_patient_id && go({ name: 'patient', id: r.arrived_patient_id })} className="w-full rounded-xl bg-white border border-slate-300 py-3">
                  Registered here as {r.arrived.display_id}
                </button>
              )}
            </Card>
          ))}
        </>
      )}

      {tab === 'sent' && (
        <>
          {refs && sent.length === 0 && <Card><p className="text-sm text-slate-600">Nothing sent yet.</p></Card>}
          {sent.map((r) => (
            <Card key={r.id} className="space-y-2">
              <Summary r={r} />
              {(r.status === 'sent' || r.status === 'received') && (
                <button onClick={() => setStatus(r.id, 'cancelled')} disabled={busyId === r.id} className="w-full rounded-xl bg-white border border-red-500 text-red-700 py-3 disabled:opacity-60">
                  Cancel referral
                </button>
              )}
            </Card>
          ))}
        </>
      )}

      {tab === 'tosend' && (
        <>
          {toSend.length === 0 && <Card><p className="text-sm text-slate-600">No visits are waiting for a referral form.</p></Card>}
          {toSend.map((e) => (
            <Card key={e.id} className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="font-mono font-bold text-teal-800">{e.patients?.display_id}</span>
                <PriorityBadge priority={e.triage_priority} />
              </div>
              <p className="font-medium">{e.patients?.full_name} <span className="text-xs text-slate-500">{ageSex(e.patients?.age_years, e.patients?.sex)}</span></p>
              <button onClick={() => go({ name: 'referral_form', encounterId: e.id })} className="w-full rounded-xl bg-teal-700 text-white font-semibold py-3">
                Fill referral form
              </button>
            </Card>
          ))}
        </>
      )}
    </div>
  )
}

function Summary({ r, incoming = false }: { r: ReferralRow; incoming?: boolean }) {
  const p = r.payload.patient
  const t = r.payload.triage
  const data = t?.data ?? null
  const fromLabel = r.from ? `${r.from.code} · ${r.from.name}` : ''
  const toLabel = r.to ? `${r.to.code} · ${r.to.name}` : r.to_external ?? ''
  const status = r.status
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-slate-600">{incoming ? `From ${fromLabel}` : `To ${toLabel}`}</span>
        <PriorityBadge priority={t?.priority ?? null} />
      </div>
      <div>
        <p className="font-semibold">{p?.full_name}</p>
        <p className="text-xs text-slate-500">
          {ageSex(p?.age_years, p?.sex)} · Blood {p?.blood_group ?? 'Unknown'}
          {incoming && p?.display_id ? ` · ID there: ${p.display_id}` : ''}
        </p>
      </div>
      {p?.allergy_status === 'known' && (
        <p className="text-sm font-semibold text-red-700 bg-red-50 rounded-lg p-2">ALLERGY: {p.allergy_details}</p>
      )}
      {p?.allergy_status === 'unknown' && <p className="text-xs text-amber-700">Allergies unknown.</p>}
      <p className="text-sm"><span className="text-slate-500">Reason:</span> {r.reason}</p>
      {data?.injury_description && <p className="text-sm">{data.injury_description}</p>}
      {vitalsLine(data) && <p className="text-xs text-slate-600">{vitalsLine(data)}</p>}
      {r.payload.opd?.diagnosis && <p className="text-sm"><span className="text-slate-500">Diagnosis:</span> {r.payload.opd.diagnosis}</p>}
      {(r.payload.treatments?.length ?? 0) > 0 && (
        <p className="text-xs text-slate-600">
          Treatments: {r.payload.treatments!.map((x) => [x.procedure, x.drug, x.dose].filter(Boolean).join(' ')).join('; ')}
        </p>
      )}
      {r.payload.treatment_given && <p className="text-xs text-slate-600">Given: {r.payload.treatment_given}</p>}
      <p className="text-xs text-slate-500">
        {r.payload.transport ? `${r.payload.transport === 'ambulance' ? 'Ambulance' : 'Own transport'} · ` : ''}
        {r.eta ? `Expected about ${hhmm(r.eta)} · ` : ''}
        <b>{STATUS_LABEL[status]}</b>
      </p>
    </>
  )
}
