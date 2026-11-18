/**
 * Motor de Parchís (reglas simplificadas).
 *
 * - 4 jugadores (0, 1, 2, 3) con 4 fichas cada uno de ellos.
 * - Cada ficha tiene un número asociado que indica la situación en la que se encuentra de la partida y del tablero:
 *     -1      La ficha se encuentra en casa
 *     0..63   La ficha se encuentra en el tablero (64 casillas desde su salida hasta el pasillo de su color)
 *     64..70  pasillo de color (7 casillas)
 *     71      meta
 * - El circuito tiene 68 casillas (1..68); las salidas están en 5, 22, 39, 56.
 *
 * Reglas implementadas
 * - Salir de casa solo con un 5 (y es obligatorio si se puede).
 * - Casillas seguras (12): no se puede capturar en ellas.
 * - Captura: caer sobre ficha rival en casilla no segura la manda a casa y da +20.
 *   Al salir con un 5 se captura a un rival que esté en tu salida.
 * - Llegar a meta da +10.
 * - Barreras: 2 fichas del mismo color en una casilla no se pueden pasar ni ocupar.
 *   Máximo 2 fichas por casilla.
 * - Un 6 da otra tirada. Tres 6 seguidos: la última ficha movida vuelve a casa y se pierde el turno.
 * - Gana quien lleva sus 4 fichas primero a su meta.
 */

export const COLORS = ['yellow', 'blue', 'red', 'green'] as const
export type Color = (typeof COLORS)[number]
export const COLOR_NAMES_ES: Record<Color, string> = {
  yellow: 'Amarillo',
  blue: 'Azul',
  red: 'Rojo',
  green: 'Verde',
}

export const NUM_JUG = 4
export const NUM_FICHAS = 4
export const CASILLAS = 68
export const CASILLA_SALIDA = [5, 22, 39, 56] as const
export const CASILLA_SEGURA: ReadonlySet<number> = new Set([5, 12, 17, 22, 29, 34, 39, 46, 51, 56, 63, 68])

export const CASA = -1
export const ULTIMA_CASILLA_TABLERO = 63
export const META_FINAL = 71

export const BONUS_CAPTURA = 20
export const BONUS_META = 10

export interface PieceRef {
  player: number
  piece: number
}

export type Phase = 'roll' | 'move' | 'over'
export type DiceSource = 'roll' | 'bonus'

export interface GameState {
  /** positions[jugador][ficha] = progreso */
  positions: number[][]
  current: number
  phase: Phase
  /** valor a usar ahora: 1..6 si viene del dado, 10/20 si es un bonus */
  dice: number | null
  diceSource: DiceSource | null
  /** movimientos de bonus pendientes (20 por captura, 10 por meta) */
  bonusQueue: number[]
  /** true si la tirada actual fue un 6: tras mover, vuelve a tirar */
  extraRoll: boolean
  /** seises consecutivos en el turno actual */
  sixes: number
  /** última ficha movida en este turno (para la penalización de 3 seises) */
  lastMoved: number | null
  winner: number | null
  /** contador de turnos (cambia al pasar de jugador) */
  turn: number
}

export interface Move {
  piece: number
  from: number
  to: number
  kind: 'exit' | 'move' | 'lane' | 'goal'
  capture: PieceRef | null
  /** casilla absoluta (1..68) de destino, o null si va a pasillo/meta */
  toSquare: number | null
}

export type GameEvent =
  | { type: 'roll'; player: number; value: number }
  | { type: 'no_moves'; player: number; value: number }
  | { type: 'move'; player: number; piece: number; from: number; to: number; kind: Move['kind'] }
  | { type: 'capture'; player: number; piece: number; victim: PieceRef }
  | { type: 'goal'; player: number; piece: number }
  | { type: 'bonus'; player: number; amount: number; reason: 'capture' | 'goal' }
  | { type: 'bonus_lost'; player: number; amount: number }
  | { type: 'penalty'; player: number; piece: number | null }
  | { type: 'win'; player: number }

export class IllegalMoveError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'IllegalMoveError'
  }
}

export function estadoInicial(): GameState {
  return {
    positions: Array.from({ length: NUM_JUG }, () => Array<number>(NUM_FICHAS).fill(CASA)),
    current: 0,
    phase: 'roll',
    dice: null,
    diceSource: null,
    bonusQueue: [],
    extraRoll: false,
    sixes: 0,
    lastMoved: null,
    winner: null,
    turn: 1,
  }
}

/** Casilla absoluta (1..68) de una ficha en el circuito exterior; null si está en casa, pasillo o meta. */
export function absSquare(player: number, progress: number): number | null {
  if (progress < 0 || progress > ULTIMA_CASILLA_TABLERO) return null
  return ((CASILLA_SALIDA[player] - 1 + progress) % CASILLAS) + 1
}

