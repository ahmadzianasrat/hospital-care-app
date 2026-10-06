import { useEffect, useState } from 'react'
import { supabase, FACILITY_TZ } from '../lib/supabase'
import { useIncomingReferralCount, useNow } from '../hooks'
import { useOffline } from '../lib/offline/context'
import SyncBar from './SyncBar'
import Outbox from './Outbox'
import OfflineReady from './OfflineReady'
import {
  OPD_ROLES, PATIENT_VIEW_ROLES, ROLE_LABELS, TRIAGE_ROLES,
  type AccessStatus, type View,
} from '../types'
import Patients from './Patients'
import RegisterPatient from './RegisterPatient'
import PatientView from './PatientView'
import TriageQueue from './TriageQueue'
import TriageForm from './TriageForm'
import OpdQueue from './OpdQueue'
import OpdVisit from './OpdVisit'
import Referrals from './Referrals'
import ReferralForm from './ReferralForm'
import WardList from './WardList'
import WardBoard from './WardBoard'
import AssignBed from './AssignBed'
import WardPatient from './WardPatient'
import OrderForm from './OrderForm'
import WardCharts from './WardCharts'
import VitalsChart from './VitalsChart'
import CirculationChart from './CirculationChart'
import FluidBalanceScreen from './FluidBalance'
import Barthel from './Barthel'
import CareNotes from './CareNotes'
import RoundMode from './RoundMode'
import FeedbackForm from './FeedbackForm'
import OTBoard from './OTBoard'
import BookSurgery from './BookSurgery'
import SurgeryDetail from './SurgeryDetail'
import RosterBuilder from './RosterBuilder'
import RosterRequests from './RosterRequests'
import TraineePrograms from './TraineePrograms'
import TrainerHub from './TrainerHub'
import LectureAttendance from './LectureAttendance'
import Dashboard from './Dashboard'
import MassCasualtyBoard from './MassCasualtyBoard'
import PrintChart from './PrintChart'
import FacilitySwitcher from './FacilitySwitcher'
import FeedbackReview from './FeedbackReview'
import Wristband from './Wristband'
import ScanPatient from './ScanPatient'
import DonorReport from './DonorReport'
import Roster from './Roster'
import DataCheck from './DataCheck'

