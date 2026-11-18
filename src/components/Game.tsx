'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Board } from './Board'
import { CHARACTERS, characterOf } from '../lib/characters'
import {
  aplicarJugada,
  COLORS,
  describeEvent,
  META_FINAL,
  estadoInicial,
  legalMoves,
  tirarDado,
  type GameEvent,
  type GameState,
} from '../lib/engine'
import { heuristicMove } from '../lib/heuristic'
import type { MoveResponse, ReactResponse } from '../lib/schemas'

interface ChatMsg {
  id: number
  kind: 'say' | 'event' | 'user' | 'note'
  player: number | null
  text: string
  meta?: { reasoning: string; source: string; model: string; ms: number; attempts: number }
}

const SPEEDS = [
  { label: 'Lenta', ms: 1800 },
  { label: 'Normal', ms: 900 },
  { label: 'Rápida', ms: 300 },
] as const
const DICE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅']
const WELCOME: ChatMsg = {
  id: 0,
  kind: 'note',
  player: null,
  text: 'Cuatro personajes, cuatro modelos distintos. Pulsa Empezar y mira cómo deciden y hablan.',
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
      clearTimeout(t)
      reject(new DOMException('aborted', 'AbortError'))
    })
  })

const rollD6 = () => 1 + (crypto.getRandomValues(new Uint32Array(1))[0] % 6)
const shortModel = (m: string) => m.split('/').slice(-1)[0]

