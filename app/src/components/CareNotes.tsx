import { useCallback, useEffect, useState } from 'react'
import { supabase, FACILITY_TZ } from '../lib/supabase'
import { uuid } from '../lib/uuid'
import { errMsg } from '../lib/format'
import type { CareNote, View } from '../types'
import { BackBar, Card, ErrorBox, TextArea } from './ui'

const dt = (iso: string) => new Date(iso).toLocaleString('en-GB', { timeZone: FACILITY_TZ, dateStyle: 'medium', timeStyle: 'short' })

export default function CareNotes({
  encounterId, go, canNursing, canPhysio,
}: { encounterId: string; go: (v: View) => void; canNursing: boolean; canPhysio: boolean }) {
  const [notes, setNotes] = useState<CareNote[]>([])
  const [error, setError] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [type, setType] = useState<'nursing_note' | 'physio_note'>(canNursing ? 'nursing_note' : 'physio_note')
  const [busy, setBusy] = useState(false)
  const docId = useState(() => uuid())[0]

  const load = useCallback(async () => {
    const d = await supabase
      .from('documents')
      .select('id, created_at, doc_type, data, staff:author_id(full_name)')
      .eq('encounter_id', encounterId)
      .in('doc_type', ['nursing_note', 'physio_note'])
      .order('created_at', { ascending: false })
    if (d.error) return setError(errMsg(d.error))
    setNotes((d.data ?? []) as unknown as CareNote[])
  }, [encounterId])
  useEffect(() => { load() }, [load])

  async function save() {
    setBusy(true)
    setError(null)
    const { error } = await supabase.rpc('add_care_note', { p_encounter_id: encounterId, p_note_type: type, p_text: text.trim(), p_doc_id: docId })
    setBusy(false)
    if (error) return setError(errMsg(error))
    setText('')
    load()
  }

  return (
    <div className="space-y-3">
      <BackBar title="Notes" onBack={() => go({ name: 'ward_charts', encounterId })} />

      {(canNursing || canPhysio) && (
        <Card className="space-y-3">
          {canNursing && canPhysio && (
            <div className="flex gap-2">
              <button onClick={() => setType('nursing_note')} className={`flex-1 rounded-lg py-2 text-sm font-medium ${type === 'nursing_note' ? 'bg-teal-700 text-white' : 'bg-slate-100'}`}>Nursing note</button>
              <button onClick={() => setType('physio_note')} className={`flex-1 rounded-lg py-2 text-sm font-medium ${type === 'physio_note' ? 'bg-teal-700 text-white' : 'bg-slate-100'}`}>Physio note</button>
            </div>
          )}
          <TextArea label={type === 'nursing_note' ? 'Nursing note (e.g. end of shift)' : 'Physio note'} value={text} onChange={setText} rows={4} required />
          <ErrorBox message={error} />
          <button onClick={save} disabled={text.trim().length < 2 || busy} className="w-full rounded-xl bg-teal-700 text-white font-semibold py-3 disabled:opacity-50">
            {busy ? 'Saving…' : 'Add note'}
          </button>
        </Card>
      )}

      <Card className="space-y-2">
        <h2 className="font-semibold">History</h2>
        {notes.length === 0 && <p className="text-sm text-slate-500">No notes yet.</p>}
        {notes.map((n) => (
          <div key={n.id} className="border-t border-slate-100 pt-2 first:border-0 first:pt-0">
            <div className="flex justify-between text-xs text-slate-500">
              <span>{n.doc_type === 'nursing_note' ? 'Nursing' : 'Physio'} · {n.staff?.full_name ?? ''}</span>
              <span>{dt(n.created_at)}</span>
            </div>
            <p className="text-sm">{n.data.text}</p>
          </div>
        ))}
      </Card>
    </div>
  )
}
