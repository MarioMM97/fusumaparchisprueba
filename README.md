# Parchís IA

Este proyecto consiste en una versión del clásico juego del Parchís en la que se incorporan soluciones basadas en Inteligencia Artificial que permiten un juego interactivo entre cuatro jugadores representados con diferentes modelos de IA. Los jugadores juegan la partida entre ellos de forma automática, deciden los movimientos en cada turno basandose en la reglas tradicionales del juego hasta que uno ellos gana y la partida finaliza.

Existe además un chat que ilustra en cada momento los movimientos o lanzamientos de cada jugador, donde los jugadores pueden interactuar, comentar y el espectador también puede dejar comentarios.

## Reglas implementadas

Salir con un 5 (obligatorio si se puede), 12 casillas seguras, captura con +20, meta con +10, barreras de dos fichas del mismo color, un 6 repite tirada y tres 6 seguidos devuelve la ultima ficha jugada a casa.

## ¿Cómo he planteado el proyecto?

He partido de la idea de mantener las reglas del Parchís tradicional, procurando que las reglas, los movimientos y la dinámica del juego sean fáciles de entender y visualizar.

A partir de ahí, he organizado el proyecto en dos partes principales:

La experiencia de juego: el tablero, los jugadores, los turnos, los movimientos de las fichas y el desarrollo de la partida.

La Inteligencia Artificial: la incorporación de personajes que pueden interactuar con el jugador y aportar personalidad a la experiencia.

He intentado priorizar que el juego sea sencillo de utilizar, que la información esté bien organizada y que la experiencia resulte clara para cualquier persona.

## ¿Qué decisiones he tomado?

Una de las decisiones principales ha sido separar la lógica del juego de la parte relacionada con la Inteligencia Artificial. De esta manera, el funcionamiento del Parchís no depende de que la IA responda correctamente. Las reglas, los movimientos y los turnos siguen su propia lógica.

También he planteado la posibilidad de utilizar diferentes modelos de Inteligencia Artificial para los personajes, para poder diferenciar sus respuestas y comportamientos.

## ¿Cómo he utilizado la Inteligencia Artificial?

La IA ha sido una herramienta de apoyo, asistido en algunas partes con un asistente de código durante el desarrollo del proyecto. La he utilizado para:

Ayudar a plantear y desarrollar funcionalidades.

Resolver dudas y detectar posibles errores en el código.

Mejorar y organizar determinadas partes del proyecto.

Revisar soluciones y valorar distintas formas de implementar una funcionalidad.

Primero se ha hecho el motor y las reglas del juego junto al correcto funcionamiento de sus tests. Después la capa de agentes, y al final la interfaz.

Las decisiones finales sobre qué soluciones incorporar, cómo organizar el proyecto y qué resultado perseguir han formado parte de mi propio proceso de desarrollo. Considero que la IA es una herramienta que facilita el trabajo, pero es importante revisar, probar y comprender aquello que se incorpora al proyecto.

## Cómo funciona

Cuatro personajes, cuatro modelos distintos:

Jugador Amarillo Modelo utilizado -> `anthropic/claude-haiku-5.5` 
Jugador Azul Modelo utilizado -> `openai/gpt-5.4-nano` 
Jugador Rojo Modelo utilizado -> `anthropic/claude-sonnet-5.5` 
Jugador Verde Modelo utilizado -> `openai/gpt-6-luna` 

## Algunas decisiones de diseño

1. El motor decide qué es legal; el modelo solo elige. `engine.ts` Calcula los movimientos legales. Al modelo se le pasan esos movimientos ya analizados y solo tiene que escoger uno.
2. Si solo hay una jugada posible no se llama al modelo. Las reacciones (te han comido una ficha, ganas…) son llamadas aparte que no bloquean la partida.
3. El JSON se valida con zod y contra la lista de jugadas legales (reglas). Si falla, se reintenta una vez diciéndole al modelo qué estuvo mal. Si vuelve a fallar, o el proveedor da error, juega una heurística (`heuristic.ts`). Esto consigue que la partida nunca se atasque.
4. El chat es contexto, no instrucciones.

## Resultado final y despliegue

Mi objetivo ha sido crear una experiencia funcional, sencilla y fácil de utilizar, explorando al mismo tiempo cómo la Inteligencia Artificial puede aportar valor a una aplicación.

Enlaces del proyecto:

Repositorio de GitHub: https://github.com/MarioMM97/fusumaparchisprueba
Aplicación desplegada: https://fusumaparchisprueba.vercel.app/