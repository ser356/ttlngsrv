import { spawnSync } from 'child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { isAbsolute, join, relative, resolve, sep } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import {
  Program,
  findProjectRoot,
  isFile,
  mirrorPathOf,
  mirrorProgram,
  projectGraph,
  removeDir,
  selectProgram,
} from './project';

// `ruta:linea[:columna]: error: mensaje` — diagnostic_print de lib/fmt.tt.
const LOCATED_ERR_RE = /^(.+?):(\d+)(?::(\d+))?:\s*error:\s*(.+)$/i;
// `error linea N: mensaje` — die_line, sin ruta (errores del preprocesador).
const LEGACY_ERR_RE = /^error (?:en )?l[ií]nea (\d+):\s*(.+)$/i;
// El compilador añade `, encontrado 'tok'`: sirve para subrayar el token entero.
const FOUND_TOKEN_RE = /,\s*encontrado\s+'([^']*)'\s*$/;

const SYNTHETIC_ENTRY = '__tetsuo_lsp_entry.tt';
const COMPILER_TIMEOUT_MS = 20000;
const COMPILER_CANDIDATES = ['build/main', 'build/tetsuoc', 'build/main.exe'];

export interface ValidateOptions {
  compilerPath?: string;
  projectRoot?: string;
  entryFile?: string;
  /** false desactiva el prelude automático para ficheros sueltos. */
  prelude?: boolean;
  /** contenido en el editor de los ficheros abiertos, por ruta absoluta. */
  overlays?: Map<string, string>;
}

export interface ValidationResult {
  /** diagnósticos por URI. Todo URI presente hay que publicarlo, aunque vaya vacío. */
  byUri: Map<string, Diagnostic[]>;
  /** fichero raíz que se compiló, para la traza del servidor. */
  entry?: string;
  /** true si el fichero no pertenece a ningún programa y se compiló suelto. */
  standalone?: boolean;
}

function diagnosticAt(
  message: string,
  line: number,
  character: number,
  length: number,
): Diagnostic {
  return {
    severity: DiagnosticSeverity.Error,
    range: {
      start: { line, character },
      end: { line, character: character + Math.max(1, length) },
    },
    message,
    source: 'tetsuoc',
  };
}

function resolveCompiler(root: string, configured?: string): string | null {
  if (configured && configured.trim().length > 0) {
    // Una ruta relativa se interpreta contra la raíz del proyecto, no contra el
    // cwd del proceso del servidor (que es el de VS Code).
    const abs = isAbsolute(configured) ? configured : join(root, configured);
    if (isFile(abs)) return abs;
    return null;
  }
  for (const candidate of COMPILER_CANDIDATES) {
    const abs = join(root, candidate);
    if (isFile(abs)) return abs;
  }
  return null;
}

/**
 * Escribe el entry que el proyecto no tiene: importa la librería y, al final,
 * el fragmento que se está editando. Las rutas van tal como las escriben los
 * propios ficheros (relativas a la raíz, con '/'), porque el guard de inclusión
 * del preprocesador compara la ruta literal.
 */
function writeSyntheticEntry(
  root: string,
  mirror: string,
  prelude: string[],
  file: string,
): string {
  const importOf = (target: string) =>
    `import '${relative(root, target).split(sep).join('/')}'`;
  const lines = [...prelude, file].map(importOf);
  const entry = join(mirror, SYNTHETIC_ENTRY);
  writeFileSync(entry, lines.join('\n') + '\n');
  return entry;
}

function describe(
  byUri: Map<string, Diagnostic[]>,
  program: Program,
): ValidationResult {
  const entry = program.prelude
    ? `${SYNTHETIC_ENTRY} (${program.prelude.length} unidades + fragmento)`
    : program.entry;
  return { byUri, entry, standalone: program.standalone };
}

