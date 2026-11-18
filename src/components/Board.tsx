import { GRID, ESQUINA_CASA, coordenadasPasillo, posicionFicha, coordenadasCasilla } from '../lib/board-layout'
import { COLORS, META_FINAL, CASILLA_SEGURA, CASILLA_SALIDA, CASILLAS, type GameState } from '../lib/engine'

const S = 40 // píxeles por casilla en el viewBox
const PLAYER_COLORS = ['var(--yellow)', 'var(--blue)', 'var(--red)', 'var(--green)']
const PLAYER_TINTS = ['var(--yellow-tint)', 'var(--blue-tint)', 'var(--red-tint)', 'var(--green-tint)']

interface Props {
  state: GameState
  /** fichas que pueden moverse ahora, como "jugador-ficha" */
  movable: Set<string>
  /** última ficha movida, como "jugador-ficha" */
  last: string | null
}

export function Board({ state, movable, last }: Props) {
  // Agrupa fichas que comparten casilla visual para desplazarlas un poco.
  const groups = new Map<string, string[]>()
  const place: { key: string; player: number; piece: number; x: number; y: number }[] = []
  state.positions.forEach((row, player) =>
    row.forEach((progress, piece) => {
      const [x, y] = posicionFicha(player, progress, piece)
      const key = `${player}-${piece}`
      const cellKey = progress === -1 || progress === META_FINAL ? key : `${x}:${y}`
      groups.set(cellKey, [...(groups.get(cellKey) ?? []), key])
      place.push({ key, player, piece, x, y })
    }),
  )

  const trackCells = Array.from({ length: CASILLAS }, (_, i) => i + 1)
  const startOwner = (sq: number) => CASILLA_SALIDA.findIndex((s) => s === sq)

  return (
    <svg viewBox={`0 0 ${GRID * S} ${GRID * S}`} className="board" role="img" aria-label="Tablero de Parchís">
      <rect width={GRID * S} height={GRID * S} rx={18} fill="var(--board)" />

      {ESQUINA_CASA.map(([r, c], p) => (
        <g key={`house-${p}`}>
          <rect x={c * S + 6} y={r * S + 6} width={8 * S - 12} height={8 * S - 12} rx={22} fill={PLAYER_COLORS[p]} />
          <rect x={c * S + 22} y={r * S + 22} width={8 * S - 44} height={8 * S - 44} rx={14} fill="var(--board)" />
          {[
            [2.5, 2.5],
            [2.5, 5.5],
            [5.5, 2.5],
            [5.5, 5.5],
          ].map(([dr, dc], i) => (
            <circle key={i} cx={(c + dc) * S} cy={(r + dr) * S} r={0.46 * S} fill={PLAYER_TINTS[p]} />
          ))}
        </g>
      ))}

      {trackCells.map((sq) => {
        const [r, c] = coordenadasCasilla(sq)
        const owner = startOwner(sq)
        return (
          <g key={`t-${sq}`}>
            <rect
              x={c * S}
              y={r * S}
              width={S}
              height={S}
              fill={owner >= 0 ? PLAYER_TINTS[owner] : 'var(--cell)'}
              stroke="var(--line)"
              strokeWidth={1}
            />
            {CASILLA_SEGURA.has(sq) && (
              <circle cx={c * S + S / 2} cy={r * S + S / 2} r={S * 0.3} fill="none" stroke="var(--line-strong)" strokeWidth={1.5} strokeDasharray="3 3" />
            )}
          </g>
        )
      })}

      {COLORS.map((_, p) =>
        Array.from({ length: 7 }, (_, k) => {
          const [r, c] = coordenadasPasillo(p, 64 + k)
          return <rect key={`l-${p}-${k}`} x={c * S} y={r * S} width={S} height={S} fill={PLAYER_TINTS[p]} stroke="var(--line)" strokeWidth={1} />
        }),
      )}

      {/* centro: un triángulo por color apuntando a su pasillo */}
      <polygon points={`${8 * S},${8 * S} ${11 * S},${8 * S} ${9.5 * S},${9.5 * S}`} fill={PLAYER_COLORS[0]} />
      <polygon points={`${11 * S},${8 * S} ${11 * S},${11 * S} ${9.5 * S},${9.5 * S}`} fill={PLAYER_COLORS[1]} />
      <polygon points={`${11 * S},${11 * S} ${8 * S},${11 * S} ${9.5 * S},${9.5 * S}`} fill={PLAYER_COLORS[2]} />
      <polygon points={`${8 * S},${11 * S} ${8 * S},${8 * S} ${9.5 * S},${9.5 * S}`} fill={PLAYER_COLORS[3]} />

      {place.map(({ key, player, piece, x, y }) => {
        const progress = state.positions[player][piece]
        const cellKey = progress === -1 || progress === META_FINAL ? key : `${x}:${y}`
        const mates = groups.get(cellKey) ?? [key]
        const idx = mates.indexOf(key)
        const offset = mates.length > 1 ? (idx - (mates.length - 1) / 2) * 0.34 : 0
        const px = (x + offset) * S
        const py = y * S
        const isMovable = movable.has(key)
        return (
          <g key={key} className={`piece${last === key ? ' piece-last' : ''}`} style={{ transform: `translate(${px}px, ${py}px)` }}>
            {isMovable && <circle r={S * 0.5} className="piece-ring" />}
            <circle r={S * 0.36} fill={PLAYER_COLORS[player]} stroke="var(--piece-edge)" strokeWidth={2} />
            <text textAnchor="middle" dy="0.35em" className="piece-label">
              {piece + 1}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
