import { NextResponse } from 'next/server'
import { decideMove, gatewayGenerate, modelFor, reactTo } from '../../../lib/agent'
import { comprobarEstado } from '../../../lib/engine'
import { clientIp, rateLimit } from '../../../lib/ratelimit'
import { AgentRequestSchema } from '../../../lib/schemas'

export const maxDuration = 60

const deps = { generate: gatewayGenerate, modelFor }

export async function POST(req: Request) {
  if (!rateLimit(clientIp(req))) {
    return NextResponse.json({ error: 'Demasiadas peticiones, espera un momento.' }, { status: 429 })
  }

  const text = await req.text()
  if (text.length > 30_000) return NextResponse.json({ error: 'Petición demasiado grande' }, { status: 413 })

  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const parsed = AgentRequestSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Petición inválida', details: parsed.error.issues }, { status: 400 })
  }
  const body = parsed.data

  if (body.kind === 'react') {
    return NextResponse.json(await reactTo(body, deps))
  }

  // El servidor no se fía del estado que manda el cliente: comprueba invariantes y fase.
  const invalid = comprobarEstado(body.state)
  if (invalid) return NextResponse.json({ error: `Estado inconsistente: ${invalid}` }, { status: 400 })
  if (body.state.phase !== 'move') return NextResponse.json({ error: 'No hay jugada pendiente' }, { status: 400 })

  return NextResponse.json(await decideMove(body, deps))
}
