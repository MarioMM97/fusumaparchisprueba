import { NextResponse } from 'next/server'
import { gatewayGenerate, modelFor } from '../../../lib/agent'
import { CHARACTERS } from '../../../lib/characters'
import { clientIp, rateLimit } from '../../../lib/ratelimit'

export const maxDuration = 30

/**
 * Diagnóstico: hace una llamada mínima a cada modelo configurado para comprobar
 * que el ID existe en el Gateway y que hay credenciales. GET /api/models
 */
export async function GET(req: Request) {
  if (!rateLimit(`models:${clientIp(req)}`, 6)) {
    return NextResponse.json({ error: 'Demasiadas peticiones' }, { status: 429 })
  }
  const results = await Promise.all(
    CHARACTERS.map(async (c) => {
      const model = modelFor(c.player)
      const t0 = Date.now()
      try {
        const out = await gatewayGenerate({
          model,
          system: 'Eres un jugador de parchís. Responde en JSON.',
          prompt: 'Saluda a la mesa en una frase muy corta.',
          schema: 'react',
          signal: AbortSignal.timeout(20000),
        })
        return { character: c.name, model, ok: true, ms: Date.now() - t0, sample: out }
      } catch (e) {
        return {
          character: c.name,
          model,
          ok: false,
          ms: Date.now() - t0,
          error: (e instanceof Error ? e.message : String(e)).slice(0, 300),
        }
      }
    }),
  )
  return NextResponse.json({ results })
}
