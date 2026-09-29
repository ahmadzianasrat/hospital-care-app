import type { OfflineEngine } from './offline/engine'

// Opens a visit for a patient (or returns the one already open). Offline-safe: if we are offline,
// or a queued action for this patient hasn't reached the server yet, it is saved for later instead.
export async function startVisit(
  engine: OfflineEngine,
  userId: string,
  patientId: string,
  patientForDisplay: { id: string; display_id: string },
): Promise<{ id: string; status: string; alreadyOpen: boolean; queued: boolean }> {
  const newId = crypto.randomUUID()
  const result = await engine.perform({
    userId,
    type: 'start_visit',
    params: { p_patient_id: patientId, p_id: newId },
    entityIds: [newId],
    dependsOn: [patientId],
    label: `Start visit: ${patientForDisplay.display_id}`,
    enc: { id: newId, patient_id: patientId, facility_id: '', arrived_at: new Date().toISOString(), patients: patientForDisplay },
  })
  if (!result.ok) throw new Error(result.error)
  if (result.queued) return { id: newId, status: 'waiting_triage', alreadyOpen: false, queued: true }
  const enc = result.data as { id: string; status: string }
  return { ...enc, alreadyOpen: enc.id !== newId, queued: false }
}