export function Game() {
  const [game, setGame] = useState<GameState>(() => estadoInicial())
  const [chat, setChat] = useState<ChatMsg[]>([WELCOME])
  const [running, setRunning] = useState(false)
  const [speedIdx, setSpeedIdx] = useState(1)
  const [thinking, setThinking] = useState<number | null>(null)
  const [lastRoll, setLastRoll] = useState<{ player: number; value: number } | null>(null)
  const [lastMove, setLastMove] = useState<string | null>(null)
  const [models, setModels] = useState<Record<number, string>>({})
  const [stats, setStats] = useState<Record<number, { ai: number; auto: number }>>({})
  const [draft, setDraft] = useState('')

  const chatRef = useRef<ChatMsg[]>([WELCOME])
  const idRef = useRef(1)
  const epochRef = useRef(0)
  const logRef = useRef<HTMLDivElement>(null)

  const push = useCallback((msgs: Omit<ChatMsg, 'id'>[]) => {
    if (msgs.length === 0) return
    chatRef.current = [...chatRef.current, ...msgs.map((m) => ({ ...m, id: idRef.current++ }))].slice(-250)
    setChat(chatRef.current)
  }, [])

  const history = useCallback(
    () =>
      chatRef.current
        .filter((m) => m.kind !== 'note')
        .slice(-10)
        .map((m) => ({
          author: m.kind === 'user' ? 'Espectador' : m.player === null ? 'Mesa' : characterOf(m.player).name,
          text: m.text.slice(0, 300),
        })),
    [],
  )

  /** Reacción de un personaje: no bloquea la partida y, si falla, simplemente no habla. */
  const react = useCallback(
    (player: number, trigger: string) => {
      const epoch = epochRef.current
      fetch('/api/agent', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'react', player, trigger, history: history() }),
      })
        .then((r) => (r.ok ? (r.json() as Promise<ReactResponse>) : null))
        .then((data) => {
          if (!data || epoch !== epochRef.current) return
          setModels((m) => ({ ...m, [player]: data.model }))
          if (data.message) push([{ kind: 'say', player, text: data.message }])
        })
        .catch(() => undefined)
    },
    [history, push],
  )

  const commit = useCallback(
    (next: GameState, events: GameEvent[]) => {
      setGame(next)
      const lines: Omit<ChatMsg, 'id'>[] = []
      for (const e of events) {
        const notable =
          e.type === 'capture' ||
          e.type === 'penalty' ||
          e.type === 'win' ||
          e.type === 'no_moves' ||
          e.type === 'bonus_lost' ||
          (e.type === 'move' && (e.kind === 'exit' || e.kind === 'goal'))
        if (notable) lines.push({ kind: 'event', player: null, text: describeEvent(e) })
        if (e.type === 'roll') setLastRoll({ player: e.player, value: e.value })
        if (e.type === 'move') setLastMove(`${e.player}-${e.piece}`)
        if (e.type === 'capture') react(e.victim.player, `${characterOf(e.player).name} acaba de comerte una ficha.`)
        if (e.type === 'penalty') react(e.player, 'Has sacado tres 6 seguidos y pierdes el turno.')
        if (e.type === 'win') react(e.player, '¡Has ganado la partida!')
      }
      push(lines)
    },
    [push, react],
  )

  // Bucle de partida: cada cambio de estado dispara el siguiente paso (tirar o pedir jugada).
  useEffect(() => {
    if (!running || game.phase === 'over') return
    const ac = new AbortController()
    const delay = SPEEDS[speedIdx].ms

    const run = async () => {
      if (game.phase === 'roll') {
        await sleep(delay, ac.signal)
        const { state, events } = tirarDado(game, rollD6())
        commit(state, events)
        return
      }

      const moves = legalMoves(game)
      const player = game.current

      // Una sola jugada posible: no hay nada que decidir, no se gasta una llamada al modelo.
      if (moves.length === 1) {
        await sleep(delay, ac.signal)
        const { state, events } = aplicarJugada(game, moves[0].piece)
        commit(state, events)
        return
      }

      setThinking(player)
      let decision: MoveResponse | null = null
      let failure = ''
      try {
        const res = await fetch('/api/agent', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ kind: 'move', state: game, history: history() }),
          signal: ac.signal,
        })
        if (res.ok) decision = (await res.json()) as MoveResponse
        else failure = `la API respondió ${res.status}`
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return
        failure = 'no se pudo contactar con la API'
      }
      setThinking(null)

      // Segunda validación, esta vez en el cliente: solo se aplica lo que el motor considera legal.
      let piece: number
      let source: MoveResponse['source'] = 'fallback'
      if (decision && moves.some((m) => m.piece === decision!.piece)) {
        piece = decision.piece
        source = decision.source
        setModels((m) => ({ ...m, [player]: decision!.model }))
        if (decision.message) {
          push([
            {
              kind: 'say',
              player,
              text: decision.message,
              meta: {
                reasoning: decision.reasoning,
                source: decision.source,
                model: decision.model,
                ms: decision.latencyMs,
                attempts: decision.attempts,
              },
            },
          ])
        } else if (decision.source === 'fallback') {
          push([
            {
              kind: 'note',
              player,
              text: `${characterOf(player).name} juega en automático: ${decision.errors[0] ?? 'el modelo no respondió'}`,
            },
          ])
        }
      } else {
        piece = heuristicMove(game, moves).piece
        push([
          {
            kind: 'note',
            player,
            text: `${characterOf(player).name} juega en automático: ${failure || 'respuesta no válida'}`,
          },
        ])
      }
      setStats((s) => {
        const cur = s[player] ?? { ai: 0, auto: 0 }
        return { ...s, [player]: source === 'model' ? { ...cur, ai: cur.ai + 1 } : { ...cur, auto: cur.auto + 1 } }
      })
      const { state, events } = aplicarJugada(game, piece)
      commit(state, events)
    }

    run().catch(() => undefined)
    return () => {
      ac.abort()
      setThinking(null)
    }
  }, [running, game, speedIdx, commit, history, push])

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' })
  }, [chat])

  const reset = () => {
    epochRef.current++
    setRunning(false)
    setGame(estadoInicial())
    chatRef.current = [WELCOME]
    setChat([WELCOME])
    setLastRoll(null)
    setLastMove(null)
    setStats({})
    setThinking(null)
  }

  const send = (e: FormEvent) => {
    e.preventDefault()
    const text = draft.trim().slice(0, 200)
    if (!text) return
    setDraft('')
    push([{ kind: 'user', player: null, text }])
    const lower = text.toLowerCase()
    const named = CHARACTERS.find((c) => lower.includes(c.name.split(' ')[0].toLowerCase()))
    const target = named ? named.player : Math.floor(Math.random() * 4)
    react(target, `El espectador dice a la mesa: "${text}"`)
  }

  const movable = useMemo(() => {
    if (game.phase !== 'move') return new Set<string>()
    return new Set(legalMoves(game).map((m) => `${game.current}-${m.piece}`))
  }, [game])

  const current = characterOf(game.current)
  const winner = game.winner !== null ? characterOf(game.winner) : null

  return (
    <main className="app">
      <header className="top">
        <div>
          <h1>Parchís</h1>
          <p className="sub">Cuatro modelos de IA juegan, deciden en JSON y conversan.</p>
        </div>
        <div className="controls">
          <button className="btn primary" onClick={() => setRunning((r) => !r)} disabled={game.phase === 'over'}>
            {running ? 'Pausar' : game.turn > 1 || lastRoll ? 'Reanudar' : 'Empezar'}
          </button>
          <button className="btn" onClick={reset}>
            Nueva partida
          </button>
          <label className="speed">
            Velocidad
            <select value={speedIdx} onChange={(e) => setSpeedIdx(Number(e.target.value))}>
              {SPEEDS.map((s, i) => (
                <option key={s.label} value={i}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <div className="layout">
        <section className="left">
          <div className="board-wrap">
            <Board state={game} movable={movable} last={lastMove} />
            <div className="dice" aria-live="polite">
              <span className="dice-face" aria-hidden>
                {lastRoll ? DICE_FACES[lastRoll.value - 1] : '⚀'}
              </span>
              <span>
                {winner
                  ? `¡Gana ${winner.name}!`
                  : lastRoll
                    ? `${characterOf(lastRoll.player).name} sacó un ${lastRoll.value}`
                    : 'Sin tiradas todavía'}
              </span>
            </div>
          </div>

          <ul className="players">
            {CHARACTERS.map((c) => {
              const done = game.positions[c.player].filter((p) => p === META_FINAL).length
              const st = stats[c.player]
              const isTurn = game.phase !== 'over' && game.current === c.player
              return (
                <li key={c.player} className={`player p-${c.color}${isTurn ? ' is-turn' : ''}`}>
                  <div className="player-body">
                    <strong>{c.name}</strong>
                    <span className="player-model" title={models[c.player] ?? c.defaultModel}>
                      {shortModel(models[c.player] ?? c.defaultModel)}
                    </span>
                    <span className="player-meta">
                      {done}/4 en meta
                      {st ? ` · IA ${st.ai} · auto ${st.auto}` : ''}
                    </span>
                  </div>
                  {thinking === c.player ? (
                    <span className="badge thinking">pensando…</span>
                  ) : isTurn ? (
                    <span className="badge">turno</span>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </section>

        <section className="chat" aria-label="Chat de la mesa">
          <div className="chat-log" ref={logRef}>
            {chat.map((m) => (
              <ChatLine key={m.id} m={m} />
            ))}
            {thinking !== null && (
              <div className={`bubble p-${COLORS[thinking]} typing`}>
                <span className="who">{characterOf(thinking).name}</span>
                <span className="dots" aria-label="escribiendo">
                  <i />
                  <i />
                  <i />
                </span>
              </div>
            )}
          </div>
          <form className="chat-form" onSubmit={send}>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={200}
              placeholder={`Habla a la mesa (prueba: «${current.name.split(' ')[0]}, ¿no te da vergüenza?»)`}
              aria-label="Mensaje para la mesa"
            />
            <button className="btn primary" type="submit" disabled={!draft.trim()}>
              Enviar
            </button>
          </form>
        </section>
      </div>
    </main>
  )
}

function ChatLine({ m }: { m: ChatMsg }) {
  if (m.kind === 'event') return <div className="event">{m.text}</div>
  if (m.kind === 'note') return <div className="note">{m.text}</div>
  if (m.kind === 'user') {
    return (
      <div className="bubble user">
        <span className="who">Tú</span>
        <p>{m.text}</p>
      </div>
    )
  }
  const c = characterOf(m.player as number)
  return (
    <div className={`bubble p-${c.color}`}>
      <span className="who">
        {c.name} {c.chat}
        {m.meta && <span className="src">{shortModel(m.meta.model)}</span>}
      </span>
      <p>{m.text}</p>
      {m.meta?.reasoning && (
        <details>
          <summary>Por qué esta jugada</summary>
          <p className="why">{m.meta.reasoning}</p>
          <p className="why-meta">
            {m.meta.model} · {m.meta.ms} ms · {m.meta.attempts} {m.meta.attempts === 1 ? 'intento' : 'intentos'}
          </p>
        </details>
      )}
    </div>
  )
}

