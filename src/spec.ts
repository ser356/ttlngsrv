// GENERATED-START keywords: run `npm run sync-spec:apply` para refrescar
export const CONTROL_KW = ["return","if","else","loop","while","break"] as const;
export const STORAGE_KW = ["fun","let","const","struct","bss"] as const;
export const CONSTANTS  = ["nil"] as const;
export const BUILTINS   = ["sizeof","syscall"] as const;
export const TYPES      = ["u8","u32","u64","str"] as const;
// GENERATED-END

export const DOCS: Record<string, string> = {
  fun:     '`fun name(args) [-> T] { ... }` — declaración de función. Máximo 8 parámetros efectivos.',
  let:     '`let name: T [= expr]` — variable local. Anotación de tipo obligatoria; init opcional (⚠ sin init lee basura de pila).',
  const:   '`const NAME: T = literal` — constante top-level. Solo admite literal entero.',
  struct:  '`struct N { campo: T, ... }` — layout de 8 bytes por campo. Comas opcionales.',
  bss:     '`bss NAME: N` — buffer de N bytes a cero. En expresión, `NAME` es `*u8` al primer byte.',
  return:  '`return [expr]` — salida de función.',
  if:      '`if cond { } else if c2 { } else { }` — paréntesis opcionales.',
  else:    'Rama alternativa de `if`.',
  while:   '`while cond { }` — bucle mientras cierto (paréntesis opcionales).',
  loop:    '`loop { ... break ... }` — bucle infinito con salida vía `break`.',
  break:   'Sale del bucle más interno.',
  nil:     'Azúcar del literal `0` — puntero nulo. Comparar solo con `==` / `!=`.',
  sizeof:  '`sizeof(T)` — tamaño en bytes resuelto en parse-time. `sizeof(struct)` = nfields × 8.',
  syscall: '`syscall(n, a, b, c)` — única puerta al sistema (target macos). ⚠ Nunca en `--target=virt`.',
  u8:      'Byte sin signo (1 byte).',
  u32:    'Entero sin signo 32 bits.',
  u64:    'Entero sin signo 64 bits.',
  str:     'Par `(ptr, len)` — 16 bytes. Campos `.ptr` (`*u8`) y `.len` (`u64`) solo sobre locales.',
  import:  '`import \'ruta.tt\'` — directiva del preprocesador. Una por línea al inicio del fichero; deduplicada por path.',
};
