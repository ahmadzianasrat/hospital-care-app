import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { ageSex, errMsg } from '../lib/format'
import type { PatientRow, View } from '../types'
import { Card, ErrorBox } from './ui'

export function PatientList({ rows, onOpen }: { rows: PatientRow[]; onOpen: (id: string) => void }) {
  return (
    <ul className="space-y-2">
      {rows.map((p) => (
        <li key={p.id}>
          <button onClick={() => onOpen(p.id)} className="w-full text-left bg-white rounded-xl shadow p-3">
            <div className="flex justify-between items-center">
              <span className="font-mono font-bold text-teal-800">{p.display_id}</span>
              <span className="text-xs text-slate-500">{ageSex(p.age_years, p.sex)}</span>
            </div>
            <p className="font-medium">{p.full_name}</p>
            {p.father_name && <p className="text-xs text-slate-500">S/o {p.father_name}</p>}
            {p.allergy_status === 'known' && <p className="text-xs font-semibold text-red-700">Allergy: {p.allergy_details}</p>}
          </button>
        </li>
      ))}
    </ul>
  )
}

// One search box: patient ID (31397HL), 6-digit x-ray number, or name.
export function usePatientSearch(q: string) {
  const [rows, setRows] = useState<PatientRow[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const latest = useRef(0)

  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) {
      setRows([])
      return
    }
    const id = ++latest.current
    const t = setTimeout(async () => {
      setBusy(true)
      const { data, error } = await supabase.rpc('search_patients', { p_query: term })
      if (id !== latest.current) return // an older search finished late; ignore it
      setBusy(false)
      if (error) setError(errMsg(error))
      else {
        setError(null)
        setRows((data ?? []) as PatientRow[])
      }
    }, 300)
    return () => clearTimeout(t)
  }, [q])

  return { rows, busy, error }
}

export default function Patients({ go }: { go: (v: View) => void }) {
  const [q, setQ] = useState('')
  const { rows, busy, error } = usePatientSearch(q)

  return (
    <div className="space-y-3">
      <h1 className="text-lg font-bold">Patients</h1>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Patient ID, x-ray number, or name"
        className="w-full rounded-xl border border-slate-300 px-4 py-3 text-base bg-white"
        autoFocus
      />
      <ErrorBox message={error} />
      {busy && <p className="text-sm text-slate-500">Searching…</p>}
      {q.trim().length >= 2 && !busy && rows.length === 0 && (
        <Card>
          <p className="text-sm text-slate-600">No patient found at your facility.</p>
        </Card>
      )}
      <PatientList rows={rows} onOpen={(id) => go({ name: 'patient', id })} />
      <button
        onClick={() => go({ name: 'register' })}
        className="w-full rounded-xl bg-teal-700 text-white font-semibold py-3"
      >
        + Register new patient
      </button>
    </div>
  )
}
