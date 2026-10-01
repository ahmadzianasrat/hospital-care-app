// The offline engine: a queue of actions saved on the device and sent to the database, in order,
// when the connection is back. It knows nothing about screens or Supabase, so it can be tested alone.

export type ActionType = 'register_patient' | 'start_visit' | 'complete_triage' | 'create_referral'

export type RpcError = { message: string; code?: string | null }
export type RpcResult = { data: unknown; error: RpcError | null }
export type RpcFn = (name: string, params: Record<string, unknown>) => Promise<RpcResult>
export interface KV {
  get<T>(key: string): Promise<T | undefined>
  set(key: string, value: unknown): Promise<void>
}

// What the screens need to draw a visit that exists only on this device (or has not caught up yet).
export type EncSnapshot = {
  id: string
  patient_id: string
  facility_id: string
  arrived_at: string
  patients: unknown
}

export type OutboxItem = {
  id: string
  userId: string
  type: ActionType
  params: Record<string, unknown>
  entityIds: string[]
  label: string
  patient?: Record<string, unknown> // register_patient: the patient as it will exist
  enc?: EncSnapshot // start_visit / complete_triage / create_referral
  createdAt: string
  status: 'pending' | 'blocked' | 'failed'
  error?: string
  attempts: number
}

export type LocalEncounter = EncSnapshot & {
  status: string
  triage_priority: string | null
  triage_decision: string | null
  opd_doctor_id: null
  doctor: null
  hasReferral: boolean
}

export type PerformResult =
  | { ok: true; queued: false; data: unknown }
  | { ok: true; queued: true }
  | { ok: false; error: string; code?: string }

export type SyncResult = {
  sent: number
  stoppedBy: null | 'network' | 'auth' | 'blocked'
  skipped?: boolean
}

export type ErrorKind = 'network' | 'auth' | 'blocked' | 'business'

export function classify(e: RpcError): ErrorKind {
  const msg = e.message ?? ''
  const code = e.code ?? ''
  if (code === '42501') return 'blocked' // off duty or wrong role
  if (code === 'PGRST301' || /jwt/i.test(msg)) return 'auth' // session expired: keep the data, sign in again
  if (!code && /fetch|network|load failed|timeout|offline|aborted/i.test(msg)) return 'network'
  return 'business' // the database understood the request and said no
}

const uid = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })

export class OfflineEngine {
  private items: OutboxItem[] = []
  private listeners = new Set<() => void>()
  private syncing = false
  private memory = new Map<string, unknown>()
  version = 0

  constructor(
    private deps: {
      rpc: RpcFn
      store: KV
      isOnline: () => boolean
      now?: () => Date
      newId?: () => string
    },
  ) {}

