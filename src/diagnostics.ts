import { spawnSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { dirname, basename, join } from 'path';
import { fileURLToPath } from 'url';
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

const ERR_RE = /^error linea (\d+): (.+)$/;

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
    if (r.error) return [];
    const out = (r.stdout || '') + '\n' + (r.stderr || '');
    const diags: Diagnostic[] = [];
    for (const line of out.split('\n')) {
      const m = line.match(ERR_RE);
      if (!m) continue;
      const ln = Math.max(0, parseInt(m[1], 10) - 1);
      const lineText = doc
        .getText({
          start: { line: ln, character: 0 },
          end: { line: ln + 1, character: 0 },
        })
        .replace(/\r?\n$/, '');
      diags.push({
        severity: DiagnosticSeverity.Error,
        range: {
          start: { line: ln, character: 0 },
          end: { line: ln, character: Math.max(lineText.length, 1) },
        },
        message: m[2],
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
