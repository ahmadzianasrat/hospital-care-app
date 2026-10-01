export type AccessStatus = {
  staff_id: string
  full_name: string
  app_role: string
  facility_id: string
  facility_code: string
  on_duty: boolean
  break_glass_until: string | null
}

export type RosterRow = {
  id: string
  work_date: string
  shift_types: { name: string; start_time: string | null; end_time: string | null } | null
  wards: { name: string } | null
}

export const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  chief_surgeon: 'Chief surgeon',
  head_nurse: 'Head nurse',
  team_leader: 'Team leader',
  doctor: 'Doctor',
  nurse: 'Nurse',
  physio: 'Physiotherapist',
  midwife: 'Midwife',
  lab: 'Laboratory',
  radiology: 'Radiology',
  trainer: 'Trainer',
  trainee: 'Trainee nurse',
  cleaner: 'Cleaning team',
  coordinator: 'Coordinator',
}

// Who can do what (the database enforces this too; this only decides which buttons to show).
export const TRIAGE_ROLES = ['nurse', 'team_leader', 'head_nurse', 'doctor', 'chief_surgeon']
export const OPD_ROLES = ['doctor', 'chief_surgeon']
export const PATIENT_VIEW_ROLES = [
  'chief_surgeon', 'head_nurse', 'doctor', 'nurse', 'team_leader', 'physio', 'midwife',
  'lab', 'radiology', 'coordinator', 'trainee',
]

export type PatientRow = {
  id: string
  display_id: string
  full_name: string
  father_name: string | null
  sex: 'male' | 'female'
  age_years: number | null
  phone: string | null
  district: string | null
  blood_group: string
  allergy_status: 'unknown' | 'none' | 'known'
  allergy_details: string | null
  facility_id: string
  created_at: string
}

export type EncounterRow = {
  id: string
  patient_id: string
  facility_id: string
  status: string
  arrived_at: string
  triage_priority: string | null
  triage_decision: string | null
  opd_doctor_id: string | null
  patients: PatientRow | null
  doctor: { full_name: string } | null
}

export type TriageData = {
  arrival?: {
    mode?: string
    from?: string
    incident?: string
    trauma_type?: string
    hours_since_injury?: number | null
  }
  vitals?: {
    bp_sys?: number | null
    bp_dia?: number | null
    hr?: number | null
    rr?: number | null
    spo2?: number | null
    temp_c?: number | null
    gcs_e?: number | null
    gcs_v?: number | null
    gcs_m?: number | null
    pupil_left?: string
    pupil_right?: string
  }
  primary_survey?: {
    massive_haemorrhage?: boolean
    airway_compromised?: boolean
    breathing_distress?: boolean
    c_spine_collar?: boolean
  }
  injury_description?: string
  notes?: string
}

export type PatientPrefill = {
  full_name?: string
  father_name?: string | null
  sex?: string
  age_years?: number | null
  phone?: string | null
  district?: string | null
  blood_group?: string
  allergy_status?: string
  allergy_details?: string | null
}

export type ReferralPayload = {
  patient?: PatientPrefill & { display_id?: string }
  triage?: { priority?: string | null; data?: TriageData | null }
  opd?: { diagnosis?: string; findings?: string; history?: string; plan?: string } | null
  treatments?: Treatment[]
  treatment_given?: string | null
  transport?: string | null
  from?: { facility_code?: string; facility_name?: string; sender?: string }
}

export type Treatment = {
  procedure?: string
  drug?: string
  dose?: string
  route?: string
  note?: string
  given_at?: string
  given_by?: string
}

export type ReferralRow = {
  id: string
  encounter_id: string
  from_facility_id: string
  to_facility_id: string | null
  to_external: string | null
  reason: string
  eta: string | null
  status: 'sent' | 'received' | 'arrived' | 'cancelled'
  payload: ReferralPayload
  created_at: string
  arrived_patient_id: string | null
  from: { code: string; name: string } | null
  to: { code: string; name: string } | null
  arrived: { display_id: string } | null
}

