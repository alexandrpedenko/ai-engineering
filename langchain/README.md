# LangChain track

Three small projects, one per layer of the LangChain stack, all in the same
travel domain so the data and the vocabulary carry over from one to the next.

| Folder | Library | Project | Learns |
| --- | --- | --- | --- |
| [lang-chain/](lang-chain/idea.md) | `langchain` (`create_agent`) | Hotel booking assistant | models, tools, agent loop, structured output, middleware, RAG as a tool, prompt iteration, retries/fallbacks, prompt-injection guardrails, tracing |
| [lang-graph/](lang-graph/idea.md) | `langgraph` | Trip itinerary planner | explicit state graphs, deterministic + agentic nodes, fan-out, loops, checkpoints, interrupts, time travel, model routing & cost, evals in every book (component, trajectory, multi-turn, judge, regression gate), guardrail nodes, shipping (Docker, CI) |
| [deep-agents/](deep-agents/idea.md) | `deepagents` | Travel concierge with memory | batteries-included agent, planning, virtual filesystem, subagents, long-term memory (SQLite store), context compression, sub-agent isolation, tools over MCP, question-answering RAG (ingestion, hybrid, rerank, labelled retrieval evals, citations), cost breakdown, online evals |

Order: lang-chain → lang-graph → deep-agents. Each one reuses the previous one's
data (`hotels.json`, policy docs) and, where it makes sense, the previous one's
tools. LangSmith is switched on from project 1 and used more deliberately in each
following project (tracing → datasets/evals → monitoring a long-running agent).

Besides the library APIs, these AI-engineering topics run through the track:
prompt engineering (P1), reliability (P1), testing with fake models (P2),
guardrails (P1, P2 book 12, P3), cost & latency (P2, P3), evaluation (in
every P2 book from book 2, online in P3), tool protocols (MCP, P3), RAG
(P3, building on read-next's hybrid search and rerank) and shipping (Docker
and CI with an eval gate, P2 and P3). Deliberately out of scope here:
fine-tuning, multimodal, async/batching.

Shared across the three: Anthropic for chat, OpenAI for embeddings, the
`hotelbot` package from project 1, SQLite for anything persistent.

Each `idea.md` is a draft, not a spec: domain, business goal, which API features
it should cover, a rough notebook outline, and the decisions taken so far. A proper spec with
a cell outline gets written (and sliced) before the first notebook is built.
