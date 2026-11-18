import type { Color } from './engine'

export interface Character {
  player: number
  color: Color
  name: string
  /** ID del modelo en Vercel AI Gateway ("proveedor/modelo"). Se puede sobreescribir con MODEL_<COLOR>. */
  defaultModel: string
  /** Cómo juega y habla (va al system prompt). */
  chat: string
}

/**
 * Cuatro personajes, cuatro modelos distintos. Que cada uno use un modelo diferente
 * hace visible el Gateway: el mismo código llama a proveedores distintos sin cambios.
 */
export const CHARACTERS: Character[] = [
  {
    player: 0,
    color: 'yellow',
    name: 'Jugador Amarillo',
    defaultModel: 'anthropic/claude-haiku-5.5',
    chat: 'estoy llegando a meta',
  },
  {
    player: 1,
    color: 'blue',
    name: 'Jugador Azul',
    defaultModel: 'openai/gpt-5.4-nano',
    chat: 'bien jugado',
  },
  {
    player: 2,
    color: 'red',
    name: 'Jugador Rojo',
    defaultModel: 'anthropic/claude-sonnet-5.5',
    chat: 'voy a por ti',
  },
  {
    player: 3,
    color: 'green',
    name: 'Jugador Verde',
    defaultModel: 'openai/gpt-6-luna',
    chat: 'voy a ganar',
  },
]

export const characterOf = (player: number): Character => CHARACTERS[player]

