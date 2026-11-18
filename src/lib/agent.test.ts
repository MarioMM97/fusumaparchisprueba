import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decideMove, reactTo, type Generate } from './agent'
import { estadoInicial, legalMoves, tirarDado, type GameState } from './engine'
import { AgentRequestSchema } from './schemas'

/** Estado con varias jugadas legales: amarillo con 2 fichas fuera y un 4. */
function stateWithChoices(): GameState {
  const s = estadoInicial()
  s.positions[0] = [10, 20, -1, -1]
  const { state } = tirarDado(s, 4)
  assert.equal(state.phase, 'move')
  assert.ok(legalMoves(state).length >= 2)
  return state
}
const deps = (generate: Generate) => ({ generate, modelFor: () => 'test/model', timeoutMs: 1000 })
const valid = (piece: number) => ({ piece, message: '¡Allá voy!', reasoning: 'porque sí' })

test('JSON válido y legal: se aplica tal cual (source=model)', async () => {
  const state = stateWithChoices()
  const r = await decideMove({ state, history: [] }, deps(async () => valid(1)))
  assert.equal(r.source, 'model')
  assert.equal(r.piece, 1)
  assert.equal(r.attempts, 1)
  assert.deepEqual(r.errors, [])
})

test('jugada ilegal: reintenta con feedback y acepta la corrección', async () => {
  const state = stateWithChoices()
  const prompts: string[] = []
  let n = 0
  const r = await decideMove(
    { state, history: [] },
    deps(async ({ prompt }) => {
      prompts.push(prompt)
      return n++ === 0 ? valid(3) : valid(0) // la ficha 3 está en casa: ilegal con un 4
    }),
  )
  assert.equal(r.source, 'model')
  assert.equal(r.piece, 0)
  assert.equal(r.attempts, 2)
  assert.match(r.errors[0], /ilegal/)
  assert.match(prompts[1], /NO es legal/)
})

test('JSON con formato incorrecto dos veces: cae a la heurística', async () => {
  const state = stateWithChoices()
  const r = await decideMove({ state, history: [] }, deps(async () => ({ piece: 'la primera', message: 5 })))
  assert.equal(r.source, 'fallback')
  assert.equal(r.attempts, 2)
  assert.equal(r.errors.length, 2)
  assert.ok(legalMoves(state).some((m) => m.piece === r.piece))
})

test('error del proveedor (modelo inexistente, sin crédito...): fallback sin reintentar', async () => {
  const state = stateWithChoices()
  let calls = 0
  const r = await decideMove(
    { state, history: [] },
    deps(async () => {
      calls++
      throw new Error('model not found')
    }),
  )
  assert.equal(r.source, 'fallback')
  assert.equal(calls, 1)
  assert.match(r.errors[0], /model not found/)
})

test('jugada única: no se llama al modelo', async () => {
  const s = estadoInicial()
  s.positions[0] = [10, -1, -1, -1]
  const { state } = tirarDado(s, 4)
  let calls = 0
  const r = await decideMove({ state, history: [] }, deps(async () => (calls++, valid(0))))
  assert.equal(r.source, 'forced')
  assert.equal(calls, 0)
})

test('el mensaje del modelo se sanea (saltos de línea, longitud)', async () => {
  const state = stateWithChoices()
  const r = await decideMove(
    { state, history: [] },
    deps(async () => ({ piece: 0, message: 'hola\n\n   mundo\t', reasoning: 'ok' })),
  )
  assert.equal(r.message, 'hola mundo')
})

test('reacción: si el modelo falla devuelve null en vez de romper', async () => {
  const r = await reactTo(
    { player: 1, trigger: 'te han comido una ficha', history: [] },
    deps(async () => {
      throw new Error('boom')
    }),
  )
  assert.equal(r.message, null)
})

test('el esquema de petición rechaza estados falsificados', () => {
  const bad = { kind: 'move', history: [], state: { ...estadoInicial(), positions: [[0, 0, 0, 99]] } }
  assert.equal(AgentRequestSchema.safeParse(bad).success, false)
  const ok = { kind: 'move', history: [], state: estadoInicial() }
  assert.equal(AgentRequestSchema.safeParse(ok).success, true)
})
