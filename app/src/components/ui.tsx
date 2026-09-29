import type { ReactNode } from 'react'
import { PRIORITY_STYLE, type Priority } from '../lib/format'
import { ageSex } from '../lib/format'
import type { PatientRow } from '../types'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`bg-white rounded-2xl shadow p-4 ${className}`}>{children}</section>
}

export function BackBar({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <button onClick={onBack} className="rounded-lg bg-white border border-slate-300 px-3 py-2 text-sm">
        ← Back
      </button>
      <h1 className="text-lg font-bold">{title}</h1>
    </div>
  )
}

export function ErrorBox({ message }: { message: string | null }) {
  if (!message) return null
  return <p className="text-sm text-red-800 bg-red-50 border border-red-300 rounded-lg p-3">{message}</p>
}

export function PriorityBadge({ priority }: { priority: string | null }) {
  if (!priority || !(priority in PRIORITY_STYLE)) {
    return <span className="text-xs rounded-full bg-slate-200 px-2 py-1">Not triaged</span>
  }
  const s = PRIORITY_STYLE[priority as Priority]
  return <span className={`text-xs font-semibold rounded-full px-2 py-1 ${s.solid}`}>{s.label}</span>
}

export function PatientHeader({ patient }: { patient: PatientRow }) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-mono text-2xl font-bold text-teal-800">{patient.display_id}</p>
          <p className="font-semibold">{patient.full_name}</p>
          <p className="text-sm text-slate-600">
            {patient.father_name ? `S/o ${patient.father_name} · ` : ''}
            {ageSex(patient.age_years, patient.sex)}
          </p>
        </div>
        <span className="text-sm rounded-lg bg-slate-100 px-2 py-1 font-semibold">{patient.blood_group}</span>
      </div>
      <AllergyLine patient={patient} />
    </Card>
  )
}

export function AllergyLine({ patient }: { patient: Pick<PatientRow, 'allergy_status' | 'allergy_details'> }) {
  if (patient.allergy_status === 'known') {
    return <p className="mt-2 text-sm font-semibold text-red-700 bg-red-50 rounded-lg p-2">ALLERGY: {patient.allergy_details}</p>
  }
  if (patient.allergy_status === 'none') return <p className="mt-2 text-xs text-slate-500">No known allergies</p>
  return <p className="mt-2 text-xs text-amber-700">Allergies unknown. Ask if possible.</p>
}

// A row of big buttons to pick one value.
export function Choice<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T | ''
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          type="button"
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-xl px-4 py-3 text-sm font-medium border ${
            value === o.value ? 'bg-teal-700 text-white border-teal-700' : 'bg-white border-slate-300'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function YesNo({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <span className="text-sm">{label}</span>
      <div className="flex gap-1">
        {[false, true].map((v) => (
          <button
            type="button"
            key={String(v)}
            onClick={() => onChange(v)}
            className={`w-16 rounded-lg py-2 text-sm font-medium border ${
              value === v ? (v ? 'bg-red-600 text-white border-red-600' : 'bg-teal-700 text-white border-teal-700') : 'bg-white border-slate-300'
            }`}
          >
            {v ? 'Yes' : 'No'}
          </button>
        ))}
      </div>
    </div>
  )
}

export function NumField({
  label, value, onChange, unit, min, max,
}: {
  label: string; value: string; onChange: (v: string) => void; unit?: string; min?: number; max?: number
}) {
  return (
    <label className="block text-sm">
      <span className="text-slate-600">{label}{unit ? ` (${unit})` : ''}</span>
      <input
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-base"
      />
    </label>
  )
}

export function TextArea({
  label, value, onChange, rows = 3, required,
}: {
  label: string; value: string; onChange: (v: string) => void; rows?: number; required?: boolean
}) {
  return (
    <label className="block text-sm">
      <span className="text-slate-600">{label}{required ? ' *' : ''}</span>
      <textarea
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-base"
      />
    </label>
  )
}

export const numOrNull = (s: string): number | null => (s.trim() === '' || isNaN(Number(s)) ? null : Number(s))
