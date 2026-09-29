import type { TriageData } from '../types'

export const PRIORITIES = ['red', 'orange', 'yellow', 'green'] as const
export type Priority = (typeof PRIORITIES)[number]

// Full class names are written out so Tailwind can find them.
export const PRIORITY_STYLE: Record<Priority, { label: string; solid: string; soft: string }> = {
  red: { label: 'Immediate', solid: 'bg-red-600 text-white', soft: 'bg-red-50 border-red-500' },
  orange: { label: 'Very urgent', solid: 'bg-orange-500 text-white', soft: 'bg-orange-50 border-orange-500' },
  yellow: { label: 'Urgent', solid: 'bg-yellow-400 text-slate-900', soft: 'bg-yellow-50 border-yellow-500' },
  green: { label: 'Non-urgent', solid: 'bg-green-600 text-white', soft: 'bg-green-50 border-green-600' },
}

export const priorityRank = (p: string | null | undefined) => {
  const i = PRIORITIES.indexOf(p as Priority)
  return i === -1 ? 99 : i
}

export function waitLabel(iso: string, now: Date): string {
  const mins = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 60000))
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  return `${h} h ${String(mins % 60).padStart(2, '0')} min`
}

export const ageSex = (age: number | null | undefined, sex: string | null | undefined) =>
  `${age ?? '?'} y · ${sex === 'female' ? 'F' : sex === 'male' ? 'M' : '?'}`

export function gcsTotal(e?: number | null, v?: number | null, m?: number | null): number | null {
  return e && v && m ? e + v + m : null
}

export function shockIndex(hr?: number | null, sys?: number | null): number | null {
  return hr && sys ? Math.round((hr / sys) * 10) / 10 : null
}

export function vitalsLine(d: TriageData | null | undefined): string {
  const v = d?.vitals
  if (!v) return ''
  const parts: string[] = []
  if (v.bp_sys && v.bp_dia) parts.push(`BP ${v.bp_sys}/${v.bp_dia}`)
  if (v.hr) parts.push(`HR ${v.hr}`)
  if (v.spo2) parts.push(`SpO₂ ${v.spo2}%`)
  const g = gcsTotal(v.gcs_e, v.gcs_v, v.gcs_m)
  if (g) parts.push(`GCS ${g}`)
  return parts.join(' · ')
}

// Safe to call with any error shape from Supabase.
export const errMsg = (e: unknown) =>
  e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : 'Something went wrong'
