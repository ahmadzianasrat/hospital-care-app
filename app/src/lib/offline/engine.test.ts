import { describe, it, expect } from 'vitest'
import { OfflineEngine, classify, type KV, type RpcFn, type RpcResult } from './engine'

function makeStore(): KV {
  const m = new Map<string, unknown>()
  return {
    async get<T>(k: string) { return m.get(k) as T | undefined },
    async set(k: string, v: unknown) { m.set(k, JSON.parse(JSON.stringify(v))) },
  }
}

function setup(opts: { online?: boolean; rpc?: RpcFn } = {}) {
  const calls: { name: string; params: Record<string, unknown> }[] = []
  const state = { online: opts.online ?? true, handler: opts.rpc }
  const rpc: RpcFn = async (name, params) => {
    calls.push({ name, params })
    if (state.handler) return state.handler(name, params)
    return { data: { id: params.p_id ?? 'x' }, error: null }
  }
  let n = 0
  const engine = new OfflineEngine({
    rpc, store: makeStore(), isOnline: () => state.online, newId: () => `item${++n}`,
    now: () => new Date(1_700_000_000_000 + n * 1000),
  })
  return { engine, calls, state }
}

const NETWORK: RpcResult = { data: null, error: { message: 'TypeError: Failed to fetch', code: '' } }
const enc = (id: string) => ({ id, patient_id: 'p1', facility_id: 'f1', arrived_at: '2026-09-28T10:00:00Z', patients: { display_id: '1FA' } })

describe('classify', () => {
  it('tells the error kinds apart', () => {
    expect(classify({ message: 'TypeError: Failed to fetch', code: '' }).valueOf()).toBe('network')
    expect(classify({ message: 'No access: off duty', code: '42501' })).toBe('blocked')
    expect(classify({ message: 'JWT expired', code: 'PGRST301' })).toBe('auth')
    expect(classify({ message: 'Diagnosis is required', code: 'P0001' })).toBe('business')
  })
})

describe('perform', () => {
  it('sends straight away when online and nothing is waiting', async () => {
    const { engine, calls } = setup()
    const r = await engine.perform({ userId: 'u', type: 'start_visit', params: { p_id: 'e1' }, entityIds: ['e1'], label: 'visit' })
    expect(r).toMatchObject({ ok: true, queued: false })
    expect(calls).toHaveLength(1)
    expect(engine.itemsFor('u')).toHaveLength(0)
  })

  it('saves for later when offline', async () => {
    const { engine, calls } = setup({ online: false })
    const r = await engine.perform({ userId: 'u', type: 'start_visit', params: { p_id: 'e1' }, entityIds: ['e1'], label: 'visit', enc: enc('e1') })
    expect(r).toMatchObject({ ok: true, queued: true })
    expect(calls).toHaveLength(0)
    expect(engine.itemsFor('u')).toHaveLength(1)
  })

  it('saves for later when the request fails with a network error', async () => {
    const { engine } = setup({ rpc: async () => NETWORK })
    const r = await engine.perform({ userId: 'u', type: 'start_visit', params: { p_id: 'e1' }, entityIds: ['e1'], label: 'visit', enc: enc('e1') })
    expect(r).toMatchObject({ ok: true, queued: true })
  })

  it('shows a real database error instead of queueing it', async () => {
    const { engine } = setup({ rpc: async () => ({ data: null, error: { message: 'Diagnosis is required', code: 'P0001' } }) })
    const r = await engine.perform({ userId: 'u', type: 'complete_opd' as never, params: {}, entityIds: [], label: 'x' })
    expect(r).toEqual({ ok: false, error: 'Diagnosis is required', code: 'P0001' })
    expect(engine.itemsFor('u')).toHaveLength(0)
  })

  it('queues a dependent action even when online, to keep the order', async () => {
    const { engine, state, calls } = setup({ online: false })
    await engine.perform({ userId: 'u', type: 'start_visit', params: { p_id: 'e1' }, entityIds: ['e1'], label: 'visit', enc: enc('e1') })
    state.online = true
    const r = await engine.perform({
      userId: 'u', type: 'complete_triage', params: { p_encounter_id: 'e1', p_priority: 'red', p_decision: 'refer' },
      entityIds: ['e1'], dependsOn: ['e1'], label: 'triage', enc: enc('e1'),
    })
    expect(r).toMatchObject({ queued: true })
    expect(calls).toHaveLength(0)
  })

  it('can refuse to queue (for example no reserved numbers left)', async () => {
    const { engine } = setup({ online: false })
    const r = await engine.perform({
      userId: 'u', type: 'register_patient', params: {}, entityIds: [], label: 'reg',
      forQueue: async () => ({ error: 'No reserved numbers' }),
    })
    expect(r).toEqual({ ok: false, error: 'No reserved numbers' })
  })
})

