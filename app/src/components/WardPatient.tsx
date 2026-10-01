import { useCallback, useEffect, useState } from 'react'
import { supabase, FACILITY_TZ } from '../lib/supabase'
import { errMsg } from '../lib/format'
import { FREQUENCY_LABELS, ORDER_TYPE_LABELS } from '../types'
import type { BedStayRow, OrderRow, PatientRow, TaskRow, View } from '../types'
import { BackBar, Card, ErrorBox, PatientHeader, TextArea } from './ui'

const time = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { timeZone: FACILITY_TZ, hour: '2-digit', minute: '2-digit' })
const dt = (iso: string) => new Date(iso).toLocaleString('en-GB', { timeZone: FACILITY_TZ, dateStyle: 'medium', timeStyle: 'short' })

export default function WardPatient({
  encounterId, go, notify, canOrder, canDoTask, canDischarge,
}: {
  encounterId: string; go: (v: View) => void; notify: (m: string) => void
  canOrder: boolean; canDoTask: boolean; canDischarge: boolean
}) {
  const [patient, setPatient] = useState<PatientRow | null>(null)
  const [stay, setStay] = useState<BedStayRow | null>(null)
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [tasks, setTasks] = useState<TaskRow[]>([])
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyTask, setBusyTask] = useState<string | null>(null)
  const [skipping, setSkipping] = useState<string | null>(null)
  const [skipReason, setSkipReason] = useState('')
  const [showDischarge, setShowDischarge] = useState(false)
  const [summary, setSummary] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const enc = await supabase.from('encounters').select('status, patient_id, patients(*)').eq('id', encounterId).maybeSingle()
    if (enc.error) return setError(errMsg(enc.error))
    if (!enc.data) return setError('Visit not found.')
    setStatus(enc.data.status)
    setPatient(enc.data.patients as unknown as PatientRow)

    const s = await supabase.from('bed_stays').select('id, encounter_id, bed_id, from_at, to_at, beds(id, ward_id, code, active)').eq('encounter_id', encounterId).is('to_at', null).maybeSingle()
    setStay((s.data as unknown as BedStayRow) ?? null)

    const o = await supabase.from('orders').select('id, encounter_id, order_type, details, frequency, duration_days, status, ordered_at, ordered_by').eq('encounter_id', encounterId).order('ordered_at', { ascending: false })
    setOrders((o.data ?? []) as OrderRow[])

    const t = await supabase.from('tasks').select('id, order_id, encounter_id, due_at, status, done_by, done_at, note, orders(order_type, details)').eq('encounter_id', encounterId).eq('status', 'pending').order('due_at')
    setTasks((t.data ?? []) as unknown as TaskRow[])
    setError(null)
  }, [encounterId])

  useEffect(() => {
    load()
    const id = setInterval(load, 20_000)
    return () => clearInterval(id)
  }, [load])

  async function completeTask(id: string) {
    setBusyTask(id)
    const { error } = await supabase.rpc('complete_task', { p_task_id: id })
    setBusyTask(null)
    if (error) setError(errMsg(error))
    else load()
  }

  async function doSkip() {
    if (!skipping || skipReason.trim().length < 3) return
    setBusyTask(skipping)
    const { error } = await supabase.rpc('skip_task', { p_task_id: skipping, p_reason: skipReason.trim() })
    setBusyTask(null)
    if (error) setError(errMsg(error))
    else {
      setSkipping(null)
      setSkipReason('')
      load()
    }
  }

  async function stopOrder(id: string) {
    const { error } = await supabase.rpc('stop_order', { p_order_id: id })
    if (error) setError(errMsg(error))
    else load()
  }

  async function discharge() {
    setBusy(true)
    const { error } = await supabase.rpc('discharge_from_ward', { p_encounter_id: encounterId, p_data: { summary: summary.trim() } })
    setBusy(false)
    if (error) return setError(errMsg(error))
    notify(`${patient?.display_id} discharged.`)
    go({ name: 'wards' })
  }

  if (error && !patient) {
    return (
      <div className="space-y-3">
        <BackBar title="Patient" onBack={() => go({ name: 'wards' })} />
        <ErrorBox message={error} />
      </div>
    )
  }
  if (!patient) return <p className="text-slate-500">Loading…</p>

  const now = Date.now()
  const activeOrders = orders.filter((o) => o.status === 'active')

  return (
    <div className="space-y-3">
      <BackBar title="Ward patient" onBack={() => go({ name: 'wards' })} />
      <PatientHeader patient={patient} />
      <ErrorBox message={error} />

      {stay?.beds && (
        <Card>
          <p className="text-sm"><span className="text-slate-500">Bed:</span> <span className="font-semibold">{stay.beds.code}</span></p>
        </Card>
      )}
      {status !== 'admitted' && (
        <Card><p className="text-sm text-slate-600">This visit is no longer admitted (status: {status}).</p></Card>
      )}

      <Card className="space-y-2">
        <h2 className="font-semibold">Tasks due ({tasks.length})</h2>
        {tasks.length === 0 && <p className="text-sm text-slate-500">Nothing pending.</p>}
        {tasks.map((t) => {
          const overdue = new Date(t.due_at).getTime() < now
          return (
            <div key={t.id} className={`rounded-lg border p-2 space-y-1 ${overdue ? 'border-red-400 bg-red-50' : 'border-slate-200'}`}>
              <div className="flex justify-between text-sm">
                <span className="font-medium">{t.orders?.details?.instruction ?? ORDER_TYPE_LABELS[t.orders?.order_type ?? ''] ?? 'Task'}</span>
                <span className={overdue ? 'text-red-700 font-semibold' : 'text-slate-500'}>{time(t.due_at)}</span>
              </div>
              {canDoTask && status === 'admitted' && (
                skipping === t.id ? (
                  <div className="space-y-2">
                    <input value={skipReason} onChange={(e) => setSkipReason(e.target.value)} placeholder="Reason to skip" className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm" />
                    <div className="flex gap-2">
                      <button onClick={doSkip} disabled={busyTask === t.id || skipReason.trim().length < 3} className="flex-1 rounded-lg bg-amber-600 text-white text-sm py-2 disabled:opacity-50">Confirm skip</button>
                      <button onClick={() => setSkipping(null)} className="flex-1 rounded-lg bg-white border border-slate-300 text-sm py-2">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button onClick={() => completeTask(t.id)} disabled={busyTask === t.id} className="flex-1 rounded-lg bg-teal-700 text-white text-sm py-2 disabled:opacity-50">Mark done</button>
                    <button onClick={() => setSkipping(t.id)} className="flex-1 rounded-lg bg-white border border-slate-300 text-sm py-2">Skip</button>
                  </div>
                )
              )}
            </div>
          )
        })}
      </Card>

      <Card className="space-y-2">
        <h2 className="font-semibold">Active orders ({activeOrders.length})</h2>
        {activeOrders.length === 0 && <p className="text-sm text-slate-500">None.</p>}
        {activeOrders.map((o) => (
          <div key={o.id} className="rounded-lg border border-slate-200 p-2 text-sm space-y-1">
            <p className="font-medium">{ORDER_TYPE_LABELS[o.order_type]}: {o.details.instruction}</p>
            <p className="text-xs text-slate-500">{FREQUENCY_LABELS[o.frequency]} · {o.duration_days} day(s) · started {dt(o.ordered_at)}</p>
            {canOrder && <button onClick={() => stopOrder(o.id)} className="text-xs text-red-700 underline">Stop this order</button>}
          </div>
        ))}
        {orders.filter((o) => o.status !== 'active').length > 0 && (
          <details className="text-xs text-slate-500">
            <summary>Past orders ({orders.filter((o) => o.status !== 'active').length})</summary>
            <ul className="mt-1 space-y-1">
              {orders.filter((o) => o.status !== 'active').map((o) => (
                <li key={o.id}>{ORDER_TYPE_LABELS[o.order_type]}: {o.details.instruction} ({o.status})</li>
              ))}
            </ul>
          </details>
        )}
      </Card>

      {status === 'admitted' && (
        <button onClick={() => go({ name: 'ward_charts', encounterId })} className="w-full rounded-xl bg-white border border-slate-300 py-3 font-medium">
          Charts (vitals, circulation, fluids, Barthel, notes)
        </button>
      )}

      {canOrder && status === 'admitted' && (
        <button onClick={() => go({ name: 'order_form', encounterId })} className="w-full rounded-xl border border-teal-700 text-teal-800 font-semibold py-3">
          + New order
        </button>
      )}

      {canOrder && status === 'admitted' && (
        <button onClick={() => go({ name: 'book_surgery', encounterId })} className="w-full rounded-xl border border-slate-400 text-slate-700 font-semibold py-3">
          Book surgery
        </button>
      )}

      {canDischarge && status === 'admitted' && !showDischarge && (
        <button onClick={() => setShowDischarge(true)} className="w-full rounded-xl bg-white border border-slate-300 py-3 font-medium">
          Discharge from ward
        </button>
      )}
      {canDischarge && showDischarge && (
        <Card className="space-y-3">
          <TextArea label="Discharge summary" value={summary} onChange={setSummary} rows={3} required />
          <div className="flex gap-2">
            <button onClick={discharge} disabled={summary.trim().length < 2 || busy} className="flex-1 rounded-xl bg-teal-700 text-white font-semibold py-3 disabled:opacity-50">
              {busy ? 'Saving…' : 'Confirm discharge'}
            </button>
            <button onClick={() => setShowDischarge(false)} className="flex-1 rounded-xl bg-white border border-slate-300 py-3">Cancel</button>
          </div>
        </Card>
      )}
    </div>
  )
}
