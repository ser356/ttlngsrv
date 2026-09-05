import { spawnSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { dirname, basename, join } from 'path';
import { fileURLToPath } from 'url';
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

const LOCATED_ERR_RE = /^(.+?):(\d+)(?::(\d+))?:\s*error:\s*(.+)$/i;
const LEGACY_ERR_RE = /^error (?:en )?l[ií]nea (\d+):\s*(.+)$/i;

export async function validate(
  doc: TextDocument,
  compilerPath: string,
): Promise<Diagnostic[]> {
  if (!doc.uri.startsWith('file://')) return [];
  const orig = fileURLToPath(doc.uri);
  const dir = dirname(orig);
  const tmpPath = join(dir, `.tetsuo-lsp-${process.pid}-${basename(orig)}`);
  writeFileSync(tmpPath, doc.getText());
  try {
    const r = spawnSync(compilerPath, ['--dump-ir', tmpPath], {
      encoding: 'utf8',
      timeout: 5000,
      cwd: dir,
    });
    if (r.error) {
      return [{
        severity: DiagnosticSeverity.Error,
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 1 },
        },
        message: `No se pudo ejecutar el compilador: ${r.error.message}`,
        source: 'tetsuoc',
      }];
    }
    const out = (r.stdout || '') + '\n' + (r.stderr || '');
    const diags: Diagnostic[] = [];
    let sawCompilerError = false;
    for (const line of out.split('\n')) {
      const located = line.match(LOCATED_ERR_RE);
      const legacy = line.match(LEGACY_ERR_RE);
      if (!located && !legacy) continue;
      sawCompilerError = true;
      if (located && located[1] !== tmpPath) continue;
      const ln = Math.max(0, parseInt(located?.[2] || legacy![1], 10) - 1);
      const character = Math.max(0, parseInt(located?.[3] || '1', 10) - 1);
      const lineText = doc
        .getText({
          start: { line: ln, character: 0 },
          end: { line: ln + 1, character: 0 },
        })
        .replace(/\r?\n$/, '');
      const startCharacter = Math.min(character, Math.max(lineText.length - 1, 0));
      diags.push({
        severity: DiagnosticSeverity.Error,
        range: {
          start: { line: ln, character: startCharacter },
          end: { line: ln, character: startCharacter + 1 },
        },
        message: located?.[4] || legacy![2],
        source: 'tetsuoc',
      });
    }
    if (r.status !== 0 && !sawCompilerError) {
      diags.push({
        severity: DiagnosticSeverity.Error,
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 1 },
        },
        message: out.split('\n').map(line => line.trim()).find(Boolean)
          || `El compilador terminó con código ${r.status}`,
        source: 'tetsuoc',
      });
    }
    return diags;
  } finally {
    try {
      unlinkSync(tmpPath);
    } catch {}
  }
}
