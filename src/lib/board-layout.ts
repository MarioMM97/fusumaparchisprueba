/**
 * Geometría del tablero: rejilla de 19x19 casillas. Cuatro brazos de 3 de ancho y 8 de largo
 * alrededor de un centro de 3x3; cada brazo tiene 17 casillas del circuito (8 + punta + 8)
 * y la columna central (menos la punta) es el pasillo de meta de un color.
 * Las coordenadas son [fila, columna] y el circuito se recorre en sentido horario.
 */
import { META_FINAL, CASA, ULTIMA_CASILLA_TABLERO, absSquare } from './engine'

export const GRID = 19

export function coordenadasCasilla(i: number): [number, number] {
  if (i >= 60 && i <= 67) return [7 - (i - 60), 8]
  if (i === 68) return [0, 9]
  if (i >= 1 && i <= 8) return [i - 1, 10]
  if (i >= 9 && i <= 16) return [8, 11 + (i - 9)]
  if (i === 17) return [9, 18]
  if (i >= 18 && i <= 25) return [10, 18 - (i - 18)]
  if (i >= 26 && i <= 33) return [11 + (i - 26), 10]
  if (i === 34) return [18, 9]
  if (i >= 35 && i <= 42) return [18 - (i - 35), 8]
  if (i >= 43 && i <= 50) return [10, 7 - (i - 43)]
  if (i === 51) return [9, 0]
  return [8, i - 52] // 52..59
}

/** Casilla del pasillo de meta; progress 64..70. */
export function coordenadasPasillo(player: number, progress: number): [number, number] {
  const k = progress - ULTIMA_CASILLA_TABLERO // 1..7
  switch (player) {
    case 0:
      return [k, 9]
    case 1:
      return [9, 18 - k]
    case 2:
      return [18 - k, 9]
    default:
      return [9, k]
  }
}

/** Esquina superior izquierda [fila, columna] de la casa de cada jugador. */
export const ESQUINA_CASA: [number, number][] = [
  [0, 11],
  [11, 11],
  [11, 0],
  [0, 0],
]
const HUECOS_CASA: [number, number][] = [
  [2.5, 2.5],
  [2.5, 5.5],
  [5.5, 2.5],
  [5.5, 5.5],
]

/** Dirección (fila, columna) hacia la que apunta el triángulo de meta de cada jugador. */
const DIRECCION_META: [number, number][] = [
  [-1, 0],
  [0, 1],
  [1, 0],
  [0, -1],
]

/** Centro de la ficha en unidades de casilla: [x, y]. */
export function posicionFicha(player: number, progress: number, piece: number): [number, number] {
  if (progress === CASA) {
    const [r0, c0] = ESQUINA_CASA[player]
    const [dr, dc] = HUECOS_CASA[piece]
    return [c0 + dc, r0 + dr]
  }
  if (progress === META_FINAL) {
    const [dr, dc] = DIRECCION_META[player]
    const spread = (piece - 1.5) * 0.28
    // desplazamiento perpendicular a la dirección del triángulo
    return [9.5 + dc * 0.75 + dr * spread, 9.5 + dr * 0.75 + dc * spread]
  }
  if (progress > ULTIMA_CASILLA_TABLERO) {
    const [r, c] = coordenadasPasillo(player, progress)
    return [c + 0.5, r + 0.5]
  }
  const [r, c] = coordenadasCasilla(absSquare(player, progress) as number)
  return [c + 0.5, r + 0.5]
}
