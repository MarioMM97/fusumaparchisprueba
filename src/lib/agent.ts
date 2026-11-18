import { generateText, NoObjectGeneratedError, Output } from 'ai'
import { characterOf } from './characters'
import { legalMoves, type GameState } from './engine'
import { heuristicMove } from './heuristic'
import { movePrompt, reactPrompt, reactSystemPrompt, systemPrompt } from './prompts'
import {
  AgentReplySchema,
  ReactionSchema,
  type HistoryItem,
  type MoveResponse,
  type ReactResponse,
} from './schemas'

export interface GenerateArgs {
  model: string
  system: string
  prompt: string
  schema: 'move' | 'react'
  signal: AbortSignal
}
/** Devuelve el objeto JSON (sin validar) que produjo el modelo. Inyectable para poder testear sin red. */
export type Generate = (args: GenerateArgs) => Promise<unknown>

export interface AgentDeps {
  generate: Generate
  modelFor: (player: number) => string
  timeoutMs?: number
}

/**
 * Llamada real: AI SDK + Vercel AI Gateway. El modelo se indica como "proveedor/modelo";
 * el SDK enruta al Gateway (clave AI_GATEWAY_API_KEY en local, OIDC en Vercel).
 * `Output.object` fuerza salida estructurada según el esquema zod.
 */
export const gatewayGenerate: Generate = async ({ model, system, prompt, schema, signal }) => {
  const result = await generateText({
    model,
    system,
    prompt,
    output: Output.object({ schema: schema === 'move' ? AgentReplySchema : ReactionSchema }),
    maxOutputTokens: 700,
    abortSignal: signal,
  })
  return result.output
}

export function modelFor(player: number): string {
  const c = characterOf(player)
  return process.env[`MODEL_${c.color.toUpperCase()}`] || c.defaultModel
}

const clean = (s: string, max: number) =>
  s
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)

const errText = (e: unknown) => clean(e instanceof Error ? `${e.name}: ${e.message}` : String(e), 200)

/**
 * Pide una jugada al modelo del jugador actual y la valida en dos capas:
 *  1. forma: el JSON debe cumplir AgentReplySchema (zod);
 *  2. reglas: la ficha elegida debe estar entre los movimientos legales según el motor.
 * Si falla, reintenta UNA vez devolviéndole al modelo qué estuvo mal. Si vuelve a fallar
 * (o el proveedor da error), juega la heurística y lo deja anotado en `errors`.
 */
export async function decideMove(
  input: { state: GameState; history: HistoryItem[] },
  deps: AgentDeps,
): Promise<MoveResponse> {
  const { state, history } = input
  const moves = legalMoves(state)
  if (moves.length === 0) throw new Error('No hay movimientos legales')
  const model = deps.modelFor(state.current)
  const started = Date.now()

  if (moves.length === 1) {
    return {
      kind: 'move',
      piece: moves[0].piece,
      message: '',
      reasoning: 'Única jugada posible (no se consulta al modelo).',
      source: 'forced',
      model,
      attempts: 0,
      latencyMs: 0,
      errors: [],
    }
  }

  const errors: string[] = []
  let feedback: string | undefined
  let attempts = 0

  for (let attempt = 1; attempt <= 2; attempt++) {
    attempts = attempt
    const signal = AbortSignal.timeout(deps.timeoutMs ?? 20000)
    let raw: unknown
    try {
      raw = await deps.generate({
        model,
        system: systemPrompt(state.current),
        prompt: movePrompt(state, history, moves, feedback),
        schema: 'move',
        signal,
      })
    } catch (e) {
      errors.push(`intento ${attempt}: ${errText(e)}`)
      // Solo merece la pena reintentar si el modelo respondió algo que no era JSON válido.
      if (NoObjectGeneratedError.isInstance(e)) {
        feedback = 'Tu respuesta anterior no era un JSON válido con los campos piece, message y reasoning.'
        continue
      }
      break
    }

    const parsed = AgentReplySchema.safeParse(raw)
    if (!parsed.success) {
      const why = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
      errors.push(`intento ${attempt}: JSON no válido (${clean(why, 160)})`)
      feedback = `Tu respuesta anterior no cumplió el formato (${clean(why, 160)}). Devuelve piece (0-3), message y reasoning.`
      continue
    }

    const reply = parsed.data
    if (!moves.some((m) => m.piece === reply.piece)) {
      const options = moves.map((m) => m.piece).join(', ')
      errors.push(`intento ${attempt}: movimiento ilegal (piece ${reply.piece}; legales: ${options})`)
      feedback = `Tu respuesta anterior elegía piece ${reply.piece}, que NO es legal. Los únicos índices válidos son: ${options}.`
      continue
    }

    return {
      kind: 'move',
      piece: reply.piece,
      message: clean(reply.message, 240),
      reasoning: clean(reply.reasoning, 300),
      source: 'model',
      model,
      attempts,
      latencyMs: Date.now() - started,
      errors,
    }
  }

  const fallback = heuristicMove(state, moves)
  return {
    kind: 'move',
    piece: fallback.piece,
    message: '',
    reasoning: 'Jugada automática (heurística): el modelo no devolvió una jugada válida.',
    source: 'fallback',
    model,
    attempts,
    latencyMs: Date.now() - started,
    errors,
  }
}

/** Reacción corta de un personaje a un suceso (captura, victoria, comentario del espectador). */
export async function reactTo(
  input: { player: number; trigger: string; history: HistoryItem[] },
  deps: AgentDeps,
): Promise<ReactResponse> {
  const model = deps.modelFor(input.player)
  try {
    const raw = await deps.generate({
      model,
      system: reactSystemPrompt(input.player),
      prompt: reactPrompt(input.player, input.trigger, input.history),
      schema: 'react',
      signal: AbortSignal.timeout(deps.timeoutMs ?? 15000),
    })
    const parsed = ReactionSchema.safeParse(raw)
    if (!parsed.success) return { kind: 'react', message: null, model }
    return { kind: 'react', message: clean(parsed.data.message, 200), model }
  } catch {
    return { kind: 'react', message: null, model }
  }
}