export function fichasPorCasilla(positions: number[][]): Map<number, PieceRef[]> {
  const map = new Map<number, PieceRef[]>()
  positions.forEach((row, player) =>
    row.forEach((progress, piece) => {
      const sq = absSquare(player, progress)
      if (sq === null) return
      const list = map.get(sq)
      if (list) list.push({ player, piece })
      else map.set(sq, [{ player, piece }])
    }),
  )
  return map
}

function jugadaFicha(state: GameState, occ: Map<number, PieceRef[]>, piece: number): Move | null {
  const pl = state.current
  const dice = state.dice
  if (dice === null) return null
  const from = state.positions[pl][piece]
  if (from === META_FINAL) return null

  if (from === CASA) {
    if (state.diceSource !== 'roll' || dice !== 5) return null
    const sq = CASILLA_SALIDA[pl]
    const here = occ.get(sq) ?? []
    if (here.length >= 2) return null
    const foe = here.find((r) => r.player !== pl) ?? null
    return { piece, from, to: 0, kind: 'exit', capture: foe, toSquare: sq }
  }

  const to = from + dice
  if (to > META_FINAL) return null

  for (let q = from + 1; q <= Math.min(to, ULTIMA_CASILLA_TABLERO); q++) {
    const here = occ.get(absSquare(pl, q) as number) ?? []
    if (here.length >= 2) {
      if (here[0].player === here[1].player) return null // barrera
      if (q === to) return null // casilla llena (dos colores en una segura)
    }
  }

  const toSquare = absSquare(pl, to)
  let capture: PieceRef | null = null
  if (toSquare !== null) {
    const here = occ.get(toSquare) ?? []
    if (here.length === 1 && here[0].player !== pl && !CASILLA_SEGURA.has(toSquare)) capture = here[0]
  }
  const kind: Move['kind'] = to === META_FINAL ? 'goal' : to > ULTIMA_CASILLA_TABLERO ? 'lane' : 'move'
  return { piece, from, to, kind, capture, toSquare }
}

/** Movimientos legales del jugador actual con el dado actual */
export function legalMoves(state: GameState): Move[] {
  if (state.phase !== 'move' || state.dice === null) return []
  const occ = fichasPorCasilla(state.positions)
  const moves: Move[] = []
  for (let piece = 0; piece < NUM_FICHAS; piece++) {
    const m = jugadaFicha(state, occ, piece)
    if (m) moves.push(m)
  }
  // Con un 5, si se puede sacar una ficha, es obligatorio.
  if (state.diceSource === 'roll' && state.dice === 5) {
    const exits = moves.filter((m) => m.kind === 'exit')
    if (exits.length > 0) return exits
  }
  return moves
}

function pasarTurno(s: GameState): void {
  s.current = (s.current + 1) % NUM_JUG
  s.sixes = 0
  s.lastMoved = null
  s.extraRoll = false
  s.dice = null
  s.diceSource = null
  s.phase = 'roll'
  s.turn += 1
}

/** Decide qué pasa tras una jugada (o tirada sin jugada): bonus, tirada extra o siguiente jugador. */
function avanzarTurno(s: GameState, events: GameEvent[]): void {
  s.dice = null
  s.diceSource = null
  while (s.bonusQueue.length > 0) {
    const bonus = s.bonusQueue.shift() as number
    s.dice = bonus
    s.diceSource = 'bonus'
    s.phase = 'move'
    if (legalMoves(s).length > 0) return
    events.push({ type: 'bonus_lost', player: s.current, amount: bonus })
    s.dice = null
    s.diceSource = null
  }
  if (s.extraRoll) {
    s.extraRoll = false
    s.phase = 'roll'
    return
  }
  pasarTurno(s)
}

/** Aplica una tirada de dado (1..6). */
export function tirarDado(state: GameState, value: number): { state: GameState; events: GameEvent[] } {
  if (state.phase !== 'roll') throw new IllegalMoveError('No es momento de tirar el dado')
  if (!Number.isInteger(value) || value < 1 || value > 6) throw new IllegalMoveError('Dado inválido')
  const s = structuredClone(state)
  const player = s.current
  const events: GameEvent[] = [{ type: 'roll', player, value }]

  s.sixes = value === 6 ? s.sixes + 1 : 0
  if (value === 6 && s.sixes === 3) {
    let piece: number | null = null
    if (s.lastMoved !== null) {
      const p = s.positions[player][s.lastMoved]
      if (p >= 0 && p <= ULTIMA_CASILLA_TABLERO) {
        s.positions[player][s.lastMoved] = CASA
        piece = s.lastMoved
      }
    }
    events.push({ type: 'penalty', player, piece })
    pasarTurno(s)
    return { state: s, events }
  }

  s.extraRoll = value === 6
  s.dice = value
  s.diceSource = 'roll'
  s.phase = 'move'
  if (legalMoves(s).length === 0) {
    events.push({ type: 'no_moves', player, value })
    avanzarTurno(s, events)
  }
  return { state: s, events }
}

