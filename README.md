# tetsuo — soporte de lenguaje para VS Code

Resaltado de sintaxis, configuración de lenguaje y snippets para ficheros `.tt`
del lenguaje **tetsuo**.

La gramática se ha derivado directamente de `src/lexer.c` del compilador
(`tetsuoc`), no de una aproximación genérica. Cubre exactamente lo que el
lexer acepta hoy:

| Elemento | Forma reconocida |
|---|---|
| Comentarios | `//` hasta fin de línea (no hay comentarios de bloque) |
| Cadenas | comillas simples `'...'`, escapes `\n \t \\ \' \0 \xHH` |
| Números | decimal y hexadecimal `0x...` |
| Palabras clave | `fun let const return if else loop while break struct bss` |
| Tipos primitivos | `u8 u32 u64 str` y punteros `*T` |
| Operador volátil | `@` |
| Flecha de retorno | `->` |
| Builtin | `syscall` |
| Propiedades | `.ptr`, `.len` y campos de struct |

Convenciones adicionales que se resaltan:

- El nombre declarado tras `const` o `bss` se marca como constante.
- Los identificadores en MAYÚSCULAS se tratan como constantes (idiom MMIO).
- Los nombres de tipo tras `:` o `->` se marcan como tipos, incluidos los
  structs definidos por el usuario.
- Un escape desconocido dentro de una cadena se marca como error, igual que
  hace `die_lex`.

## Tree-sitter y Graft

La gramática estructural vive en `tree-sitter-tetsuo/`. Sigue la sintaxis del
compilador y expone funciones, structs, constantes, buffers BSS y llamadas
mediante `queries/tags.scm`.

```sh
npm install --prefix tree-sitter-tetsuo
npm run tree-sitter:generate
npm run tree-sitter:test
```

Los forks se conectan sin publicar paquetes:

1. `tree-sitter-wasm` declara una dependencia Git llamada
   `tree-sitter-tetsuo` apuntando a un commit de este repo. Su buscador recursivo
   encuentra la gramática embebida y genera el WASM `tetsuo`.
2. Graft apunta a ese fork de `tree-sitter-wasm`, registra `.tt` con el basename
  WASM `tetsuo` y copia `queries/tags.scm` como
  `src/graph/queries/tetsuo.scm`.

## Instalación

### Desde el `.vsix`

```
code --install-extension tetsuo-0.1.0.vsix
```

### En modo desarrollo (enlace simbólico)

```
ln -s "$(pwd)/vscode-tetsuo" ~/.vscode/extensions/tetsuo
```

Después, recargar la ventana de VS Code (`Developer: Reload Window`).

## Nota sobre la extensión `.tt`

La extensión `.tt` también la reclaman las plantillas T4 de .NET. Si hay
conflicto, forzar la asociación en `settings.json`:

```json
"files.associations": { "*.tt": "tetsuo" }
```

## Pendiente

- Sin comentarios de bloque mientras el lexer no los admita.
- La forma `reg NOMBRE: tipo at 0xDIR` no está contemplada: no está
  implementada en el compilador y el idiom vigente es `const` con tipo puntero.
