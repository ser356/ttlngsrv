import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  TextDocumentSyncKind,
  DidChangeConfigurationNotification,
  CompletionItem,
  CompletionItemKind,
  MarkupKind,
  Hover,
  TextDocumentPositionParams,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { fileURLToPath } from 'url';
import { resolve } from 'path';
import { validate } from './diagnostics';
import { invalidateProjectGraph } from './project';
import {
  CONTROL_KW,
  STORAGE_KW,
  OPERATOR_KW,
  TYPES,
  BUILTINS,
  CONSTANTS,
  DOCS,
} from './spec';

const conn = createConnection(ProposedFeatures.all);
const docs = new TextDocuments(TextDocument);
let compilerPath = '';
let projectRoot = '';
let entryFile = '';
let usePrelude = true;
const debounce = new Map<string, NodeJS.Timeout>();
// Un documento valida el programa entero, así que publica diagnósticos de
// ficheros que no son el suyo. Se apunta qué publicó cada uno para poder
// limpiarlos cuando dejan de reportarse, incluso si ese fichero no está
// abierto en el editor.
const publishedBy = new Map<string, Set<string>>();

conn.onInitialize((_p: InitializeParams) => ({
  capabilities: {
    textDocumentSync: TextDocumentSyncKind.Incremental,
    hoverProvider: true,
    completionProvider: { triggerCharacters: [] },
  },
}));

conn.onInitialized(() => {
  conn.client.register(DidChangeConfigurationNotification.type, undefined);
  refreshConfig();
});

async function refreshConfig() {
  try {
    const cfg: {
      compilerPath?: string;
      projectRoot?: string;
      entryFile?: string;
      prelude?: boolean;
    } = await conn.workspace.getConfiguration({ section: 'tetsuo' });
    compilerPath = cfg?.compilerPath ?? '';
    projectRoot = cfg?.projectRoot ?? '';
    entryFile = cfg?.entryFile ?? '';
    usePrelude = cfg?.prelude !== false;
  } catch {
    /* mantener defaults */
  }
}

conn.onDidChangeConfiguration(() => {
  invalidateProjectGraph();
  refreshConfig();
});

/**
 * Contenido en el editor de todos los ficheros abiertos. El programa se compila
 * sobre una copia temporal, así que los ficheros con cambios sin guardar se
 * reflejan tal como están en pantalla y no como están en disco.
 */
function overlays(): Map<string, string> {
  const map = new Map<string, string>();
  for (const d of docs.all()) {
    if (!d.uri.startsWith('file://')) continue;
    try {
      map.set(resolve(fileURLToPath(d.uri)), d.getText());
    } catch {
      /* URI no representable como ruta */
    }
  }
  return map;
}

async function runValidation(doc: TextDocument) {
  const { byUri, entry, standalone } = await validate(doc, {
    compilerPath,
    projectRoot,
    entryFile,
    prelude: usePrelude,
    overlays: overlays(),
  });
  if (entry) {
    conn.console.log(
      `tetsuo: ${doc.uri} validado vía ${entry}${standalone ? ' (suelto)' : ''}`,
    );
  }
  const mine = new Set<string>();
  for (const [uri, diagnostics] of byUri) {
    conn.sendDiagnostics({ uri, diagnostics });
    if (diagnostics.length > 0) mine.add(uri);
  }
  // Lo que este documento reportaba antes y ya no: si no se limpia, quedan
  // errores fantasma en ficheros que ni siquiera están abiertos.
  for (const uri of publishedBy.get(doc.uri) ?? []) {
    if (byUri.has(uri)) continue;
    conn.sendDiagnostics({ uri, diagnostics: [] });
  }
  publishedBy.set(doc.uri, mine);
}

function scheduleValidation(doc: TextDocument) {
  const prev = debounce.get(doc.uri);
  if (prev) clearTimeout(prev);
  const timer = setTimeout(() => {
    debounce.delete(doc.uri);
    void runValidation(doc);
  }, 300);
  debounce.set(doc.uri, timer);
}

docs.onDidOpen(e => {
  invalidateProjectGraph();
  scheduleValidation(e.document);
});
docs.onDidSave(e => {
  // Un guardado puede añadir o quitar un `import`: el grafo del proyecto deja
  // de ser válido.
  invalidateProjectGraph();
  scheduleValidation(e.document);
});
docs.onDidChangeContent(e => scheduleValidation(e.document));
docs.onDidClose(e => {
  const uri = e.document.uri;
  const timer = debounce.get(uri);
  if (timer) clearTimeout(timer);
  debounce.delete(uri);
  const mine = publishedBy.get(uri) ?? new Set<string>();
  publishedBy.delete(uri);
  conn.sendDiagnostics({ uri, diagnostics: [] });
  for (const other of mine) {
    if (other === uri) continue;
    // Solo se limpia lo que no siga publicando otro documento abierto.
    let claimed = false;
    for (const set of publishedBy.values()) {
      if (set.has(other)) {
        claimed = true;
        break;
      }
    }
    if (!claimed) conn.sendDiagnostics({ uri: other, diagnostics: [] });
  }
});

function wordAt(
  doc: TextDocument,
  pos: { line: number; character: number },
): string | null {
  const text = doc.getText();
  const off = doc.offsetAt(pos);
  let s = off;
  let e = off;
  const isId = (c: string) => /[A-Za-z0-9_]/.test(c);
  while (s > 0 && isId(text[s - 1])) s--;
  while (e < text.length && isId(text[e])) e++;
  return e > s ? text.slice(s, e) : null;
}

conn.onHover((p: TextDocumentPositionParams): Hover | null => {
  const doc = docs.get(p.textDocument.uri);
  if (!doc) return null;
  const w = wordAt(doc, p.position);
  if (!w || !DOCS[w]) return null;
  return { contents: { kind: MarkupKind.Markdown, value: DOCS[w] } };
});

conn.onCompletion((): CompletionItem[] => {
  const items: CompletionItem[] = [];
  const push = (label: string, kind: CompletionItemKind) => {
    const doc = DOCS[label];
    items.push({
      label,
      kind,
      documentation: doc
        ? { kind: MarkupKind.Markdown, value: doc }
        : undefined,
    });
  };
  CONTROL_KW.forEach(k => push(k, CompletionItemKind.Keyword));
  STORAGE_KW.forEach(k => push(k, CompletionItemKind.Keyword));
  OPERATOR_KW.forEach(k => push(k, CompletionItemKind.Operator));
  TYPES.forEach(t => push(t, CompletionItemKind.TypeParameter));
  BUILTINS.forEach(b => push(b, CompletionItemKind.Function));
  CONSTANTS.forEach(c => push(c, CompletionItemKind.Constant));
  return items;
});

docs.listen(conn);
conn.listen();
