import { exposure, META_FINAL, CASILLA_SEGURA, absSquare, type GameState, type Move } from './engine'

/**
 * Política de reserva. Se usa cuando el modelo no responde, devuelve JSON inválido
 * o propone un movimiento ilegal tras el reintento. Así la partida nunca se atasca.
 */
export function scoreMove(state: GameState, m: Move): number {
  const pl = state.current
  let score = m.to // avanzar siempre suma un poco
  if (m.kind === 'goal') score += 1000
  if (m.capture) score += 600 + Math.max(0, state.positions[m.capture.player][m.capture.piece])
  if (m.kind === 'exit') score += 300
  if (m.kind === 'lane') score += 150
  if (m.toSquare !== null && CASILLA_SEGURA.has(m.toSquare)) score += 120

  const fromSquare = absSquare(pl, m.from)
  if (exposure(state, pl, fromSquare) > 0) score += 90 // salir de una casilla en peligro
  score -= 150 * exposure(state, pl, m.toSquare) // no caer en una casilla en peligro
  if (m.to < META_FINAL && m.from >= 0) score += (m.to - m.from) * 0.1
  return score
}

export function heuristicMove(state: GameState, moves: Move[]): Move {
  let best = moves[0]
  let bestScore = -Infinity
  for (const m of moves) {
    const s = scoreMove(state, m)
    if (s > bestScore) {
      best = m
      bestScore = s
    }
  }
  return best
}
