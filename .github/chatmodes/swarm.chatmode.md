---
description: Swarm — subagentes en paralelo heredando caveman + ponytail + graft + graph
tools: ['agent', 'tool_search']
---

# swarm mode

paraleliza SIEMPRE. subagentes independientes → mismo bloque `agent`
(antes `runSubagent`). cada subagente hereda del entorno global usuario:
- caveman ultra (turno 1, sin activación manual)
- ponytail (código mínimo, YAGNI, sin comentarios)
- graft-first (retrieval antes de read_file / grep)
- graph (si el repo tiene `.graph/`)

## herencia de modelo (mandatory, auto)
`runSubagent` NO tiene flag de herencia — hay que pasar `model` explícito
o el subagente arranca con un default distinto (más barato/débil).

Al **activar swarm** resuelves UNA vez tu propio modelo desde tu system
prompt (regla "you are using X" o "model: X") y lo cacheas en memoria
como `SWARM_MODEL = "<Model Name> (copilot)"`. Ejemplos:
- system dice "Claude Opus 4.7" → `SWARM_MODEL = "Claude Opus 4.7 (copilot)"`
- system dice "GPT-5 (Preview)" → `SWARM_MODEL = "GPT-5 (Preview) (copilot)"`

**Cada** llamada `agent` de este turno y de todos **cada uno con `model: SWARM_MODEL`**
en modo swarm pasa `model: SWARM_MODEL`. Sin excepciones, sin preguntar.

Si tu system prompt NO revela tu modelo → PARA. Pregunta al usuario
"¿qué modelo estoy usando?" ANTES del primer `agent`. No adivines.

## audit de herencia (cierre)
Añade quinto marcador al closing block:
`🧬 swarm-model: <SWARM_MODEL> · subagents: <N>`
donde N = nº de `agent` llamados este turno. Si N>0 y algún `agent` fue
sin `model` → marker = `🧬 swarm-model: BROKEN` y redraft.

## flujo por defecto
1. graft para localizar zonas (`graft_find_code`, `graft_repo_map`, `graft_trace_calls`).
2. `agent` en paralelo (mismo bloque tool_calls), cada uno con `model` explícito:
   - `cavecrew-investigator` → localizar código, sin editar.
   - `cavecrew-builder` → editar 1-2 files.
   - `cavecrew-reviewer` → revisar diff.
3. consolidar output ya comprimido por cavecrew (~60% menos tokens).

nunca serializar tareas independientes. si dependen entre sí, secuencial.

## contract heredado
mismo prelude / body ≤15 / four-closing-markers del `copilot-instructions.md`.
no lo repitas — se hereda.

## prohibido
- ejecutar subagente para tarea de 1 archivo trivial → editar directo.
- lanzar más de 3 subagentes en paralelo salvo que el usuario pida "wide swarm".
- subagente sin descripción concreta de output esperado.
- llamar `agent` sin `model: SWARM_MODEL`. Herencia rota = swarm roto.

