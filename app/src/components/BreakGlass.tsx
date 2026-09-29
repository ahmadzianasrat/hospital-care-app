import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function BreakGlass({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setBusy(true)
    setError(null)
    const { error } = await supabase.rpc('request_break_glass', { p_reason: reason })
    setBusy(false)
    if (error) setError(error.message)
    else {
      setReason('')
      setOpen(false)
      onDone()
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-xl border-2 border-red-600 text-red-700 font-semibold py-3"
      >
        Emergency access (break-glass)
      </button>
    )
  }

  return (
    <div className="rounded-xl border-2 border-red-600 bg-red-50 p-4 space-y-3">
      <p className="text-sm">
        This gives you 2 hours of access outside your shift. It is <b>recorded</b> and the head nurse can see it.
      </p>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={3}
        placeholder="Reason (at least 10 characters)"
        className="w-full rounded-lg border border-slate-300 p-3 text-base"
      />
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={submit}
          disabled={busy || reason.trim().length < 10}
          className="flex-1 rounded-xl bg-red-700 text-white font-semibold py-3 disabled:opacity-50"
        >
          {busy ? 'Working…' : 'Confirm'}
        </button>
        <button onClick={() => setOpen(false)} className="flex-1 rounded-xl bg-white border border-slate-300 py-3">
          Cancel
        </button>
      </div>
    </div>
  )
}
