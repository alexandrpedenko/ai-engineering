# Slice 7 — the file editor

**Status:** built (2026-10-11), in review.

**Capability.** Edit the project's skills, agents and artefacts in the
browser: open a file from the project page or from a gate, change it in a
code editor, save it. Saving never silently overwrites a change made on disk
meanwhile (by an agent step, or by you in your IDE). A skill edited here is
what the next agent step is told, because every step reads the registry
afresh.

```
/files?path=.cursor/skills/user-flows/SKILL.md          ● unsaved   [ Save ]
┌──────────────────────────────────────────────────────────────────────────┐
│  1  ---                                                                  │
│  2  name: user-flows                                                     │
│  3  description: Map how each user moves through the product, step by…   │
│  4  ---                                                                  │
│  5  # User flows                                                         │
│  …                                                       (Monaco, markdown)
└──────────────────────────────────────────────────────────────────────────┘
 skill "user-flows" · used by: UX flows (flows)
 ⚠ This file changed on disk since you opened it.  [ Reload ]  [ Overwrite ]
```

Follows [../spec.md](../spec.md), ADRs 0010 (layers), 0011 (TanStack Query +
Zustand), 0012 (tests), 0014 (which files the orchestrator opens), 0015
(local requests only).

## Decisions to review

1. **Monaco is bundled, not loaded from a CDN.** By default
   `@monaco-editor/react` downloads Monaco at run time from cdn.jsdelivr.net
   (0.55.1, not the 0.57.0 installed). For a local tool that means the editor
   needs the internet and runs code we didn't pin. Instead: `monaco-editor`
   becomes a direct, exact dependency (0.57.0) and is handed to the loader
   (`loader.config({ monaco })`) with Vite's worker imports, in
   `bootstrap/`. Cost: a larger bundle, loaded only when the editor page
   opens (lazy route).
2. **Saving checks the version.** `GET /api/files` also returns `version`
   (a content hash). `PUT` sends `{ content, baseVersion }`, and the server
   answers **409** when the file on disk no longer has that version. The page
   then offers Reload (lose your edits) or Overwrite (send again without
   `baseVersion`). This matters because agents write the same files during
   runs.