export default function Workspace({ status }: { status: AccessStatus }) {
  const { engine } = useOffline()
  const [view, setView] = useState<View>({ name: 'home' })
  const [flash, setFlash] = useState<string | null>(null)

  const [modules, setModules] = useState<string[] | null>(null) // which modules this facility uses

  useEffect(() => {
    supabase
      .from('facilities')
      .select('enabled_modules')
      .eq('id', status.facility_id)
      .maybeSingle()
      .then(({ data }) => setModules((data?.enabled_modules as string[] | undefined) ?? null))
  }, [status.facility_id])

  const has = (m: string) => modules === null || modules.includes(m) // show everything until loaded

  const role = status.app_role
  const canPatients = PATIENT_VIEW_ROLES.includes(role) || role === 'team_leader'
  const canTriage = TRIAGE_ROLES.includes(role) && has('triage')
  const canOpd = OPD_ROLES.includes(role) && has('opd')
  const canReferrals = TRIAGE_ROLES.includes(role) && has('referral')
  const WARD_ROLES = ['nurse', 'team_leader', 'head_nurse', 'physio', 'midwife', 'doctor', 'chief_surgeon']
  const canWards = WARD_ROLES.includes(role) && has('wards')
  const canOrder = ['doctor', 'chief_surgeon'].includes(role)
  const canDischargeWard = ['doctor', 'chief_surgeon'].includes(role)
  const canOT = WARD_ROLES.includes(role) && has('surgery')
  const canManageSurgery = ['nurse', 'team_leader', 'head_nurse', 'doctor', 'chief_surgeon'].includes(role)
  const canOperate = ['doctor', 'chief_surgeon'].includes(role)
  const canBuildRoster = ['admin', 'head_nurse'].includes(role) && has('roster')
  const canTrain = ['trainer', 'admin', 'head_nurse'].includes(role) && has('training')
  const canDashboard = ['admin', 'head_nurse', 'chief_surgeon', 'coordinator'].includes(role)
  const canExportReports = ['head_nurse', 'chief_surgeon', 'coordinator'].includes(role)
  const canMassCasualty = PATIENT_VIEW_ROLES.includes(role) || role === 'team_leader'
  const canSwitchFacility = ['head_nurse', 'chief_surgeon', 'coordinator'].includes(role)
  const [viewFacilityId, setViewFacilityId] = useState(status.facility_id)
  const viewingOther = viewFacilityId !== status.facility_id
  const canReviewFeedback = ['admin', 'head_nurse'].includes(role)
  const canDonorReport = ['admin', 'head_nurse', 'chief_surgeon', 'coordinator'].includes(role)
  const incoming = useIncomingReferralCount(status.facility_id, canReferrals)

  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 4000)
    return () => clearTimeout(t)
  }, [flash])

  const go = (v: View) => {
    setView(v)
    window.scrollTo(0, 0)
  }

  const tabs: { key: string; label: string; target: View; show: boolean; active: boolean }[] = [
    { key: 'home', label: 'Home', target: { name: 'home' }, show: true, active: view.name === 'home' },
    {
      key: 'patients', label: 'Patients', target: { name: 'patients' }, show: canPatients,
      active: ['patients', 'register', 'patient'].includes(view.name),
    },
    { key: 'triage', label: 'Triage', target: { name: 'triage' }, show: canTriage, active: ['triage', 'triage_form'].includes(view.name) },
    { key: 'opd', label: 'OPD', target: { name: 'opd' }, show: canOpd, active: ['opd', 'opd_visit'].includes(view.name) },
    {
      key: 'referrals', label: incoming ? `Referrals (${incoming})` : 'Referrals', target: { name: 'referrals' },
      show: canReferrals, active: ['referrals', 'referral_form'].includes(view.name),
    },
    {
      key: 'wards', label: 'Wards', target: { name: 'wards' }, show: canWards,
      active: [
        'wards', 'ward', 'ward_patient', 'assign_bed', 'order_form', 'ward_charts',
        'chart_vitals', 'chart_circulation', 'chart_fluids', 'chart_barthel', 'chart_notes',
        'round_mode',
      ].includes(view.name),
    },
    {
      key: 'ot', label: 'OT', target: { name: 'ot' }, show: canOT,
      active: ['ot', 'book_surgery', 'surgery_detail'].includes(view.name),
    },
  ]

  return (
    <div className="pb-24 space-y-4">
      <SyncBar userId={status.staff_id} />
      {flash && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-300 p-3 text-sm font-medium text-emerald-900">{flash}</div>
      )}

      {view.name === 'home' && <DutyHome status={status} go={go} canPatients={canPatients} canTriage={canTriage} canOpd={canOpd} canReferrals={canReferrals} incoming={incoming} canWards={canWards} canOT={canOT} canBuildRoster={canBuildRoster} canTrain={canTrain} canDashboard={canDashboard} canMassCasualty={canMassCasualty} canReviewFeedback={canReviewFeedback} canDonorReport={canDonorReport} />}
      {view.name === 'patients' && <Patients go={go} />}
      {view.name === 'register' && (
        <RegisterPatient
          key={view.referralId ?? 'new'} go={go} notify={setFlash} prefill={view.prefill} referralId={view.referralId}
          staffId={status.staff_id} facilityId={status.facility_id} facilityCode={status.facility_code}
        />
      )}
      {view.name === 'patient' && <PatientView id={view.id} go={go} notify={setFlash} canStartVisit={canTriage} staffId={status.staff_id} />}
      {view.name === 'triage' && <TriageQueue facilityId={status.facility_id} staffId={status.staff_id} go={go} />}
      {view.name === 'triage_form' && (
        <TriageForm encounterId={view.encounterId} go={go} notify={setFlash} hasOpd={has('opd')} staffId={status.staff_id} />
      )}
      {view.name === 'opd' && <OpdQueue facilityId={status.facility_id} staffId={status.staff_id} go={go} />}
      {view.name === 'opd_visit' && (
        <OpdVisit encounterId={view.encounterId} staffId={status.staff_id} go={go} notify={setFlash} />
      )}

      {view.name === 'referrals' && <Referrals facilityId={status.facility_id} staffId={status.staff_id} go={go} />}
      {view.name === 'referral_form' && (
        <ReferralForm
          encounterId={view.encounterId} facilityId={status.facility_id} staffId={status.staff_id} go={go} notify={setFlash}
        />
      )}
      {view.name === 'outbox' && <Outbox userId={status.staff_id} go={go} />}
      {view.name === 'wards' && (
        <div className="space-y-2">
          {canSwitchFacility && <FacilitySwitcher homeFacilityId={status.facility_id} value={viewFacilityId} onChange={setViewFacilityId} />}
          <WardList facilityId={viewFacilityId} go={go} readOnly={viewingOther} />
        </div>
      )}
      {view.name === 'ward' && <WardBoard wardId={view.wardId} go={go} />}
      {view.name === 'assign_bed' && (
        <AssignBed encounterId={view.encounterId} facilityId={status.facility_id} go={go} notify={setFlash} />
      )}
      {view.name === 'ward_patient' && (
        <WardPatient
          encounterId={view.encounterId} go={go} notify={setFlash}
          canOrder={canOrder} canDoTask={canWards} canDischarge={canDischargeWard}
        />
      )}
      {view.name === 'order_form' && <OrderForm encounterId={view.encounterId} go={go} notify={setFlash} />}
      {view.name === 'ward_charts' && <WardCharts encounterId={view.encounterId} go={go} />}
      {view.name === 'chart_vitals' && <VitalsChart encounterId={view.encounterId} go={go} />}
      {view.name === 'chart_circulation' && <CirculationChart encounterId={view.encounterId} go={go} />}
      {view.name === 'chart_fluids' && <FluidBalanceScreen encounterId={view.encounterId} go={go} />}
      {view.name === 'chart_barthel' && <Barthel encounterId={view.encounterId} go={go} />}
      {view.name === 'chart_notes' && (
        <CareNotes
          encounterId={view.encounterId} go={go}
          canNursing={['nurse', 'team_leader', 'head_nurse', 'doctor', 'chief_surgeon'].includes(role)}
          canPhysio={['physio', 'doctor', 'chief_surgeon'].includes(role)}
        />
      )}
      {view.name === 'round_mode' && <RoundMode wardId={view.wardId} go={go} notify={setFlash} canWrite={canOrder} />}
      {view.name === 'feedback' && <FeedbackForm onBack={() => go({ name: 'home' })} />}
      {view.name === 'ot' && (
        <div className="space-y-2">
          {canSwitchFacility && <FacilitySwitcher homeFacilityId={status.facility_id} value={viewFacilityId} onChange={setViewFacilityId} />}
          <OTBoard facilityId={viewFacilityId} go={go} readOnly={viewingOther} />
        </div>
      )}
      {view.name === 'book_surgery' && (
        <BookSurgery encounterId={view.encounterId} facilityId={status.facility_id} go={go} notify={setFlash} />
      )}
      {view.name === 'surgery_detail' && (
        <SurgeryDetail surgeryId={view.surgeryId} go={go} notify={setFlash} canManage={canManageSurgery} canOperate={canOperate} />
      )}
      {view.name === 'roster_builder' && <RosterBuilder facilityId={status.facility_id} go={go} />}
      {view.name === 'roster_requests' && <RosterRequests go={go} />}
      {view.name === 'trainee_programs' && <TraineePrograms facilityId={status.facility_id} go={go} />}
      {view.name === 'trainer_hub' && <TrainerHub facilityId={status.facility_id} go={go} />}
      {view.name === 'lecture_detail' && <LectureAttendance sessionId={view.sessionId} go={go} />}
      {view.name === 'dashboard' && <Dashboard canExport={canExportReports} go={go} />}
      {view.name === 'mass_casualty' && (
        <div className="space-y-2">
          {canSwitchFacility && <FacilitySwitcher homeFacilityId={status.facility_id} value={viewFacilityId} onChange={setViewFacilityId} />}
          <MassCasualtyBoard facilityId={viewFacilityId} go={go} />
        </div>
      )}
      {view.name === 'print_chart' && <PrintChart encounterId={view.encounterId} go={go} />}
      {view.name === 'feedback_review' && <FeedbackReview go={go} />}
      {view.name === 'wristband' && <Wristband patientId={view.patientId} go={go} />}
      {view.name === 'scan_patient' && <ScanPatient go={go} />}
      {view.name === 'donor_report' && <DonorReport go={go} />}

      <nav className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-200">
        <div className="max-w-md mx-auto flex">
          {tabs.filter((t) => t.show).map((t) => (
            <button
              key={t.key}
              onClick={() => go(t.target)}
              className={`flex-1 py-4 text-sm font-semibold ${t.active ? 'text-teal-700 border-t-2 border-teal-700' : 'text-slate-500'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}

function DutyHome({
  status, go, canPatients, canTriage, canOpd, canReferrals, incoming, canWards, canOT, canBuildRoster, canTrain,
  canDashboard, canMassCasualty, canReviewFeedback, canDonorReport,
}: {
  status: AccessStatus; go: (v: View) => void; canPatients: boolean; canTriage: boolean; canOpd: boolean
  canReferrals: boolean; incoming: number; canWards: boolean; canOT: boolean; canBuildRoster: boolean; canTrain: boolean
  canDashboard: boolean; canMassCasualty: boolean; canReviewFeedback: boolean; canDonorReport: boolean
}) {
  const now = useNow()
  const clock = now.toLocaleTimeString('en-GB', { timeZone: FACILITY_TZ, hour: '2-digit', minute: '2-digit' })
  const breakGlass = status.break_glass_until && new Date(status.break_glass_until) > now

  const modules: { label: string; target?: View; enabled: boolean; note?: string }[] = [
    { label: 'Patients', target: { name: 'patients' }, enabled: canPatients },
    { label: 'Triage', target: { name: 'triage' }, enabled: canTriage },
    { label: 'OPD queue', target: { name: 'opd' }, enabled: canOpd },
    { label: incoming ? `Referrals (${incoming} new)` : 'Referrals', target: { name: 'referrals' }, enabled: canReferrals },
    { label: 'Wards', target: { name: 'wards' }, enabled: canWards },
    { label: 'Operating theatre', target: { name: 'ot' }, enabled: canOT },
    { label: 'Build roster', target: { name: 'roster_builder' }, enabled: canBuildRoster },
    { label: 'Roster requests', target: { name: 'roster_requests' }, enabled: canBuildRoster },
    { label: 'Trainee programs', target: { name: 'trainee_programs' }, enabled: canBuildRoster },
    { label: 'Trainer tools', target: { name: 'trainer_hub' }, enabled: canTrain },
    { label: 'Dashboard', target: { name: 'dashboard' }, enabled: canDashboard },
    { label: 'Mass casualty board', target: { name: 'mass_casualty' }, enabled: canMassCasualty },
    { label: 'Feedback inbox', target: { name: 'feedback_review' }, enabled: canReviewFeedback },
    { label: 'Scan patient QR', target: { name: 'scan_patient' }, enabled: canPatients },
    { label: 'Donor / ministry report', target: { name: 'donor_report' }, enabled: canDonorReport },
  ]

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold">{status.full_name}</h1>
          <p className="text-sm text-slate-600">{ROLE_LABELS[status.app_role] ?? status.app_role} · {status.facility_code}</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold tabular-nums">{clock}</p>
          <p className="text-xs text-slate-500">Facility time</p>
        </div>
      </header>

      <div className="rounded-xl bg-emerald-50 border border-emerald-300 p-4">
        <p className="font-semibold text-emerald-800">On duty. Access is open.</p>
        {breakGlass && (
          <p className="text-sm text-red-700 mt-1">
            Emergency access until{' '}
            {new Date(status.break_glass_until!).toLocaleTimeString('en-GB', { timeZone: FACILITY_TZ, hour: '2-digit', minute: '2-digit' })}
            . This is being recorded.
          </p>
        )}
      </div>

      <section className="grid grid-cols-2 gap-3">
        {modules.map((m) => (
          <button
            key={m.label}
            disabled={!m.enabled}
            onClick={() => m.target && go(m.target)}
            className={`rounded-xl bg-white shadow p-4 text-left ${m.enabled ? '' : 'opacity-50'}`}
          >
            <p className="font-medium">{m.label}</p>
            {!m.enabled && <p className="text-xs text-slate-500">{m.note ?? 'Not available for your role or facility'}</p>}
          </button>
        ))}
      </section>

      <OutboxTile go={go} staffId={status.staff_id} />
      {canPatients && <OfflineReady facilityId={status.facility_id} />}
      <button onClick={() => go({ name: 'feedback' })} className="w-full rounded-xl bg-white border border-slate-300 py-3 font-medium">
        Report a problem
      </button>
      <DataCheck />
      <Roster staffId={status.staff_id} facilityId={status.facility_id} />
      <button onClick={() => supabase.auth.signOut()} className="w-full rounded-xl bg-white border border-slate-300 py-3 font-medium">
        Sign out
      </button>
    </div>
  )
}

function OutboxTile({ go, staffId }: { go: (v: View) => void; staffId: string }) {
  const { engine, version } = useOffline()
  void version
  const items = engine.itemsFor(staffId)
  if (items.length === 0) return null
  return (
    <button onClick={() => go({ name: 'outbox' })} className="w-full rounded-xl bg-amber-50 border border-amber-300 p-3 text-left text-sm font-medium text-amber-900">
      {items.length} item(s) saved on this phone, not yet sent. Tap to view.
    </button>
  )
}

