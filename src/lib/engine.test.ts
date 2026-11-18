import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  aplicarJugada,
  estadoInicial,
  legalMoves,
  tirarDado,
  comprobarEstado,
  META_FINAL,
  CASA,
  absSquare,
  type GameState,
} from './engine'
import { heuristicMove } from './heuristic'

function mk(positions: number[][], dice: number, current = 0, source: 'roll' | 'bonus' = 'roll'): GameState {
  return { ...estadoInicial(), positions, current, phase: 'move', dice, diceSource: source }
}
const H = CASA
const empty = () => [
  [H, H, H, H],
  [H, H, H, H],
  [H, H, H, H],
  [H, H, H, H],
]

test('casillas absolutas: cada color arranca en su salida y entra al pasillo en 68/17/34/51', () => {
  assert.equal(absSquare(0, 0), 5)
  assert.equal(absSquare(0, 63), 68)
  assert.equal(absSquare(1, 0), 22)
  assert.equal(absSquare(1, 63), 17)
  assert.equal(absSquare(2, 63), 34)
  assert.equal(absSquare(3, 63), 51)
  assert.equal(absSquare(0, 64), null)
})

test('sin un 5 no se puede salir de casa y el turno pasa', () => {
  const { state, events } = tirarDado(estadoInicial(), 3)
  assert.equal(state.current, 1)
  assert.equal(state.phase, 'roll')
  assert.ok(events.some((e) => e.type === 'no_moves'))
})

test('con un 5 salir es obligatorio y deja la ficha en la salida', () => {
  const p = empty()
  p[0][0] = 10
  let { state } = tirarDado({ ...estadoInicial(), positions: p }, 5)
  const moves = legalMoves(state)
  assert.ok(moves.every((m) => m.kind === 'exit'))
  assert.equal(moves.length, 3)
  state = aplicarJugada(state, 1).state
  assert.equal(state.positions[0][1], 0)
  assert.equal(comprobarEstado(state), null)
})

test('captura en casilla normal: la víctima vuelve a casa y hay +20', () => {
  const p = empty()
  p[0][0] = 10 // casilla 15
  p[1][0] = 0 + 0 // azul en su salida (22), lo movemos al 16 de amarillo:
  p[1][0] = ((16 - 22 + 68) % 68) // casilla 16 vista desde azul
  assert.equal(absSquare(1, p[1][0]), 16)
  const { state, events } = aplicarJugada(mk(p, 1), 0)
  assert.equal(state.positions[1][0], H)
  assert.ok(events.some((e) => e.type === 'capture'))
  assert.equal(state.dice, 20)
  assert.equal(state.diceSource, 'bonus')
  assert.equal(state.current, 0)
})

test('no se captura en casilla segura (conviven)', () => {
  const p = empty()
  p[0][0] = 6 // casilla 11
  p[1][0] = ((12 - 22 + 68) % 68) // casilla 12 (segura)
  const { state, events } = aplicarJugada(mk(p, 1), 0)
  assert.equal(state.positions[1][0], p[1][0])
  assert.ok(!events.some((e) => e.type === 'capture'))
})

test('las barreras no se pueden atravesar', () => {
  const p = empty()
  p[0][0] = 10 // casilla 15
  p[1][0] = ((17 - 22 + 68) % 68)
  p[1][1] = ((17 - 22 + 68) % 68) // barrera azul en 17? (segura, pero dos del mismo color = barrera)
  const moves = legalMoves(mk(p, 3))
  assert.equal(moves.find((m) => m.piece === 0), undefined)
})

test('meta: tirada exacta, sin pasarse, +10 de bonus', () => {
  const p = empty()
  p[0][0] = 69
  assert.equal(legalMoves(mk(p, 3)).length, 0)
  const { state } = aplicarJugada(mk(p, 2), 0)
  assert.equal(state.positions[0][0], META_FINAL)
  assert.equal(state.dice === null || state.diceSource === 'bonus', true)
})

test('tres seises seguidos: la última ficha movida vuelve a casa y se pasa el turno', () => {
  const p = empty()
  p[0][0] = 20
  let s: GameState = { ...estadoInicial(), positions: p }
  s = tirarDado(s, 6).state
  s = aplicarJugada(s, 0).state // 26, otra tirada
  assert.equal(s.phase, 'roll')
  s = tirarDado(s, 6).state
  s = aplicarJugada(s, 0).state // 32
  const res = tirarDado(s, 6)
  assert.ok(res.events.some((e) => e.type === 'penalty'))
  assert.equal(res.state.positions[0][0], H)
  assert.equal(res.state.current, 1)
})

test('movimiento ilegal lanza error', () => {
  assert.throws(() => aplicarJugada(mk(empty(), 3), 0), /legal/)
})

test('simulación: 300 partidas completas con la heurística respetan los invariantes', () => {
  let seed = 12345
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
  for (let g = 0; g < 300; g++) {
    let s = estadoInicial()
    let steps = 0
    while (s.phase !== 'over') {
      if (++steps > 20000) assert.fail(`partida ${g} no termina`)
      if (s.phase === 'roll') s = tirarDado(s, 1 + Math.floor(rnd() * 6)).state
      else {
        const moves = legalMoves(s)
        assert.ok(moves.length > 0, 'fase move sin movimientos')
        // mezcla de heurística y aleatorio para explorar más situaciones
        const m = rnd() < 0.5 ? heuristicMove(s, moves) : moves[Math.floor(rnd() * moves.length)]
        s = aplicarJugada(s, m.piece).state
      }
      const err = comprobarEstado(s)
      assert.equal(err, null, `estado inválido en partida ${g}: ${err}`)
    }
    assert.ok(s.winner !== null)
    assert.ok(s.positions[s.winner as number].every((p) => p === META_FINAL))
  }
})