export type BedRow = { id: string; ward_id: string; code: string; active: boolean }
export type WardRow = { id: string; code: string; name: string }

export type BedStayRow = {
  id: string
  encounter_id: string
  bed_id: string
  from_at: string
  to_at: string | null
  beds: BedRow | null
}

export type OrderRow = {
  id: string
  encounter_id: string
  order_type: string
  details: { instruction?: string; [k: string]: unknown }
  frequency: string
  duration_days: number
  status: string
  ordered_at: string
  ordered_by: string
  staff?: { full_name: string } | null
}

export type TaskRow = {
  id: string
  order_id: string
  encounter_id: string
  due_at: string
  status: 'pending' | 'done' | 'skipped'
  done_by: string | null
  done_at: string | null
  note: string | null
  orders?: { order_type: string; details: { instruction?: string } } | null
}

export const ORDER_TYPE_LABELS: Record<string, string> = {
  medication: 'Medication',
  iv_fluid: 'IV fluid',
  diet: 'Diet',
  mobilization: 'Mobilization',
  xray: 'X-ray',
  lab: 'Lab',
  physio: 'Physio',
  device: 'Device',
  discharge_plan: 'Discharge plan',
  other: 'Other',
}
export const FREQUENCY_LABELS: Record<string, string> = {
  once: 'Once', stat: 'Now (STAT)', od: 'Once daily', bid: 'Twice daily',
  tid: '3 times daily', qid: '4 times daily', continuous: 'Continuous',
}

export type ObservationRow = {
  id: string; recorded_at: string; bp_sys: number | null; bp_dia: number | null; hr: number | null
  rr: number | null; spo2: number | null; temp_c: number | null
  gcs_e: number | null; gcs_v: number | null; gcs_m: number | null
  pupil_left: string | null; pupil_right: string | null; note: string | null
}
export type CirculationRow = {
  id: string; recorded_at: string; limb: string; movement: string; sensation: string
  capillary_refill_sec: number | null; temperature: string | null; color: string | null
  bleeding: boolean; oozing: boolean; note: string | null
}
export type FluidEventRow = {
  id: string; recorded_at: string; category: string; direction: 'in' | 'out'; volume_ml: number; note: string | null
}
export type FluidBalance = {
  total_in_ml: number; total_out_ml: number; balance_ml: number
  last24_in_ml: number; last24_out_ml: number; last24_balance_ml: number
}
export type BarthelRow = { id: string; recorded_at: string; items: Record<string, number>; total_score: number }
export type CareNote = { id: string; created_at: string; doc_type: 'nursing_note' | 'physio_note'; data: { text: string }; staff?: { full_name: string } | null }

export const FLUID_LABELS: Record<string, string> = {
  iv_fluid: 'IV fluid', blood_product: 'Blood product', oral_intake: 'Oral intake',
  urine: 'Urine', stool: 'Stool', vomitus: 'Vomitus', drain: 'Drain', insensible_loss: 'Insensible loss', other_output: 'Other output',
}
export const FLUID_DIRECTION: Record<string, 'in' | 'out'> = {
  iv_fluid: 'in', blood_product: 'in', oral_intake: 'in',
  urine: 'out', stool: 'out', vomitus: 'out', drain: 'out', insensible_loss: 'out', other_output: 'out',
}

export type RoundStop = { encounterId: string; bedCode: string; patient: PatientRow }