  // ---------- storage ----------
  async load() {
    this.items = (await this.deps.store.get<OutboxItem[]>('outbox')) ?? []
    this.emit()
  }
  private async persist() {
    await this.deps.store.set('outbox', this.items)
    this.emit()
  }
  private emit() {
    this.version++
    this.listeners.forEach((f) => f())
  }
  subscribe(fn: () => void) {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  // ---------- reading the queue ----------
  itemsFor(userId: string): OutboxItem[] {
    return this.items.filter((i) => i.userId === userId)
  }
  private pendingEntityIds(): Set<string> {
    return new Set(this.items.flatMap((i) => i.entityIds))
  }

  // Patients registered on this device that the database has not seen yet.
  pendingPatients(userId: string): Record<string, unknown>[] {
    return this.itemsFor(userId)
      .filter((i) => i.type === 'register_patient' && i.patient)
      .map((i) => i.patient as Record<string, unknown>)
  }

  // Visits as they will look once everything queued has been sent.
  pendingEncounters(userId: string): Map<string, LocalEncounter> {
    const map = new Map<string, LocalEncounter>()
    for (const it of this.itemsFor(userId)) {
      if (!it.enc) continue
      let e = map.get(it.enc.id)
      if (!e) {
        e = {
          ...it.enc,
          status: 'waiting_triage',
          triage_priority: null,
          triage_decision: null,
          opd_doctor_id: null,
          doctor: null,
          hasReferral: false,
        }
        map.set(it.enc.id, e)
      }
      if (it.type === 'complete_triage') {
        e.triage_priority = String(it.params.p_priority)
        e.triage_decision = String(it.params.p_decision)
        e.status = it.params.p_decision === 'opd' ? 'waiting_opd' : 'referred_out'
      }
      if (it.type === 'create_referral') e.hasReferral = true
    }
    return map
  }

  // ---------- doing things ----------
  // Try now if we are online and nothing earlier is still waiting; otherwise save it for later.
  async perform(o: {
    userId: string
    type: ActionType
    params: Record<string, unknown>
    entityIds: string[]
    dependsOn?: string[]
    label: string
    patient?: Record<string, unknown>
    enc?: EncSnapshot
    // called only when the action must be queued (e.g. to take a reserved patient number)
    forQueue?: () => Promise<{ params?: Record<string, unknown>; patient?: Record<string, unknown> } | { error: string }>
  }): Promise<PerformResult> {
    const pending = this.pendingEntityIds()
    const mustQueue = (o.dependsOn ?? []).some((d) => pending.has(d))

    if (!mustQueue && this.deps.isOnline()) {
      let res: RpcResult
      try {
        res = await this.deps.rpc(o.type, o.params)
      } catch (e) {
        res = { data: null, error: { message: String(e) } }
      }
      if (!res.error) return { ok: true, queued: false, data: res.data }
      const kind = classify(res.error)
      if (kind !== 'network' && kind !== 'auth') {
        return { ok: false, error: res.error.message, code: res.error.code ?? undefined }
      }
      // network trouble: fall through and save it
    }

    let params = o.params
    let patient = o.patient
    if (o.forQueue) {
      const q = await o.forQueue()
      if ('error' in q) return { ok: false, error: q.error }
      params = q.params ?? params
      patient = q.patient ?? patient
    }
    const newId = this.deps.newId ?? uid
    this.items.push({
      id: newId(),
      userId: o.userId,
      type: o.type,
      params,
      entityIds: o.entityIds,
      label: o.label,
      patient,
      enc: o.enc,
      createdAt: (this.deps.now?.() ?? new Date()).toISOString(),
      status: 'pending',
      attempts: 0,
    })
    await this.persist()
    return { ok: true, queued: true }
  }

  // Send everything waiting for this user, oldest first. Stops when the network or access is the problem.
  async sync(userId: string): Promise<SyncResult> {
    if (this.syncing) return { sent: 0, stoppedBy: null, skipped: true }
    this.syncing = true
    let sent = 0
    let stoppedBy: SyncResult['stoppedBy'] = null
    try {
      const queue = this.items.filter((i) => i.userId === userId && i.status !== 'failed')
      for (const item of queue) {
        if (!this.items.includes(item)) continue
        let res: RpcResult
        try {
          res = await this.deps.rpc(item.type, item.params)
        } catch (e) {
          res = { data: null, error: { message: String(e) } }
        }
        if (!res.error) {
          this.items = this.items.filter((i) => i !== item)
          if (item.type === 'start_visit') this.remapIfNeeded(item, res.data)
          sent++
          await this.persist()
          continue
        }
        item.attempts++
        const kind = classify(res.error)
        if (kind === 'network' || kind === 'auth') {
          stoppedBy = kind
          await this.persist()
          break
        }
        if (kind === 'blocked') {
          item.status = 'blocked'
          item.error = res.error.message
          stoppedBy = 'blocked'
          await this.persist()
          break
        }
        item.status = 'failed'
        item.error = res.error.message
        await this.persist()
      }
    } finally {
      this.syncing = false
    }
    return { sent, stoppedBy }
  }

  // The database may return an already-open visit instead of ours; point later items at it.
  // Mutates items IN PLACE (never replaces the object) so a queue already being iterated still
  // sees the update, and reference-equality checks elsewhere keep working.
  private remapIfNeeded(item: OutboxItem, data: unknown) {
    const returned = (data as { id?: string } | null)?.id
    const mine = item.params.p_id as string | undefined
    if (!returned || !mine || returned === mine) return
    const swap = (v: unknown): unknown => {
      if (v === mine) return returned
      if (Array.isArray(v)) return v.map(swap)
      if (v && typeof v === 'object') {
        for (const k of Object.keys(v as Record<string, unknown>)) {
          ;(v as Record<string, unknown>)[k] = swap((v as Record<string, unknown>)[k])
        }
        return v
      }
      return v
    }
    for (const i of this.items) {
      swap(i.params)
      swap(i.entityIds)
      if (i.enc?.id === mine) i.enc.id = returned
    }
  }

  async retry(id: string) {
    const it = this.items.find((i) => i.id === id)
    if (it) {
      it.status = 'pending'
      it.error = undefined
      await this.persist()
    }
  }
  async discard(id: string) {
    this.items = this.items.filter((i) => i.id !== id)
    await this.persist()
  }

  // ---------- reserved patient numbers (so a site can register patients with no internet) ----------
  private async ranges(facilityId: string): Promise<[number, number][]> {
    return (await this.deps.store.get<[number, number][]>(`blocks:${facilityId}`)) ?? []
  }
  async numbersLeft(facilityId: string): Promise<number> {
    return (await this.ranges(facilityId)).reduce((n, [a, b]) => n + (b - a + 1), 0)
  }
  async takeNumber(facilityId: string): Promise<number | null> {
    const r = await this.ranges(facilityId)
    if (r.length === 0) return null
    const seq = r[0][0]
    r[0][0]++
    if (r[0][0] > r[0][1]) r.shift()
    await this.deps.store.set(`blocks:${facilityId}`, r)
    return seq
  }
  async topUp(facilityId: string, count = 30, threshold = 8, force = false): Promise<'ok' | 'not_needed' | 'offline' | 'error'> {
    if (!force && (await this.numbersLeft(facilityId)) >= threshold) return 'not_needed'
    if (!this.deps.isOnline()) return 'offline'
    let res: RpcResult
    try {
      res = await this.deps.rpc('reserve_patient_numbers', { p_count: count })
    } catch {
      return 'offline'
    }
    if (res.error) return classify(res.error) === 'network' ? 'offline' : 'error'
    const row = (res.data as { block_start: number; block_end: number }[] | null)?.[0]
    if (!row) return 'error'
    const r = await this.ranges(facilityId)
    r.push([row.block_start, row.block_end])
    await this.deps.store.set(`blocks:${facilityId}`, r)
    return 'ok'
  }

  // ---------- small cache for offline reading ----------
  async cacheSet(key: string, value: unknown) {
    this.memory.set(key, value)
    try {
      await this.deps.store.set(`cache:${key}`, value)
    } catch {
      /* storage unavailable: memory copy still works this session */
    }
  }
  async cacheGet<T>(key: string): Promise<T | undefined> {
    if (this.memory.has(key)) return this.memory.get(key) as T
    try {
      return await this.deps.store.get<T>(`cache:${key}`)
    } catch {
      return undefined
    }
  }
}
