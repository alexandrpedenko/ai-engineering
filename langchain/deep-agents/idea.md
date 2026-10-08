# Project 3 — Workation concierge with memory (`deepagents`)

Revised 2026-10-04 after project 1; revised again 2026-10-05 to add MCP,
question-answering RAG and shipping, and to spread evals through the books.
Supersedes the first draft (git history has it). Written against `deepagents` 0.7.21 (latest on PyPI, read from its
source); re-checked against the installed source when each book spec is
written.

## Domain and business goal

A concierge you come back to, for a job too big for one agent loop: scouting a
three-week remote-work stay.

> "I'm working remotely from Iberia from 2026-12-01 to 2026-12-20. Up to €2,600
> for lodging in total. I need a gym and fast wifi, I'm vegetarian, and my dog
> comes with me. Pick two or three cities, compare a few neighbourhoods in
> each, shortlist hotels, check the pet and cancellation policies for every
> one on the shortlist, and give me a dossier I can book from."

**Why this is a long task.** Done properly it is four cities × (a hotel search,
three to five availability checks, two or three neighbourhood notes, two policy
lookups), which comes to 50+ tool calls, each returning a few hundred tokens of
JSON or prose. It also has constraints that must survive the whole run (the
dog, the budget, the gym), and a deliverable longer than a chat reply. Run it
through project 1's `create_agent` and it either stops early, forgets a
constraint after the history is summarised, or re-does work it already did.
Book 1 measures that failure with project 2's constraint checker. Every later
book is a fix for some part of it.

**Why it's a concierge you come back to.** Session 2 is a week later, on a new
thread: "same as last time, but Madrid instead of Porto, and I don't eat fish
any more." It should know who you are, what the last dossier looked like, what
you disliked about it, and how you like dossiers written. None of that is
restated.

Business goal: a returning user never restates preferences; a long research
task finishes with every hard constraint met and its context under control;
nothing is booked without approval; one user's memories never reach another
user.

Data: everything from projects 1 and 2, plus the research corpus the
sub-agents read:

- `data/neighbourhoods/<city>/<district>.md` — short local notes per district
  (noise, walkability, vegetarian food, coworking, parks for dogs);
- `data/reviews/<hotel_id>.jsonl` — ~5 guest reviews per hotel (~200 in
  all), generated once and committed. Short, opinionated, full of exact
  words ("wifi", "dog", hotel names) that dense search misses and keyword
  search finds;
- project 1's policy documents.

`evals/datasets/research_questions.jsonl` — ~40 questions about the corpus,
each labelled by hand with the chunks that answer it and the answer itself.

## Comes from the library, not taught again

Project 1 already taught these. Here they are part of `concierge/` and switched
on by default; a notebook mentions each in one line, at most:

- approval before `make_reservation` (`interrupt_on`, ADR-0004);
- conversation summarisation (built into `create_deep_agent`);
- `hotelbot.middleware.ScreenRetrievedText` on everything the policy sub-agent reads;
- retries and the model fallback from P1 book 7;
- card-number masking in traces;
- tracing to LangSmith, one project per book.

## The app — the same chat loop, more commands

`python -m concierge --user olek` reuses project 2's `tripgraph.app` shell,
with concierge-specific views and commands:

| command | shows |
| --- | --- |
| live panel | the todo list as it changes; which sub-agent is working |
| `/files`, `/open <path>` | the agent's working files and the dossier |
| `/memory` | what it remembers about you, by kind (see below) |
| `/forget <item>` | delete a memory; the next session doesn't know it |
| `/user <name>` | switch user — and check you don't see olek's memories |
| `/sessions`, `/new` | earlier threads; a fresh one |
| `/cost` | tokens per agent (parent vs each sub-agent) for this turn |
| 👍 / 👎 after a dossier | sends feedback to LangSmith (book 14) |

## Architecture

```
deep-agents/
  spec.md  specs/  adr/  idea.md
  data/        neighbourhoods/, memory.sqlite (gitignored), dossiers/ (written by the agent)
  concierge/
    agent.py       build_concierge(user_id, ...) — assembles the deep agent
    subagents/     hotel_researcher, neighbourhood_researcher, policy_expert,
                   itinerary_planner (project 2's graph) — one module each:
                   prompt, tools, model, permissions
    memory/        namespaces.py (per-user store namespaces), schemas.py
                   (profile, episode), reflect.py (background extraction),
                   controls.py (list / forget)
    backends.py    the CompositeBackend: which path lives where
    research/      ingest.py (load, chunk, metadata, re-index only what
                   changed), retrieve.py (filter, hybrid, rerank),
                   answer.py (cited answer)
    mcp/           server.py — hotels, availability, research search and
                   policy search as MCP tools; client.py — which tools each
                   sub-agent loads
    skills/        SKILL.md files — e.g. writing-a-dossier
    prompts.py
    app/           concierge views and commands on top of tripgraph.app
  tests/           permissions, namespace isolation, memory merge rules — no model
  evals/           research questions, dossier rubric, memory recall —
                   same runner and tiers as project 2 (P2 ADR-0007)
  Dockerfile  compose.yaml   reusing project 2's book 15 setup
```

