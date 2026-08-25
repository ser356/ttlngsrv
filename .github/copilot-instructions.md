# Copilot repo instructions

## TL;DR (contract)
Every reply that mutates any file MUST open a graph session first.
No trigger words. No exceptions. Unreachable → STOP, do not edit.
Body ≤ 15 lines after the prelude. Every reply audits itself at close
with **four** markers. Silence = broken.

Exception: meta-edits of this template file
(`$COPILOT_TEMPLATE` = `~/.config/copilot/copilot-instructions.md`)
skip graph and declare `🕸️ graph: unavailable — meta-edit`.

## Reply prelude (mandatory, in order)
- **Line 1**: `🕳️ caveman: <FIRST-SUBSTANTIVE-WORD-CAPS>`.
  Substantive = noun / verb / adjective. Never article, preposition,
  conjunction, auxiliary. Wrong marker → redraft whole reply.
- **Line 2**: exactly one of
  - `🕸️ graph: opening…`  → this reply will mutate files
  - `🕸️ graph: skipped (question only)`  → this reply is 100% prose
- **Line 3**: `✋ closing plan: caveman:<clean|FAIL?> · graft:<M|not_needed|unavailable> · graph:<state> · body:≤15`.
  Values committed here MUST match the final closing markers.
  Mismatch = broken contract, redraft.

Any file-mutating tool call after `🕸️ graph: skipped` = broken contract.

## Reply body (hard ceiling)
- **≤ 15 lines** of prose/code fences between prelude and closing markers.
- Long diffs go to disk via tool calls, not to the chat window.
- Long analyses go to a file the user can open; chat gets a link + summary.
- If you need more, split into a follow-up reply. No walls of text.

## Reply closing (mandatory, four markers, in order)
Every reply MUST end with these four lines. Silence on any = broken.

1. `🕳️ caveman: clean` if body contains **zero** matches of this
   regex (case-insensitive), else `🕳️ caveman: FAIL (<match>)`:
   `\b(maybe|might|perhaps|likely|probably|possibly|quizá|quizás|
   probablemente|posiblemente|puede que|claro|sure|absolutely|
   of course|obviously|obviamente|lógicamente|por supuesto|encantado)\b`.
   FAIL → redraft the whole reply.
2. `🌱 graft: <M> calls` if graft ran this turn,
   `🌱 graft: not needed (no code reads)` if reply is pure prose,
   `🌱 graft: not needed (localized edit, <N> files)` if size-gate skipped graft,
   `🌱 graft: unavailable` if `mcp_graft_*` did not resolve.
3. `🕸️ graph: <status>@<node> (session=<short>)` if graph opened,
   `🕸️ graph: unavailable — <one-line reason>` if unreachable,
   `🕸️ graph: unavailable — meta-edit` for template self-edits,
   `🕸️ graph: skipped (question only)` if pure prose.
4. `📏 body: <N> lines` where N = actual body line count (between
   Line 3 and this closing block). If N > 15 → broken, redraft.

## Mode (style, always on)
- Caveman ultra. No hedging, no politeness padding, verbs over
  nominalisations (`verifica` > `realiza una verificación`).
- Spanish reply when user writes Spanish.

## Retrieval (graft-first, size-gated)
When `.claude/skills/graft/` or `mcp_graft_*` tools present:

- **Localized edit** (path known AND ≤ 2 files touched AND no
  call-graph question) → `read_file` directo, sin graft.
- **Everything else** → graft-first. Use
  `graft_repo_map` / `graft_file_api` / `graft_find_code` /
  `graft_find_all` / `graft_trace_calls` **before** any
  `read_file` or `grep_search`. One graft call replaces N reads.

## Graph-first (mandatory)
When Line 2 = `🕸️ graph: opening…` (non-meta reply):

1. **Tool call #1** = `tool_search "graph workflow start submit"`.
   Unconditional. Even if you think it is loaded.
2. **Tool call #2** = `mcp_graph_graph_start` with `request` = user
   message verbatim.
3. **Zero** file-mutating tool calls until `graph_start` returns an
   `implement@1` pause.
4. Edits inside `implement@1`. Submit `{done: true}`. Answer `review@1`.

If `mcp_graph_graph_start` does **not** appear after `tool_search`:
close with `🕸️ graph: unavailable — run \`graph init\` in this repo`
and **STOP.** Do not edit any file. Ask user to run `graph init`.

## Ponytail rules (grep-able, not aspirational)
Before emitting any diff, verify:
- No new third-party import if stdlib covers it. Forbidden reinventions:
  `bytes.Equal`, `strings.Contains`, `filepath.Join`, `slices.Contains`,
  `errors.Is`, `os.ReadFile`, `json.Marshal`. Wrapper of one of these →
  delete.
- No helper function used exactly once — inline it.
- No defensive nil-guard on your own input: `if x == nil { x = ... }`.
  Fail loud or require the caller.
- No new config knob / flag / env var unless referenced from ≥2 call
  sites at time of writing.
- No wrapper that only forwards arguments.
- No comment explaining what code does. If the name isn't enough, rename.
- Close each write-task reply with `🐎 ponytail: <N deleted / M kept>`
  where N is lines you cut from your first draft. If N == 0, redraft.

## Editing
- No comments in new code unless user asks — no docstrings, no `// nota:`,
  no `# motivación:`. Context goes in chat.
- No workarounds — root cause always. No swallow try/catch, no defensive
  `typeof x === 'function'`, no fallback at first friction.

## Shell
- No `#` comments in multi-line commands — breaks paste.
- No `| head` / `| tail` / `| sed -n` / `2>/dev/null` on command output.
- Conditional `cd`: `[ -d dir ] && cd dir; rest`.

## Swarm mode (opt-in)
- Chatmode `swarm` (selector chat) o `/swarm` (prompt) para paralelizar via
  `runSubagent`. Hereda caveman + ponytail + graft + graph. No repetir el
  contract — se hereda de este archivo.
