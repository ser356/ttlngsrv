# graph-workflow

Este repo tiene un **grafo de workflow determinista** en `.graph/workflow.yaml`.
El grafo se ejecuta a través del servidor MCP `graph` y controla, en tiempo real,
qué paso viene después. **Tú no decides el flujo: el motor sí.**

## Contrato mínimo

1. Empieza SIEMPRE llamando a `graph_start(request)` con la petición del
   usuario. El motor te devuelve la primera pausa: `interrupt_id`, `message`,
   `response_schema`.
2. Compón una respuesta que **valide** contra `response_schema`. Llama a
   `graph_submit(session_id, interrupt_id, reply)`.
3. Si la respuesta no valida, `graph_submit` devuelve `status: rejected` sin
   consumir la pausa. Corrige la respuesta y vuelve a enviar sobre el mismo
   `interrupt_id`.
4. Si devuelve `status: paused`, hay una nueva pausa: repite el paso 2.
5. Si devuelve `status: done`, el grafo terminó. Comunica el resultado al
   usuario.
6. Si devuelve `status: error`, propaga el mensaje al usuario sin
   inventarte pasos siguientes.

## Reglas

- **Nunca edites `.graph/workflow.yaml`.** Se commitea aparte y su cambio
  se revisa en PR.
- Los nodos `shell` los ejecuta el motor, no tú. No repliques su comando.
- Si el motor pide un JSON con un campo `risk: high`, respeta lo que
  observaste — no lo bajes a `low` para pasar el gate.
- Si el motor devuelve `status: error` con "no waiting node matched", es
  probable que estés enviando `interrupt_id` obsoleto: pide `graph_status`
  para ver la pausa actual.
