// ---------------------------------------------------------------------------
// Descubrimiento del "programa" al que pertenece un fichero .tt
//
// tetsuo no tiene módulos: `import 'ruta.tt'` es textual y el preprocesador
// (src/main.tt del compilador) pega todos los ficheros en un único buffer
// plano. Un fichero suelto como `lib/fmt.tt` NO es un programa: no declara
// io_write ni bytes_eq, no conoce `struct Program`, y compilarlo por separado
// produce cientos de errores falsos ("funcion no declarada", "identificador no
// resuelto", ...) que no existen cuando se compila el programa completo.
//
// Por eso el servidor no compila el fichero abierto: busca el fichero raíz
// (el que importa, directa o transitivamente, al que estás editando) y compila
// ESE. Los diagnósticos del compilador ya vienen con la ruta y la línea del
// fichero original (mapa de orígenes de src/parser.tt), así que se reparten
// por URI sin más trabajo.
// ---------------------------------------------------------------------------
import {
  copyFileSync,
  existsSync,
  linkSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'fs';
import { dirname, isAbsolute, join, relative, resolve } from 'path';

const TT_EXT = '.tt';
const IMPORT_PREFIX = 'import ';
const QUOTE = "'";

// Directorios que nunca contienen fuentes del proyecto (o que contienen copias
// generadas de ellas, que ensuciarían el grafo).
const SKIP_DIRS = new Set([
  '.git',
  '.graph',
  '.vscode',
  'node_modules',
  'build',
  'out',
  'dist',
  'target',
  'vendor',
]);

// Cotas para no recorrer un workspace gigante en cada pulsación.
const MAX_FILES = 4000;
const MAX_DEPTH = 12;
const GRAPH_TTL_MS = 5000;

export interface ProjectGraph {
  root: string;
  builtAt: number;
  /** fichero absoluto -> rutas tal cual aparecen en sus líneas `import`. */
  imports: Map<string, string[]>;
  /** ficheros absolutos que alguien importa (es decir: no son raíz). */
  imported: Set<string>;
  /** ficheros que declaran `fun main`: no pueden ir en un prelude. */
  declaresMain: Set<string>;
  /** true si el escaneo se cortó por las cotas de arriba. */
  truncated: boolean;
}

const MAIN_RE = /^fun\s+main\s*\(/m;

const graphCache = new Map<string, ProjectGraph>();

/**
 * Extrae las rutas de las líneas `import`, con las MISMAS reglas que
 * is_import_line/pp_expand del compilador: la línea tiene que empezar por
 * "import " (sin indentar) y la ruta es lo que hay entre las dos primeras
 * comillas simples. Una línea indentada, o dentro de un comentario, no cuenta.
 */
export function parseImports(text: string): string[] {
  const out: string[] = [];
  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    if (!line.startsWith(IMPORT_PREFIX)) continue;
    const q1 = line.indexOf(QUOTE, IMPORT_PREFIX.length);
    if (q1 < 0) continue;
    const q2 = line.indexOf(QUOTE, q1 + 1);
    if (q2 < 0) continue;
    const path = line.slice(q1 + 1, q2);
    if (path.length > 0) out.push(path);
  }
  return out;
}

function readImports(file: string): string[] {
  try {
    return parseImports(readFileSync(file, 'utf8'));
  } catch {
    return [];
  }
}

function readUnit(file: string): { imports: string[]; main: boolean } {
  try {
    const text = readFileSync(file, 'utf8');
    return { imports: parseImports(text), main: MAIN_RE.test(text) };
  } catch {
    return { imports: [], main: false };
  }
}

/** Las rutas de `import` se resuelven contra el cwd del compilador (la raíz). */
export function resolveImport(root: string, raw: string): string {
  return isAbsolute(raw) ? resolve(raw) : resolve(root, raw);
}

/**
 * Raíz del proyecto: lo configurado, si no el ancestro más cercano con `.git`,
 * si no el directorio del propio fichero. Siempre es un ancestro del fichero,
 * de modo que su ruta relativa a la raíz existe.
 */
export function findProjectRoot(file: string, configured?: string): string {
  if (configured && configured.trim().length > 0) {
    const abs = resolve(configured);
    if (existsSync(abs) && !relative(abs, file).startsWith('..')) return abs;
  }
  let dir = dirname(resolve(file));
  for (;;) {
    if (existsSync(join(dir, '.git'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return dirname(resolve(file));
}

export function invalidateProjectGraph(root?: string): void {
  if (root) graphCache.delete(root);
  else graphCache.clear();
}

/** Grafo de imports de todos los .tt bajo la raíz, con caché por TTL. */
export function projectGraph(root: string): ProjectGraph {
  const cached = graphCache.get(root);
  if (cached && Date.now() - cached.builtAt < GRAPH_TTL_MS) return cached;

  const graph: ProjectGraph = {
    root,
    builtAt: Date.now(),
    imports: new Map(),
    imported: new Set(),
    declaresMain: new Set(),
    truncated: false,
  };
  let budget = MAX_FILES;

  const walk = (dir: string, depth: number) => {
    if (depth > MAX_DEPTH || budget <= 0) {
      graph.truncated = true;
      return;
    }
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (budget <= 0) {
        graph.truncated = true;
        return;
      }
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue;
        walk(full, depth + 1);
      } else if (e.isFile() && e.name.endsWith(TT_EXT)) {
        budget--;
        const unit = readUnit(full);
        graph.imports.set(full, unit.imports);
        if (unit.main) graph.declaresMain.add(full);
      }
    }
  };
  walk(root, 0);

  for (const [file, imports] of graph.imports) {
    for (const raw of imports) {
      const target = resolveImport(root, raw);
      if (target !== file) graph.imported.add(target);
    }
  }
  graphCache.set(root, graph);
  return graph;
}

/** Cierre transitivo de imports desde `entry`, incluido el propio `entry`. */
export function closure(graph: ProjectGraph, entry: string): Set<string> {
  const seen = new Set<string>();
  const stack = [entry];
  while (stack.length > 0) {
    const file = stack.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    // Un import puede apuntar a un fichero fuera del escaneo (por ejemplo en
    // build/): en ese caso se lee al vuelo.
    const imports = graph.imports.get(file) ?? readImports(file);
    for (const raw of imports) stack.push(resolveImport(graph.root, raw));
  }
  return seen;
}

/** Orden de expansión del preprocesador: importados antes que el importador. */
export function flattenOrder(graph: ProjectGraph, entry: string): string[] {
  const seen = new Set<string>();
  const order: string[] = [];
  const visit = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    const imports = graph.imports.get(file) ?? readImports(file);
    for (const raw of imports) visit(resolveImport(graph.root, raw));
    order.push(file);
  };
  visit(entry);
  return order;
}

export interface Program {
  /** fichero raíz que se le pasa al compilador, o '' si hay que sintetizarlo. */
  entry: string;
  /** todos los ficheros del programa (incluida la raíz). */
  files: Set<string>;
  /** true si `file` no pertenece a ningún programa completo. */
  standalone: boolean;
  /**
   * Ficheros de librería a importar antes del fragmento, en orden. Solo se usa
   * con ficheros sueltos y sin imports propios: es lo mismo que hacen los
   * scripts de build del repo (tests/macos_build.sh genera un entry con las
   * unidades del compilador y el fichero de test al final).
   */
  prelude?: string[];
}

/**
 * Prelude automático: las unidades de librería del programa más grande del
 * proyecto, sin ninguna que declare `fun main` (ni ninguna que importe una),
 * porque el fragmento suele traer su propio `main`.
 */
function autoPrelude(graph: ProjectGraph, file: string): string[] | undefined {
  let biggest: { entry: string; size: number } | null = null;
  for (const candidate of graph.imports.keys()) {
    if (graph.imported.has(candidate)) continue;
    if (candidate === file) continue;
    const size = closure(graph, candidate).size;
    if (size < 2) continue; // un fichero suelto no es un programa
    if (
      !biggest ||
      size > biggest.size ||
      (size === biggest.size && candidate < biggest.entry)
    ) {
      biggest = { entry: candidate, size };
    }
  }
  if (!biggest) return undefined;

  const prelude = flattenOrder(graph, biggest.entry).filter(unit => {
    if (unit === file) return false;
    for (const reachable of closure(graph, unit)) {
      if (graph.declaresMain.has(reachable)) return false;
    }
    return true;
  });
  return prelude.length > 0 ? prelude : undefined;
}

/**
 * Elige el programa al que pertenece `file`: entre los ficheros que nadie
 * importa (las raíces), el que lo alcanza con el cierre más grande. Ese es el
 * punto de entrada "completo" del proyecto — en el repo tetsuo,
 * tests/fixpoint_entry.tt, que importa las 18 unidades del compilador.
 *
 * Si nada lo importa, el propio fichero es su programa: se compila suelto,
 * exactamente como antes.
 */
export function selectProgram(
  graph: ProjectGraph,
  file: string,
  configuredEntry?: string,
  usePrelude = true,
): Program {
  if (configuredEntry && configuredEntry.trim().length > 0) {
    const entry = resolveImport(graph.root, configuredEntry);
    if (existsSync(entry)) {
      const files = closure(graph, entry);
      if (files.has(file)) return { entry, files, standalone: false };
    }
  }

  let best: Program | null = null;
  for (const candidate of graph.imports.keys()) {
    if (graph.imported.has(candidate)) continue; // no es raíz
    const files = closure(graph, candidate);
    if (!files.has(file)) continue;
    const standalone = candidate === file;
    if (
      best === null ||
      files.size > best.files.size ||
      (files.size === best.files.size && candidate < best.entry)
    ) {
      best = { entry: candidate, files, standalone };
    }
  }
  if (best === null) {
    // Ciclo de imports, o fichero fuera del escaneo: compílalo tal cual.
    best = { entry: file, files: closure(graph, file), standalone: true };
  }
  if (!best.standalone || !usePrelude) return best;

  // Fragmento suelto (un tests/*_test.tt, por ejemplo): sin imports propios no
  // se sostiene solo, así que se compila detrás de la librería del proyecto.
  if ((graph.imports.get(file) ?? readImports(file)).length > 0) return best;
  const prelude = autoPrelude(graph, file);
  if (!prelude) return best;
  return {
    entry: '',
    files: new Set([...prelude, file]),
    standalone: true,
    prelude,
  };
}

/**
 * Copia el programa a un directorio temporal conservando las rutas relativas a
 * la raíz, sustituyendo el contenido de los ficheros abiertos por el del
 * editor (que puede estar sin guardar).
 *
 * Hace falta una copia entera y no solo del fichero editado porque el guard de
 * inclusión del preprocesador (pp_seen) compara la ruta TAL CUAL se escribió:
 * apuntar el import a una copia temporal dejaría pasar también el original y
 * cada función quedaría declarada dos veces.
 *
 * Los ficheros que quedan fuera de la raíz no se reflejan: el import que los
 * trae es absoluto, así que el compilador los abre igual desde su ruta real.
 */
export function mirrorProgram(
  root: string,
  mirror: string,
  files: Iterable<string>,
  overlays: Map<string, string>,
): void {
  for (const file of files) {
    const rel = relative(root, file);
    if (rel.startsWith('..') || isAbsolute(rel)) continue; // fuera de la raíz
    const dest = join(mirror, rel);
    mkdirSync(dirname(dest), { recursive: true });
    const overlay = overlays.get(file);
    if (overlay !== undefined) {
      writeFileSync(dest, overlay);
      continue;
    }
    try {
      // Un hardlink evita copiar ~1MB de fuentes en cada validación. El
      // compilador solo lee, así que compartir el inodo es seguro.
      linkSync(file, dest);
    } catch {
      try {
        copyFileSync(file, dest);
      } catch {
        /* el import roto ya lo reporta el compilador */
      }
    }
  }
}

export function removeDir(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* mejor esfuerzo */
  }
}

export function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

export function mirrorPathOf(root: string, mirror: string, file: string): string {
  return join(mirror, relative(root, file));
}
