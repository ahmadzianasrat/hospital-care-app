import { useCallback, useEffect, useState } from 'react'
import { supabase, FACILITY_TZ } from '../lib/supabase'
import { errMsg } from '../lib/format'
import type { FeedbackRow, View } from '../types'
import { BackBar, Card, ErrorBox } from './ui'

const dt = (iso: string) => new Date(iso).toLocaleString('en-GB', { timeZone: FACILITY_TZ, dateStyle: 'medium', timeStyle: 'short' })
const TABS = ['open', 'reviewed', 'resolved'] as const

export default function FeedbackReview({ go }: { go: (v: View) => void }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>('open')
  const [rows, setRows] = useState<FeedbackRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('feedback')
      .select('id, message, screen, status, created_at, staff:staff_id(full_name)')
      .eq('status', tab)
      .order('created_at', { ascending: false })
    if (error) return setError(errMsg(error))
    setError(null)
    setRows((data ?? []) as unknown as FeedbackRow[])
  }, [tab])
  useEffect(() => { load() }, [load])

  async function mark(id: string, status: string) {
    setBusyId(id)
    const { error } = await supabase.rpc('mark_feedback', { p_id: id, p_status: status })
    setBusyId(null)
    if (error) setError(errMsg(error))
    else load()
  }

  return (
    <div className="space-y-3">
      <BackBar title="Feedback inbox" onBack={() => go({ name: 'home' })} />
      <div className="flex gap-1 bg-slate-200 rounded-xl p-1">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`flex-1 rounded-lg py-2 text-sm font-semibold capitalize ${tab === t ? 'bg-white shadow' : 'text-slate-600'}`}>
            {t}
          </button>
        ))}
      </div>
      <ErrorBox message={error} />
      {rows === null && <p className="text-slate-500">Loading…</p>}
      {rows?.length === 0 && <Card><p className="text-sm text-slate-600">Nothing here.</p></Card>}
      {rows?.map((r) => (
        <Card key={r.id} className="space-y-2">
          <div className="flex justify-between text-xs text-slate-500">
            <span>{r.staff?.full_name ?? 'Unknown'}{r.screen ? ` · ${r.screen}` : ''}</span>
            <span>{dt(r.created_at)}</span>
          </div>
          <p className="text-sm">{r.message}</p>
          <div className="flex gap-2">
            {tab !== 'reviewed' && (
              <button onClick={() => mark(r.id, 'reviewed')} disabled={busyId === r.id} className="flex-1 rounded-lg bg-slate-800 text-white text-xs font-semibold py-2 disabled:opacity-50">
                Mark reviewed
              </button>
            )}
            {tab !== 'resolved' && (
              <button onClick={() => mark(r.id, 'resolved')} disabled={busyId === r.id} className="flex-1 rounded-lg bg-teal-700 text-white text-xs font-semibold py-2 disabled:opacity-50">
                Mark resolved
              </button>
            )}
            {tab !== 'open' && (
              <button onClick={() => mark(r.id, 'open')} disabled={busyId === r.id} className="flex-1 rounded-lg bg-white border border-slate-300 text-xs py-2 disabled:opacity-50">
                Reopen
              </button>
            )}
          </div>
        </Card>
      ))}
    </div>
  )
}