export async function validate(
  doc: TextDocument,
  options: ValidateOptions,
): Promise<ValidationResult> {
  const byUri = new Map<string, Diagnostic[]>();
  if (!doc.uri.startsWith('file://')) return { byUri };

  const file = resolve(fileURLToPath(doc.uri));
  const root = findProjectRoot(file, options.projectRoot);
  byUri.set(doc.uri, []);

  const compiler = resolveCompiler(root, options.compilerPath);
  if (!compiler) {
    byUri.set(doc.uri, [
      diagnosticAt(
        options.compilerPath
          ? `No se encontró el compilador en '${options.compilerPath}' (ajusta tetsuo.compilerPath).`
          : `No se encontró el compilador: compílalo (build/main) o ajusta tetsuo.compilerPath.`,
        0,
        0,
        1,
      ),
    ]);
    return { byUri };
  }

  const overlays = new Map(options.overlays ?? []);
  overlays.set(file, doc.getText());

  const graph = projectGraph(root);
  const program = selectProgram(
    graph,
    file,
    options.entryFile,
    options.prelude !== false,
  );

  const mirror = mkdtempSync(join(tmpdir(), 'tetsuo-lsp-'));
  try {
    mirrorProgram(root, mirror, program.files, overlays);
    const entryArg = program.prelude
      ? writeSyntheticEntry(root, mirror, program.prelude, file)
      : mirrorPathOf(root, mirror, program.entry);

    // stdout se descarta: --dump-ir vuelca el IR del programa entero (megabytes
    // al compilar el propio compilador) y los diagnósticos van todos a stderr.
    const r = spawnSync(compiler, ['--dump-ir', entryArg], {
      encoding: 'utf8',
      timeout: COMPILER_TIMEOUT_MS,
      cwd: mirror,
      stdio: ['ignore', 'ignore', 'pipe'],
    });

    if (r.error) {
      const timedOut = (r.error as NodeJS.ErrnoException).code === 'ETIMEDOUT';
      byUri.set(doc.uri, [
        diagnosticAt(
          timedOut
            ? `El compilador excedió ${COMPILER_TIMEOUT_MS} ms y se abortó.`
            : `No se pudo ejecutar el compilador: ${r.error.message}`,
          0,
          0,
          1,
        ),
      ]);
      return describe(byUri, program);
    }

    const out = r.stderr || '';
    const lineCache = new Map<string, string[]>();
    const textOf = (target: string): string[] => {
      let lines = lineCache.get(target);
      if (lines) return lines;
      const overlay = overlays.get(target);
      let text = overlay;
      if (text === undefined) {
        try {
          text = readFileSync(target, 'utf8');
        } catch {
          text = '';
        }
      }
      lines = text.split('\n');
      lineCache.set(target, lines);
      return lines;
    };

    // El compilador imprime la ruta tal cual se escribió en el `import`, es
    // decir relativa al cwd (el espejo). Se traduce de vuelta al fichero real.
    const realPathOf = (printed: string): string => {
      const abs = isAbsolute(printed) ? resolve(printed) : resolve(mirror, printed);
      const rel = relative(mirror, abs);
      if (!rel.startsWith('..') && !isAbsolute(rel)) return join(root, rel);
      return abs;
    };

    const push = (target: string, diag: Diagnostic) => {
      const uri = pathToFileURL(target).toString();
      const list = byUri.get(uri);
      if (list) list.push(diag);
      else byUri.set(uri, [diag]);
    };

    let sawCompilerError = false;
    for (const line of out.split('\n')) {
      const located = line.match(LOCATED_ERR_RE);
      const legacy = located ? null : line.match(LEGACY_ERR_RE);
      if (!located && !legacy) continue;
      sawCompilerError = true;

      const message = located ? located[4] : legacy![2];
      const target = located ? realPathOf(located[1]) : file;
      // die_line no lleva ruta y su número de línea es el del buffer ya
      // expandido: no se puede señalar una línea concreta con honestidad.
      const ln = located ? Math.max(0, parseInt(located[2], 10) - 1) : 0;
      const col = located ? Math.max(0, parseInt(located[3] || '1', 10) - 1) : 0;

      const lineText = (textOf(target)[ln] ?? '').replace(/\r$/, '');
      const character = Math.min(col, Math.max(lineText.length - 1, 0));
      const token = message.match(FOUND_TOKEN_RE);
      push(target, diagnosticAt(message, ln, character, token ? token[1].length : 1));
    }

    if (r.status !== 0 && !sawCompilerError) {
      const first = out
        .split('\n')
        .map(l => l.trim())
        .find(Boolean);
      byUri.set(doc.uri, [
        diagnosticAt(first || `El compilador terminó con código ${r.status}`, 0, 0, 1),
      ]);
    }

    return describe(byUri, program);
  } finally {
    removeDir(mirror);
  }
}