export type TheatreRow = { id: string; code: string; name: string; active: boolean }
export type SurgeryTeamMember = { role: string; name: string }
export type SurgeryRow = {
  id: string
  encounter_id: string
  theatre_id: string
  urgency: 'emergency' | 'elective'
  diagnosis: string
  planned_procedure: string
  anaesthesia_type: string
  asa_class: string
  surgeon_id: string
  team: SurgeryTeamMember[]
  scheduled_start: string
  scheduled_end: string
  actual_start: string | null
  actual_end: string | null
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled'
  cancel_reason: string | null
  findings: string | null
  procedures_done: string | null
  outcome: 'alive' | 'deceased' | null
  theatres?: TheatreRow | null
  surgeon?: { full_name: string } | null
  encounters?: { patients: PatientRow } | null
}

export const ASA_CLASSES = ['I', 'II', 'III', 'IV', 'V']
export const ANAESTHESIA_TYPES = ['general', 'spinal', 'sedation', 'local']

export type StaffRow = { id: string; full_name: string; app_role: string; profession: string; active: boolean }
export type ShiftTypeRow = { id: string; code: string; name: string; start_time: string | null; end_time: string | null; counts_as_duty: boolean }
export type RosterEntryRow = {
  id: string; work_date: string; status: 'draft' | 'published'; staff_id: string
  shift_types: ShiftTypeRow | null; wards: { name: string } | null
}
export type TrainingProgramRow = { id: string; name: string; total_weeks: number }
export type ProgramPhaseRow = { id: string; program_id: string; phase_number: number; name: string; start_week: number; end_week: number; mornings_only: boolean; supernumerary: boolean }
export type EnrollmentRow = { id: string; staff_id: string; program_id: string; start_date: string; staff?: StaffRow | null }
export type LectureSessionRow = { id: string; program_id: string; topic: string; scheduled_at: string; duration_minutes: number; trainer?: { full_name: string } | null }
export type AttendanceRow = { id: string; session_id: string; staff_id: string; status: 'present' | 'absent' | 'excused' }
export type AssessmentRow = { id: string; program_id: string; staff_id: string; assessment_type: string; scheduled_at: string; score: number; max_score: number; passed: boolean; note: string | null }
export type RosterRequestRow = {
  id: string; request_type: 'leave' | 'cover'; reason: string; status: 'pending' | 'approved' | 'denied'
  roster_entry_id: string; cover_staff_id: string | null
  staff?: StaffRow | null; cover_staff?: StaffRow | null
  roster_entries?: { work_date: string; shift_types: { name: string } | null } | null
}

export const ASSESSMENT_LABELS: Record<string, string> = {
  after_lectures: 'After lectures', intermediate: 'Intermediate', final_exam: 'Final exam',
}

export type View =
  | { name: 'home' }
  | { name: 'feedback' }
  | { name: 'roster_builder' }
  | { name: 'roster_requests' }
  | { name: 'trainee_programs' }
  | { name: 'trainer_hub' }
  | { name: 'lecture_detail'; sessionId: string }
  | { name: 'ot' }
  | { name: 'book_surgery'; encounterId: string }
  | { name: 'surgery_detail'; surgeryId: string }
  | { name: 'round_mode'; wardId: string }
  | { name: 'ward_charts'; encounterId: string }
  | { name: 'chart_vitals'; encounterId: string }
  | { name: 'chart_circulation'; encounterId: string }
  | { name: 'chart_fluids'; encounterId: string }
  | { name: 'chart_barthel'; encounterId: string }
  | { name: 'chart_notes'; encounterId: string }
  | { name: 'wards' }
  | { name: 'ward'; wardId: string }
  | { name: 'ward_patient'; encounterId: string }
  | { name: 'assign_bed'; encounterId: string }
  | { name: 'order_form'; encounterId: string }
  | { name: 'patients' }
  | { name: 'register'; prefill?: PatientPrefill; referralId?: string }
  | { name: 'referrals' }
  | { name: 'referral_form'; encounterId: string }
  | { name: 'outbox' }
  | { name: 'patient'; id: string }
  | { name: 'triage' }
  | { name: 'triage_form'; encounterId: string }
  | { name: 'opd' }
  | { name: 'opd_visit'; encounterId: string }
