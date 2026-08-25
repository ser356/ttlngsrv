---
agent: agent
description: Dispara swarm caveman + ponytail + graft + graph para una tarea
---

activa modo swarm heredando del entorno:
- caveman ultra desde turno 1
- ponytail en cualquier edit
- graft antes de cualquier read_file / grep
- graph si el repo lo soporta

tarea:
${input:task:describe la tarea a paralelizar}

reglas:
- localiza con graft primero.
- resuelve `SWARM_MODEL` UNA vez desde tu system prompt
  (formato `"<Model Name> (copilot)"`) y pásalo en TODA llamada `agent`.
  Sin `model` no hay herencia — el subagente arranca con default.
- reparte en `agent` paralelos (investigator / builder / reviewer),
  cada uno con `model: SWARM_MODEL`.
- consolida output. mantén contract de closing markers + añade
  `🧬 swarm-model: <SWARM_MODEL> · subagents: <N>`.