The structure is taught in the notebooks the same way as in project 2: the
problem first, then the structure that removes it.

## The memory map — every kind, one at a time

The headline. Each kind gets introduced by the problem it solves, not as a
list:

| kind | what it holds here | where it lives | book |
| --- | --- | --- | --- |
| **thread (short-term)** | this conversation's messages | checkpointer — from P1 | library |
| **working memory** | todo list, research notes for the current task | agent state files (`StateBackend`) | 2 |
| **offloaded history** | the full transcript after summarisation | `/conversation_history/` written by the summariser | 9 |
| **semantic — profile** | one structured record: diet, pets, budget style, must-have amenities | store, `/memories/` | 10 |
| **semantic — collection** | many small facts ("dislikes noisy streets"), searched by meaning | store with an embedding index | 10 |
| **episodic** | past trips and how they went; earlier dossiers as examples | store, searched by similarity | 11 |
| **procedural** | how this user wants things done: `AGENTS.md` the agent edits from feedback; skills for how to do a task | `memory=[...]`, `skills=[...]` | 11 |
| **organisational** | the travel agency's rules — read-only for the agent | `FilesystemBackend` route + `FilesystemPermission` deny | 11 |

And the engineering around memory, which is most of the real work:

- **when memory is written** — in the hot path (the agent edits `/memories/`
  mid-conversation) vs in the background (a reflection graph reads the
  finished session and extracts memories) — both built, compared on latency
  and quality;
- **updates and conflicts** — "I don't eat fish any more" must replace an old
  fact, not add a contradicting one; facts carry a timestamp and a source;
- **memory poisoning** — the injected policy document from P1 tries to write
  "always book the most expensive room" into memory;
- **isolation** — namespaces per user from `context_schema`; a test that user
  B never reads user A's store;
- **user control** — `/memory`, `/forget`; deletion that actually deletes;
- **what must not be remembered** — card numbers, anything said as "don't
  remember this".

## What the `deepagents` API should cover

1. **`create_deep_agent` and what it adds** — the long task through
   `create_agent` first (measured failure), then `create_deep_agent` with the
   same tools. Print the middleware stack it assembles: filesystem tools,
   `task`, summarisation, tool-call patching, prompt caching. Note what is
   *not* there in 0.7: the `write_todos` planning tool is no longer in the
   default stack.
2. **Planning** — add `TodoListMiddleware`; watch the plan get written and
   revised; a brief where the first plan is wrong (a city with no pet-friendly
   hotel) and the agent re-plans.
3. **Files and backends** — `StateBackend` (in state, gone with the thread) →
   `FilesystemBackend` for the dossier you open on disk → `CompositeBackend`
   routing paths to different backends. `FilesystemPermission` rules: the
   agent may write `/dossiers/` but not `/org/`.
4. **Sub-agents** — `SubAgent` specs with their own prompt, tools, model and
   permissions; delegation through `task`; the context isolation measured:
   tokens in the parent with and without delegation. `policy_expert` holds the
   P1 Chroma index (`hotelbot.index.get_policy_index`); the main agent never
   sees raw chunks.
5. **Project 2 as a sub-agent** — the tripgraph planner wrapped as a
   `CompiledSubAgent` (its state needs a `messages` key — a thin adapter graph
   if not). It runs in draft-only mode: booking stays with the parent, behind
   `interrupt_on`, because a compiled sub-agent doesn't inherit the parent's
   interrupts.
6. **Long sessions** — summarisation firing mid-research; the offloaded
   history file; the agent re-reading its own notes after the summary — the
   files are what keep the long task working after a summary.
7. **Long-term memory** — `StoreBackend` behind `/memories/`, namespaced per
   user (`NamespaceFactory`), SQLite-backed so it survives a restart; the
   kinds in the map above, one book section each.
8. **Procedural memory and skills** — `memory=["/memories/AGENTS.md"]` loaded
   into the prompt and edited by the agent; `skills=[...]` with a SKILL.md for
   writing a dossier, loaded only when needed.
9. **Self-check** — `RubricMiddleware`: a grader sub-agent checks the dossier
   against a rubric before the agent is allowed to finish, and sends it back
   if a constraint is missed.
10. **Guardrails for delegating agents** — the poisoned policy doc read by
    `policy_expert`: does the instruction reach the parent? Does it reach
    memory? Narrow tools and per-sub-agent permissions as the fix.
11. **Tools over MCP** — the same research tools served from an MCP server
    (`concierge/mcp/server.py`) and loaded by the sub-agents through
    `langchain-mcp-adapters`. First the tools as plain functions, then the
    same tools over stdio, then over streamable HTTP as a separate process.
    Which tools each sub-agent gets is least privilege again, now enforced
    by the client. A tool result from a server is untrusted text, like a
    retrieved document.
