import { useCallback, useEffect, useState } from 'react'
import { supabase, FACILITY_TZ } from '../lib/supabase'
import { errMsg } from '../lib/format'
import { FREQUENCY_LABELS } from '../types'
import type { OrderRow, TaskRow, View } from '../types'
import { BackBar, Card, ErrorBox } from './ui'

const time = (iso: string) => new Date(iso).toLocaleString('en-GB', { timeZone: FACILITY_TZ, dateStyle: 'short', timeStyle: 'short' })

type MedGroup = { order: OrderRow; tasks: TaskRow[] }

// A dedicated medication administration record (MAR): every medication order for this patient,
// each with its own dosing schedule and who gave (or skipped) each dose - separate from the mixed
// "active orders" list, which also includes diet, mobilization, x-ray and other non-drug orders.
export default function MedicationList({
  encounterId, go, canDoTask,
}: { encounterId: string; go: (v: View) => void; canDoTask: boolean }) {
  const [groups, setGroups] = useState<MedGroup[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyTask, setBusyTask] = useState<string | null>(null)

  const load = useCallback(async () => {
    const o = await supabase
      .from('orders')
      .select('id, encounter_id, order_type, details, frequency, duration_days, status, ordered_at, ordered_by')
      .eq('encounter_id', encounterId)
      .eq('order_type', 'medication')
      .order('ordered_at', { ascending: false })
    if (o.error) return setError(errMsg(o.error))
    const orders = (o.data ?? []) as OrderRow[]

    const orderIds = orders.map((x) => x.id)
    const t = orderIds.length
      ? await supabase.from('tasks').select('*').in('order_id', orderIds).order('due_at')
      : { data: [] as TaskRow[] }

    setError(null)
    setGroups(orders.map((order) => ({
      order, tasks: ((t.data ?? []) as TaskRow[]).filter((x) => x.order_id === order.id),
    })))
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

  return (
    <div className="space-y-3">
      <BackBar title="Medication list" onBack={() => go({ name: 'ward_charts', encounterId })} />
      <ErrorBox message={error} />
      {groups === null && <p className="text-slate-500">Loading…</p>}
      {groups?.length === 0 && <Card><p className="text-sm text-slate-600">No medications on record for this visit.</p></Card>}

      {groups?.map(({ order, tasks }) => (
        <Card key={order.id} className={order.status !== 'active' ? 'opacity-60' : ''}>
          <div className="flex justify-between items-start">
            <div>
              <p className="font-semibold">{order.details.instruction}</p>
              <p className="text-xs text-slate-500">
                {[order.details.dose, order.details.route].filter(Boolean).join(' · ')}
                {order.details.dose || order.details.route ? ' · ' : ''}
                {FREQUENCY_LABELS[order.frequency]} · {order.duration_days} day(s)
                {order.status !== 'active' ? ` · ${order.status}` : ''}
              </p>
            </div>
          </div>

          {tasks.length > 0 && (
            <div className="mt-2 space-y-1">
              {tasks.map((t) => (
                <div key={t.id} className={`flex items-center justify-between rounded-lg px-2 py-1 text-sm ${
                  t.status === 'done' ? 'bg-emerald-50' : t.status === 'skipped' ? 'bg-slate-100 text-slate-400' :
                  new Date(t.due_at).getTime() < Date.now() ? 'bg-red-50' : 'bg-slate-50'
                }`}>
                  <span>{time(t.due_at)}</span>
                  <span className="flex items-center gap-2">
                    {t.status === 'done' && <span className="text-emerald-700 font-medium">Given</span>}
                    {t.status === 'skipped' && <span>Skipped{t.note ? `: ${t.note}` : ''}</span>}
                    {t.status === 'pending' && canDoTask && (
                      <button onClick={() => completeTask(t.id)} disabled={busyTask === t.id} className="rounded-lg bg-teal-700 text-white text-xs font-semibold px-3 py-1 disabled:opacity-50">
                        Mark given
                      </button>
                    )}
                    {t.status === 'pending' && !canDoTask && <span className="text-slate-500">Pending</span>}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      ))}
    </div>
  )
}