/** Aplica el movimiento de la ficha `piece` del jugador actual. Lanza IllegalMoveError si no es legal. */
export function aplicarJugada(state: GameState, piece: number): { state: GameState; events: GameEvent[] } {
  if (state.phase !== 'move') throw new IllegalMoveError('No es momento de mover ficha')
  const move = legalMoves(state).find((m) => m.piece === piece)
  if (!move) throw new IllegalMoveError(`La ficha ${piece} no tiene un movimiento legal con el dado ${state.dice}`)

  const s = structuredClone(state)
  const player = s.current
  const events: GameEvent[] = []
  s.positions[player][piece] = move.to
  s.lastMoved = piece
  events.push({ type: 'move', player, piece, from: move.from, to: move.to, kind: move.kind })

  if (move.capture) {
    s.positions[move.capture.player][move.capture.piece] = CASA
    events.push({ type: 'capture', player, piece, victim: move.capture })
    s.bonusQueue.push(BONUS_CAPTURA)
    events.push({ type: 'bonus', player, amount: BONUS_CAPTURA, reason: 'capture' })
  }
  if (move.kind === 'goal') {
    events.push({ type: 'goal', player, piece })
    s.bonusQueue.push(BONUS_META)
    events.push({ type: 'bonus', player, amount: BONUS_META, reason: 'goal' })
  }

  if (s.positions[player].every((p) => p === META_FINAL)) {
    s.phase = 'over'
    s.winner = player
    s.dice = null
    s.diceSource = null
    s.bonusQueue = []
    events.push({ type: 'win', player })
    return { state: s, events }
  }

  avanzarTurno(s, events)
  return { state: s, events }
}

/** Comprueba invariantes del estado; devuelve un mensaje de error o null si es consistente. */
export function comprobarEstado(state: GameState): string | null {
  if (state.positions.length !== NUM_JUG) return 'positions debe tener 4 jugadores'
  for (const row of state.positions) {
    if (row.length !== NUM_FICHAS) return 'cada jugador debe tener 4 fichas'
    for (const p of row) if (!Number.isInteger(p) || p < CASA || p > META_FINAL) return `progreso fuera de rango: ${p}`
  }
  const occ = fichasPorCasilla(state.positions)
  for (const [sq, list] of occ) {
    if (list.length > 2) return `más de 2 fichas en la casilla ${sq}`
  }
  if (state.current < 0 || state.current >= NUM_JUG) return 'jugador actual inválido'
  if (state.phase === 'move' && (state.dice === null || state.diceSource === null)) return 'fase move sin dado'
  if (state.phase === 'roll' && state.dice !== null) return 'fase roll con dado'
  return null
}

/** Casillas de ventaja que lleva un jugador (suma de progresos); útil para resúmenes. */
export function progressOf(state: GameState, player: number): number {
  return state.positions[player].reduce((acc, p) => acc + (p < 0 ? 0 : p), 0)
}

/** Número de rivales que podrían alcanzar `square` (no segura) con un dado 1..6 desde el circuito. */
export function exposure(state: GameState, player: number, square: number | null): number {
  if (square === null || CASILLA_SEGURA.has(square)) return 0
  let attackers = 0
  state.positions.forEach((row, pl) => {
    if (pl === player) return
    row.forEach((p) => {
      const sq = absSquare(pl, p)
      if (sq === null) return
      const dist = (((square - sq) % CASILLAS) + CASILLAS) % CASILLAS
      if (dist >= 1 && dist <= 6) attackers++
    })
  })
  return attackers
}

export function describeEvent(e: GameEvent): string {
  const name = (pl: number) => COLOR_NAMES_ES[COLORS[pl]]
  switch (e.type) {
    case 'roll':
      return `${name(e.player)} saca un ${e.value}`
    case 'no_moves':
      return `${name(e.player)} no puede mover con el ${e.value}`
    case 'move':
      return e.kind === 'exit'
        ? `${name(e.player)} saca la ficha ${e.piece + 1} de casa`
        : e.kind === 'goal'
          ? `${name(e.player)} lleva la ficha ${e.piece + 1} a meta`
          : `${name(e.player)} mueve la ficha ${e.piece + 1}`
    case 'capture':
      return `${name(e.player)} se come una ficha de ${name(e.victim.player)}`
    case 'goal':
      return `${name(e.player)} corona una ficha`
    case 'bonus':
      return `${name(e.player)} gana ${e.amount} casillas extra`
    case 'bonus_lost':
      return `${name(e.player)} no puede usar sus ${e.amount} extra`
    case 'penalty':
      return `${name(e.player)} saca tres 6 seguidos: penalización`
    case 'win':
      return `¡${name(e.player)} gana la partida!`
  }
}
