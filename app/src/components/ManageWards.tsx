import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { errMsg } from '../lib/format'
import type { View, WardRow } from '../types'
import { BackBar, Card, ErrorBox } from './ui'

// Wards carry no patient information, so creating one is a plain table insert (already allowed for
// admin/head_nurse by the wards_admin policy set up in Phase 1A) - no dedicated function needed.
export default function ManageWards({ facilityId, go }: { facilityId: string; go: (v: View) => void }) {
  const [wards, setWards] = useState<WardRow[]>([])
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    supabase.from('wards').select('id, code, name').eq('facility_id', facilityId).order('code')
      .then(({ data }) => setWards((data ?? []) as WardRow[]))
  }, [facilityId])
  useEffect(() => { load() }, [load])

  async function addWard() {
    setBusy(true)
    setError(null)
    const { error } = await supabase.from('wards').insert({
      facility_id: facilityId, code: code.trim().toUpperCase().replace(/\s+/g, '_'), name: name.trim(),
    })
    setBusy(false)
    if (error) return setError(error.message.includes('duplicate') ? 'A ward with that code already exists.' : errMsg(error))
    setCode('')
    setName('')
    load()
  }

  return (
    <div className="space-y-3">
      <BackBar title="Manage wards" onBack={() => go({ name: 'home' })} />
      <Card className="space-y-3">
        <h2 className="font-semibold">Add a ward</h2>
        <label className="block text-sm">
          <span className="text-slate-600">Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sub-ICU" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-base" />
        </label>
        <label className="block text-sm">
          <span className="text-slate-600">Short code</span>
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. SUBICU" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-base" />
        </label>
        <ErrorBox message={error} />
        <button onClick={addWard} disabled={busy || !name.trim() || !code.trim()} className="w-full rounded-xl bg-teal-700 text-white font-semibold py-3 disabled:opacity-50">
          {busy ? 'Adding…' : 'Add ward'}
        </button>
      </Card>

      <Card className="space-y-1">
        <h2 className="font-semibold mb-1">Existing wards</h2>
        {wards.map((w) => <p key={w.id} className="text-sm">{w.name} <span className="text-slate-400 font-mono text-xs">({w.code})</span></p>)}
      </Card>
      <p className="text-xs text-slate-500">
        After adding a ward, set up its beds and staffing minimums from the Wards and Ward staffing screens.
      </p>
    </div>
  )
}
