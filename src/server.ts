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
import { validate } from './diagnostics';
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
let compilerPath = '/Users/sergiogarciaseco/Developer/Code/tetsuo/build/main';
const debounce = new Map<string, NodeJS.Timeout>();

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
    const cfg: { compilerPath?: string } = await conn.workspace.getConfiguration({
      section: 'tetsuo',
    });
    if (cfg?.compilerPath) compilerPath = cfg.compilerPath;
  } catch {
    /* mantener default */
  }
}

conn.onDidChangeConfiguration(() => refreshConfig());

function scheduleValidation(doc: TextDocument) {
  const prev = debounce.get(doc.uri);
  if (prev) clearTimeout(prev);
  const timer = setTimeout(async () => {
    debounce.delete(doc.uri);
    const diags = await validate(doc, compilerPath);
    conn.sendDiagnostics({ uri: doc.uri, diagnostics: diags });
  }, 300);
  debounce.set(doc.uri, timer);
}

docs.onDidOpen(e => scheduleValidation(e.document));
docs.onDidSave(e => scheduleValidation(e.document));
docs.onDidChangeContent(e => scheduleValidation(e.document));

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