3. **Existing files only.** The editor opens and saves files that exist
   (`canOpen`, ADR-0014 and slice 5.8's amendment). Creating a new skill,
   agent or artefact from the browser is **not** in this slice (see "Not in
   this slice"); it needs a template and a folder choice of its own.

## Screens and routes

| route | page | change |
| --- | --- | --- |
| `/files?path=<path>` | `FileEditorPage` (new, lazy) | the editor for one file |
| `/project` | `ProjectPage` | each skill, agent and artefact opens in the editor |
| `/runs/:runId` | `RunPage` | each file at a gate gets an **Edit** link |

**Editor.** Monaco, language from the file's extension (`.md`/`.mdx` →
markdown, `.json`, `.ts`/`.tsx`, `.yaml`/`.yml`, else plain text), word wrap
on, the app's light or dark theme. Above it: the path, "● unsaved" when the
text differs from what was loaded, **Save** (also ⌘/Ctrl+S) and **Discard
changes**.

**What the file is.** Under the editor, from the registry: "skill
`<name>`" or "agent `<name>`" (or "artefact"), the workflows and steps that
use that skill or agent, and any registry warning for this path (broken
frontmatter, missing description, a name that differs from its folder). After
a save the registry is fetched again, so a fixed warning disappears.

**Unsaved edits.** Kept in a Zustand store by path (like workflow drafts),
so leaving the page and coming back keeps them; closing the tab with unsaved
edits asks the browser to confirm. The sidebar doesn't list files, so there
is no sidebar marker.

**Large or unreadable files.** A file over 1 MB is refused by the server
(as now) and the page says so; there is no partial editing.

## Layers

```
core/
  domain/fileVersion.ts        fileVersion(content) → string (sha1 hex of the UTF-8 text)
  application/projectFile.ts   readProjectFile → { path, content, version };
                               writeProjectFile(files, path, content, baseVersion?) → { version };
                               ConflictError when baseVersion is given and the file's version differs
server/
  routes/projectRoutes.ts      GET → { path, content, version }; PUT { content, baseVersion? } → 200 { version } / 409
web/
  domain/
    fileKind.ts                fileKind(path, registry) → { kind: "skill" | "agent" | "artefact" | "other", name? }
    fileLanguage.ts            languageOf(path) → Monaco language id
    fileUsage.ts               usedBy(kind, name, workflows) → { workflowId, workflowName, stepIds }[]
  application/
    OrchestratorApi.ts         file(path) → { path, content, version }; saveFile(path, content, baseVersion?) → { version }
    useFileDraftStore.ts       drafts by path: { content, baseVersion }
    useFileDraft.ts            the page's view: draft or loaded text, dirty, edit, discard, markSaved
    mutations.ts               + useSaveFile (sets the file's cache to the saved text and version; invalidates project)
    queries.ts                 + useFile(path) (one file; useFiles stays for gates)
  api/HttpOrchestratorApi.ts   + saveFile; file() reads `version`
  components/
    CodeEditor.tsx             Monaco wrapper: value, language, onChange, onSave (⌘/Ctrl+S)
    FileFacts.tsx              kind, name, used-by, warnings
    FileConflictAlert.tsx      "changed on disk" with Reload / Overwrite
  pages/
    FileEditorPage.tsx (new, lazy); ProjectPage (links); RunPage (Edit link per gate file)
  bootstrap/
    monaco.ts                  loader.config({ monaco }) + Vite worker setup
    routes.tsx                 + lazy /files route
```

Workflows used for "used by" come from the existing `useWorkflows` list
plus `useWorkflow(id)` per workflow. To keep that to one request, the list
answer (`GET /api/workflows`) gains each workflow's `agents` and `skills`
(the names its steps use).

## Server and core

| method | path | change |
| --- | --- | --- |
| GET | `/api/files?path=` | answer gains `version` |
| PUT | `/api/files?path=` | body `{ content, baseVersion? }`; answers **200 `{ version }`** (was 204); **409** `{ error, version }` when `baseVersion` doesn't match the file on disk |
| GET | `/api/workflows` | each summary gains `agents: string[]`, `skills: string[]` |

These change the Server API in [../spec.md](../spec.md) and go into its
Amendments when built.

`version` is computed from the text the server read, so two reads of an
unchanged file give the same version. The check and the write are not one
atomic step; a write that lands between them is the same accepted risk as a
person editing during a step (ADR-0007).

## Tests

| file | checks |
| --- | --- |
| `core/tests/domain/fileVersion.test.ts` | same text → same version; one character changed → different |
| `core/tests/application/projectFile.test.ts` | read returns the version; write with the current `baseVersion` saves and returns the new version; a stale `baseVersion` → `ConflictError`, file untouched; no `baseVersion` overwrites |
| `server/tests/routes/projectRoutes.test.ts` | GET has `version`; PUT → 200 with the new version; PUT with a stale `baseVersion` → 409 with the current version; a body without `content` → 400 |
| `server/tests/routes/workflowRoutes.test.ts` | the list has each workflow's agents and skills |
| `server/tests/routes/projectRoutes.test.ts` (end to end) | a skill saved through `PUT /api/files`, then a run started over HTTP on the fake agent: the elicit step's message contains the saved line |
| `web/tests/domain/fileKind.test.ts`, `fileLanguage.test.ts`, `fileUsage.test.ts` | a skill / agent / artefact path; languages by extension; the workflows and steps using a skill or agent |
| `web/tests/application/useFileDraftStore.test.ts`, `useFileDraft.test.ts` | a draft per path; markSaved only drops the draft it saved; discard |
| `web/tests/application/mutations.test.tsx` | useSaveFile sends `baseVersion`, updates the file's cache, invalidates the project |
| `web/tests/api/HttpOrchestratorApi.test.ts` | saveFile: URL, method, body; 409 → `ApiError` |
| `web/tests/pages/FileEditorPage.test.tsx` | loads the file into the editor; typing marks it unsaved; Save sends the text and base version and clears the mark; a 409 shows the conflict with Reload (loads the disk version) and Overwrite (saves without `baseVersion`); a registry warning for the file is shown; a skill shows the workflows using it; an unknown path shows the server's refusal |
| `web/tests/pages/ProjectPage.test.tsx`, `RunPage.test.tsx` | a skill opens the editor; a gate file's Edit link opens it |

In page tests Monaco is replaced by a plain `<textarea>` (a test double for
`CodeEditor`'s module), because Monaco needs a real browser. The wrapper's
own behaviour (⌘/Ctrl+S, language) is checked in the Done-when steps.

## Done when

- `npm run check` passes; `npm run build` works offline (no request to a CDN
  when the editor opens: checked in the browser's network tab).
- With `npm run dev:sample`:
  1. Open the `requirements-elicitation` skill from the project page, add a
     line ("Mark each requirement with a priority."), save.
  2. Run BA discovery with a real runtime: the requirements it writes carry
     priorities. (The prompt itself isn't shown anywhere yet; the automated
     check is the server test below.)
  3. Open `discovery/brief.md` in the editor, change it in your IDE too, then
     save in the browser: the conflict appears; Reload shows the IDE's text.
  4. At a gate, Edit on the shown file opens it in the editor.

## Not in this slice

- Creating, renaming or deleting files (new skills and agents from a
  template belong together with that; a roadmap item if wanted).
- Markdown preview, diff view against git, or editing several files in tabs.
- Editing files the registry doesn't know about beyond what `canOpen` allows
  (source code is openable since 5.8; nothing here adds to that).

## Amendments

**2026-10-11, slice 7 build — the file version comes from the adapter, not the domain.**
Spec said: `core/domain/fileVersion.ts` computes the version (SHA-1 of the text).
Now: `ProjectFiles.readText` returns `version` and `writeText` returns the
written content's `{ version }`; `FsProjectFiles` computes the SHA-1 of the
bytes (the same hash its snapshots use). A stale `baseVersion` throws
`FileChangedError` (a `ConflictError` carrying the current version), which
the route maps to 409 `{ error, version }`.
Why: the domain layer may use only `zod` (ADR-0010), and hashing needs
`node:crypto`; the adapter already hashes files.

**2026-10-11, slice 7 build — "used by" lists workflows, not steps.**
Spec said: the workflows **and steps** that use the skill or agent.
Now: the workflows, by name, each a link to its page. The list answer gains
`agents` and `skills` per workflow, as the spec says; step ids would need the
step list too.
Why: workflow names answer "where does this matter?"; the step is one click
further. Kept the list answer small.

**2026-10-11, slice 7 build — the fake agent quotes the skills it was given.**
Spec said: the end-to-end test checks "the elicit step's message contains the
saved line"; nothing said how the test sees the message.
Now: `FakeAgentRuntime`'s placeholder files quote the "Skills to follow"
section (everything up to "# Task"), like they already quoted reviewer
feedback. The server test saves the skill, runs BA discovery and finds the
line in the written `discovery/requirements.md`. The same is visible by hand
with `npm run dev:sample`, so done-when 2 can also be checked without a real
runtime.
Why: no test-only hook in the production wiring; and it makes dev:sample show
what each step was told.

**2026-10-11, slice 7 build — smaller additions.**
Spec said: the listed layers and tests.
Now: `useLeaveWarning` moved from the workflow editor to `application/` and
is shared by both editors; `FileView` gets an optional Edit button
(`GatePanel.onEditFile`); `renderPage`'s location shows the query string too;
`monaco-editor` 0.57.0 is a direct dependency of `@orch/web` (it was already
installed as a peer of `@monaco-editor/react`).
Why: one job per file, no copies; tests need to see `?path=`.