describe('sync', () => {
  async function twoQueued() {
    const s = setup({ online: false })
    await s.engine.perform({ userId: 'u', type: 'start_visit', params: { p_id: 'e1' }, entityIds: ['e1'], label: 'visit', enc: enc('e1') })
    await s.engine.perform({
      userId: 'u', type: 'complete_triage', params: { p_encounter_id: 'e1', p_priority: 'red', p_decision: 'refer' },
      entityIds: ['e1'], dependsOn: ['e1'], label: 'triage', enc: enc('e1'),
    })
    return s
  }

  it('sends in the order they were made and empties the queue', async () => {
    const { engine, calls, state } = await twoQueued()
    state.online = true
    const r = await engine.sync('u')
    expect(r).toEqual({ sent: 2, stoppedBy: null })
    expect(calls.map((c) => c.name)).toEqual(['start_visit', 'complete_triage'])
    expect(engine.itemsFor('u')).toHaveLength(0)
  })

  it('stops on a network error and keeps everything', async () => {
    const { engine, state } = await twoQueued()
    state.online = true
    state.handler = async () => NETWORK
    const r = await engine.sync('u')
    expect(r).toMatchObject({ sent: 0, stoppedBy: 'network' })
    expect(engine.itemsFor('u')).toHaveLength(2)
    expect(engine.itemsFor('u')[0].status).toBe('pending')
  })

  it('marks "off duty" as blocked and keeps it for later', async () => {
    const { engine, state } = await twoQueued()
    state.online = true
    state.handler = async () => ({ data: null, error: { message: 'No access: you are off duty', code: '42501' } })
    const r = await engine.sync('u')
    expect(r.stoppedBy).toBe('blocked')
    expect(engine.itemsFor('u')[0].status).toBe('blocked')
    state.handler = undefined // shift starts, or break-glass used
    const again = await engine.sync('u')
    expect(again).toEqual({ sent: 2, stoppedBy: null })
  })

  it('marks a rejected action as failed and carries on with the rest', async () => {
    const { engine, state } = await twoQueued()
    state.online = true
    state.handler = async (name) =>
      name === 'start_visit'
        ? { data: null, error: { message: 'Patient not found at your facility', code: 'P0001' } }
        : { data: {}, error: null }
    const r = await engine.sync('u')
    expect(r.sent).toBe(1)
    const left = engine.itemsFor('u')
    expect(left).toHaveLength(1)
    expect(left[0]).toMatchObject({ type: 'start_visit', status: 'failed', error: 'Patient not found at your facility' })
    await engine.retry(left[0].id)
    expect(engine.itemsFor('u')[0].status).toBe('pending')
    await engine.discard(left[0].id)
    expect(engine.itemsFor('u')).toHaveLength(0)
  })

  it('never sends one person\'s items under another person\'s login', async () => {
    const { engine, state, calls } = await twoQueued()
    state.online = true
    const r = await engine.sync('someone-else')
    expect(r.sent).toBe(0)
    expect(calls).toHaveLength(0)
    expect(engine.itemsFor('u')).toHaveLength(2)
  })

  it('points later items at the visit the database already had open', async () => {
    const { engine, state, calls } = await twoQueued()
    state.online = true
    state.handler = async (name, params) =>
      name === 'start_visit' ? { data: { id: 'server-visit' }, error: null } : { data: { ok: params.p_encounter_id }, error: null }
    await engine.sync('u')
    expect(calls[1].params.p_encounter_id).toBe('server-visit')
  })
})

describe('local view of queued work', () => {
  it('shows a queued visit as waiting for triage, then as triaged', async () => {
    const { engine } = setup({ online: false })
    await engine.perform({ userId: 'u', type: 'start_visit', params: { p_id: 'e1' }, entityIds: ['e1'], label: 'visit', enc: enc('e1') })
    expect(engine.pendingEncounters('u').get('e1')?.status).toBe('waiting_triage')
    await engine.perform({
      userId: 'u', type: 'complete_triage', params: { p_encounter_id: 'e1', p_priority: 'red', p_decision: 'refer' },
      entityIds: ['e1'], dependsOn: ['e1'], label: 'triage', enc: enc('e1'),
    })
    const e = engine.pendingEncounters('u').get('e1')
    expect(e).toMatchObject({ status: 'referred_out', triage_priority: 'red', hasReferral: false })
    await engine.perform({
      userId: 'u', type: 'create_referral', params: { p_encounter_id: 'e1' },
      entityIds: ['e1'], dependsOn: ['e1'], label: 'referral', enc: enc('e1'),
    })
    expect(engine.pendingEncounters('u').get('e1')?.hasReferral).toBe(true)
  })

  it('lists patients registered offline', async () => {
    const { engine } = setup({ online: false })
    await engine.perform({ userId: 'u', type: 'register_patient', params: {}, entityIds: ['p9'], label: 'reg', patient: { id: 'p9', display_id: '12FA' } })
    expect(engine.pendingPatients('u')).toEqual([{ id: 'p9', display_id: '12FA' }])
  })
})

describe('reserved patient numbers', () => {
  it('hands out numbers in order and runs out honestly', async () => {
    const { engine } = setup({
      rpc: async () => ({ data: [{ block_start: 10, block_end: 12 }], error: null }),
    })
    expect(await engine.takeNumber('f1')).toBeNull()
    expect(await engine.topUp('f1')).toBe('ok')
    expect(await engine.numbersLeft('f1')).toBe(3)
    expect([await engine.takeNumber('f1'), await engine.takeNumber('f1'), await engine.takeNumber('f1')]).toEqual([10, 11, 12])
    expect(await engine.takeNumber('f1')).toBeNull()
  })

  it('does not top up when plenty are left, or when offline', async () => {
    const { engine, state } = setup({ rpc: async () => ({ data: [{ block_start: 1, block_end: 30 }], error: null }) })
    await engine.topUp('f1')
    expect(await engine.topUp('f1')).toBe('not_needed')
    const off = setup({ online: false })
    expect(await off.engine.topUp('f1')).toBe('offline')
    state.online = true
  })
})