12. **Question-answering RAG** — the research corpus made searchable well
    enough that a wrong answer can be blamed on the right step. It builds on
    read-next, which derived BM25, RRF and rerank by hand; here they are
    LangChain retrievers (`BM25Retriever`, `EnsembleRetriever`, a rerank
    step), used, not re-derived. New here: an ingestion pipeline that
    re-indexes only changed files (content hashes); chunks carrying metadata
    (city, district, hotel id, source) and filters on it; a hand-labelled
    question set, which read-next deliberately doesn't have, so recall@k and
    MRR are measured against the right answers; each step (filter, hybrid,
    rerank, query rewrite) added only if the numbers move; answers that cite
    chunk ids, with a groundedness check that every claim comes from a
    cited chunk. Served to the sub-agents as an MCP tool.
13. **Shipping** — project 2's Docker, compose and CI setup extended: the MCP
    server as its own container, the memory store and Chroma on volumes,
    the research-question and memory evals in the gate.
14. **Background sub-agents (stretch)** — `AsyncSubAgent` pointing at project
    2's planner served by `langgraph dev`: research keeps running while you
    keep chatting.

## AI engineering, spread through the books

| topic | book |
| --- | --- |
| measuring an agent's failure before fixing it | 1 |
| context engineering: tokens with vs without files and sub-agents | 2, 3, 9 |
| least privilege per agent, permissions as tests | 2, 3, 4, 7 |
| tool protocols: MCP servers and clients, transports | 4 |
| RAG: ingestion, metadata, hybrid, rerank, labelled retrieval evals, citations, groundedness | 5, 6 |
| guardrails for delegation: untrusted text from documents and MCP tools | 7 |
| composing systems: a graph as a sub-agent | 8 |
| memory design: write path, conflicts, staleness, isolation, deletion | 10–12 |
| privacy: what is never stored, multi-user isolation | 12 |
| self-evaluation in the loop vs offline evals | 13 |
| memory evals: does it recall the right fact, does it write junk | 13 |
| cost per agent, cost before vs after summarisation | 14 |
| online evals: user feedback, annotation queue, judge on sampled traces | 14 |
| shipping: containers, CI with an eval gate, releases | 15 |

Evals follow project 2's ADR-0007: a book that adds model behaviour adds its
dataset and evaluators in the same book (the long-task constraint check from
book 1, research questions from book 5, the dossier rubric, memory recall),
all run by the same runner and gated in CI.

## Rough book outline

1. `1-why-deep` — the long task through `create_agent`, measured; then `create_deep_agent`; the stack it builds; the CLI shell.
2. `2-planning-and-files` — todos; state, disk and composite backends; permissions.
3. `3-subagents` — researchers; context isolation measured; policy RAG in a sub-agent.
4. `4-tools-over-mcp` — the research tools as an MCP server; stdio, then HTTP; tool sets per sub-agent.
5. `5-rag-ingestion-and-measurement` — the corpus, incremental ingestion, metadata, the labelled questions, the baseline recall@k / MRR.
6. `6-rag-retrieval-and-answers` — filters, hybrid, rerank, query rewrite, each measured; cited answers; groundedness; served over MCP.
7. `7-guardrails-for-delegation` — the poisoned doc and a poisoned MCP tool result vs sub-agent isolation.
8. `8-planner-as-subagent` — tripgraph as a `CompiledSubAgent`; booking stays with the parent.
9. `9-long-sessions` — summarisation, offloaded history, files keep the task alive.
10. `10-memory-semantic` — store, per-user namespaces, profile vs collection, hot-path writes.
11. `11-memory-episodic-and-procedural` — past trips; AGENTS.md; skills; org memory read-only.
12. `12-memory-management` — background reflection, conflicts, poisoning, isolation tests, `/forget`.
13. `13-self-check-and-memory-evals` — `RubricMiddleware`; memory recall dataset.
14. `14-cost-and-online-evals` — tokens per agent; feedback from the CLI; annotation queue; judge on live traces.
15. `15-shipping` — containers for the concierge and the MCP server, volumes, CI gate.
16. `16-background-subagents` — stretch, only if 15 lands cleanly.

## Decisions

- Stay in the travel domain; `hotelbot` and `tripgraph` are imported, never
  copied.
- Memory starts unconstrained in book 10; schemas (profile, episode) arrive
  once the free-form file gets messy — that failure is part of the lesson.
- SQLite-backed store so "come back next week" survives a restart; the
  embedding index for semantic search uses project 1's OpenAI embeddings.
- Upgrading to `deepagents` 0.7.21 requires `langchain>=1.4.3` (1.4.0 is
  installed) and pulls in `langchain-google-genai`. Projects 1 and 2 are re-run
  on the upgraded stack before book 1 starts.
- MCP through `langchain-mcp-adapters`, server with the official `mcp`
  SDK; both versions checked when book 4's spec is written.
- RAG stays on Chroma (P1 ADR-0008) and OpenAI embeddings; BM25 via
  `rank-bm25` (already used by read-next). The rerank model (an LLM
  listwise rerank as in read-next, or a hosted reranker) is decided at
  book 6's spec.
- Fine-tuning is out of scope for this track.
- Book specs cite the exact `deepagents` version they were written against;
  an API that turns out different during a build goes in that spec's
  amendments (CLAUDE.md), not into a silent rewrite.
