import { useCallback, useEffect, useState } from 'react'
import { supabase, FACILITY_TZ } from '../lib/supabase'
import { errMsg } from '../lib/format'
import type { BarthelRow, View } from '../types'
import { BackBar, Card, ErrorBox } from './ui'

const time = (iso: string) => new Date(iso).toLocaleString('en-GB', { timeZone: FACILITY_TZ, dateStyle: 'short', timeStyle: 'short' })

const ITEMS: { key: string; label: string; options: { value: number; label: string }[] }[] = [
  { key: 'feeding', label: 'Feeding', options: [{ value: 0, label: 'Unable' }, { value: 5, label: 'Needs help' }, { value: 10, label: 'Independent' }] },
  { key: 'bathing', label: 'Bathing', options: [{ value: 0, label: 'Dependent' }, { value: 5, label: 'Independent' }] },
  { key: 'grooming', label: 'Grooming', options: [{ value: 0, label: 'Needs help' }, { value: 5, label: 'Independent' }] },
  { key: 'dressing', label: 'Dressing', options: [{ value: 0, label: 'Dependent' }, { value: 5, label: 'Needs help' }, { value: 10, label: 'Independent' }] },
  { key: 'bowels', label: 'Bowels', options: [{ value: 0, label: 'Incontinent' }, { value: 5, label: 'Occasional accident' }, { value: 10, label: 'Continent' }] },
  { key: 'bladder', label: 'Bladder', options: [{ value: 0, label: 'Incontinent' }, { value: 5, label: 'Occasional accident' }, { value: 10, label: 'Continent' }] },
  { key: 'toilet_use', label: 'Toilet use', options: [{ value: 0, label: 'Dependent' }, { value: 5, label: 'Needs some help' }, { value: 10, label: 'Independent' }] },
  { key: 'transfers', label: 'Transfers (bed/chair)', options: [{ value: 0, label: 'Unable' }, { value: 5, label: 'Major help' }, { value: 10, label: 'Minor help' }, { value: 15, label: 'Independent' }] },
  { key: 'mobility', label: 'Mobility', options: [{ value: 0, label: 'Immobile' }, { value: 5, label: 'Wheelchair independent' }, { value: 10, label: 'Walks with help' }, { value: 15, label: 'Independent' }] },
  { key: 'stairs', label: 'Stairs', options: [{ value: 0, label: 'Unable' }, { value: 5, label: 'Needs help' }, { value: 10, label: 'Independent' }] },
]

export default function Barthel({ encounterId, go }: { encounterId: string; go: (v: View) => void }) {
  const [rows, setRows] = useState<BarthelRow[]>([])
  const [scores, setScores] = useState<Record<string, number>>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const r = await supabase.from('barthel_assessments').select('*').eq('encounter_id', encounterId).order('recorded_at', { ascending: false }).limit(10)
    if (r.error) return setError(errMsg(r.error))
    setRows((r.data ?? []) as BarthelRow[])
  }, [encounterId])
  useEffect(() => { load() }, [load])

  const total = ITEMS.reduce((sum, it) => sum + (scores[it.key] ?? 0), 0)
  const complete = ITEMS.every((it) => scores[it.key] !== undefined)

  async function save() {
    setBusy(true)
    setError(null)
    const { error } = await supabase.rpc('record_barthel', { p_encounter_id: encounterId, p_items: scores })
    setBusy(false)
    if (error) return setError(errMsg(error))
    setScores({})
    load()
  }

  return (
    <div className="space-y-3">
      <BackBar title="Barthel index" onBack={() => go({ name: 'ward_charts', encounterId })} />
      <Card className="space-y-4">
        {ITEMS.map((it) => (
          <div key={it.key}>
            <p className="text-sm font-medium mb-1">{it.label}</p>
            <div className="flex flex-wrap gap-2">
              {it.options.map((o) => (
                <button
                  key={o.value} type="button" onClick={() => setScores((s) => ({ ...s, [it.key]: o.value }))}
                  className={`rounded-xl px-3 py-2 text-xs font-medium border ${scores[it.key] === o.value ? 'bg-teal-700 text-white border-teal-700' : 'bg-white border-slate-300'}`}
                >
                  {o.label} ({o.value})
                </button>
              ))}
            </div>
          </div>
        ))}
        <p className="font-semibold">Total: {total} / 100{!complete && ' (not all items answered yet)'}</p>
        <ErrorBox message={error} />
        <button onClick={save} disabled={!complete || busy} className="w-full rounded-xl bg-teal-700 text-white font-semibold py-3 disabled:opacity-50">
          {busy ? 'Saving…' : 'Save assessment'}
        </button>
      </Card>

      <Card className="space-y-2">
        <h2 className="font-semibold">History</h2>
        {rows.length === 0 && <p className="text-sm text-slate-500">No previous assessment.</p>}
        {rows.map((r) => (
          <div key={r.id} className="flex justify-between text-sm border-t border-slate-100 py-1 first:border-0">
            <span>{time(r.recorded_at)}</span><span className="font-semibold">{r.total_score} / 100</span>
          </div>
        ))}
      </Card>
    </div>
  )
}
