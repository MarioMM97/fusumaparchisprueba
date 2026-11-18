import { z } from 'zod'

/**
 * Contrato JSON que debe devolver el modelo en cada turno.
 * Se pasa al AI SDK como `Output.object({ schema })` (el Gateway lo traduce a la
 * salida estructurada de cada proveedor) y además se vuelve a validar aquí.
 */
export const AgentReplySchema = z.object({
  piece: z
    .number()
    .int()
    .min(0)
    .max(3)
    .describe('Índice (0-3) de la ficha que mueves. Debe ser una de las fichas listadas en "movimientos legales".'),
  message: z
    .string()
    .min(1)
    .max(240)
    .describe('Lo que dices en voz alta a la mesa, en personaje. Una o dos frases cortas, en español.'),
  reasoning: z
    .string()
    .max(300)
    .describe('Motivo táctico de la jugada en una frase (se muestra como "razonamiento" en la interfaz).'),
})
export type AgentReply = z.infer<typeof AgentReplySchema>

export const ReactionSchema = z.object({
  message: z.string().min(1).max(200).describe('Tu reacción en voz alta, en personaje, una frase corta en español.'),
})

export const HistoryItemSchema = z.object({
  author: z.string().max(40),
  text: z.string().max(300),
})
export type HistoryItem = z.infer<typeof HistoryItemSchema>

export const GameStateSchema = z.object({
  positions: z.array(z.array(z.number().int().min(-1).max(71)).length(4)).length(4),
  current: z.number().int().min(0).max(3),
  phase: z.enum(['roll', 'move', 'over']),
  dice: z.number().int().min(1).max(20).nullable(),
  diceSource: z.enum(['roll', 'bonus']).nullable(),
  bonusQueue: z.array(z.number().int().min(1).max(20)).max(8),
  extraRoll: z.boolean(),
  sixes: z.number().int().min(0).max(3),
  lastMoved: z.number().int().min(0).max(3).nullable(),
  winner: z.number().int().min(0).max(3).nullable(),
  turn: z.number().int().min(1).max(100000),
})

export const MoveRequestSchema = z.object({
  kind: z.literal('move'),
  state: GameStateSchema,
  history: z.array(HistoryItemSchema).max(12),
})

export const ReactRequestSchema = z.object({
  kind: z.literal('react'),
  player: z.number().int().min(0).max(3),
  /** Qué ha pasado para que el personaje reaccione (lo genera el cliente a partir de eventos del motor). */
  trigger: z.string().min(1).max(300),
  history: z.array(HistoryItemSchema).max(12),
})

export const AgentRequestSchema = z.discriminatedUnion('kind', [MoveRequestSchema, ReactRequestSchema])
export type AgentRequest = z.infer<typeof AgentRequestSchema>

export interface MoveResponse {
  kind: 'move'
  piece: number
  message: string
  reasoning: string
  /** model = lo decidió el modelo; fallback = heurística tras fallar; forced = única jugada posible */
  source: 'model' | 'fallback' | 'forced'
  model: string
  attempts: number
  latencyMs: number
  /** Qué falló antes de aceptar la jugada (para depurar y mostrar en la UI). */
  errors: string[]
}

export interface ReactResponse {
  kind: 'react'
  message: string | null
  model: string
}
