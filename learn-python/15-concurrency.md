# Concurrency: threading & asyncio

`embed_texts` in `embed.py` makes its API calls **sequentially**:

```python
for start in range(0, len(to_fetch), batch_size):
    batch_idx = to_fetch[start : start + batch_size]
    batch_texts = [texts[i] for i in batch_idx]
    response = client.embeddings.create(input=batch_texts, model=model)
    tokens_billed += response.usage.total_tokens
    for idx, item in zip(batch_idx, response.data):
        ...
```

Each iteration waits for the previous `client.embeddings.create(...)` call to
return before starting the next one. If you have 2,000 texts and a batch
size of 100, that's 20 sequential HTTP round trips — and each one spends most
of its time just *waiting* on the network, not using the CPU. That's exactly
the situation concurrency is good at speeding up.

**Why this matters here specifically.** `ARXIV_TARGET_COUNT = 2000` in
`config.py` means a first-time embedding run (nothing cached yet) makes ~20
sequential API calls. Each might take a second or two — so ~20-40 seconds
spent almost entirely idle, waiting on OpenAI's servers. Running those
requests concurrently instead of one-at-a-time could cut that to close to the
time of a single call.

**Threading** — the simplest way to parallelize I/O-bound work like this in
Python:

```python
from concurrent.futures import ThreadPoolExecutor

def _fetch_batch(batch_texts: list[str], model: str, client) -> list:
    return client.embeddings.create(input=batch_texts, model=model)

batches = [to_fetch[start:start + batch_size] for start in range(0, len(to_fetch), batch_size)]
with ThreadPoolExecutor(max_workers=5) as pool:
    responses = list(pool.map(
        lambda idx: _fetch_batch([texts[i] for i in idx], model, client),
        batches,
    ))
```

`ThreadPoolExecutor` runs up to `max_workers` calls to `_fetch_batch` at the
same time, on separate OS threads, and `pool.map` returns results in the
same order the inputs were given — important here, since results still need
to line up with `batch_idx` afterward. This works well *specifically because*
the bottleneck is waiting on network I/O: while one thread is blocked
waiting for OpenAI to respond, Python's GIL (Global Interpreter Lock — the
mechanism that normally lets only one thread run Python bytecode at a time)
is released, so other threads can make progress. Threading would *not* help
for CPU-heavy work (e.g. a big NumPy computation) — that's what
`ProcessPoolExecutor` (separate processes, each with its own GIL) or NumPy's
own internal parallelism is for.

**asyncio** — the other common approach, and increasingly the one API client
libraries are built around:

```python
import asyncio
from openai import AsyncOpenAI

async def embed_batch(client: AsyncOpenAI, batch_texts: list[str], model: str):
    return await client.embeddings.create(input=batch_texts, model=model)

async def embed_all_batches(batches: list[list[str]], model: str):
    client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    tasks = [embed_batch(client, batch, model) for batch in batches]
    return await asyncio.gather(*tasks)
```

`async def` marks a *coroutine function* — calling it doesn't run the body,
it returns a coroutine object (similar to how calling a generator function
doesn't run it either — see [13-iterators-and-generators.md](13-iterators-and-generators.md)).
`await` pauses the current coroutine until the awaited call completes,
*without blocking the whole program* — while one coroutine is awaiting a
network response, Python's event loop runs other ready coroutines.
`asyncio.gather(*tasks)` (the `*` here *unpacks* the list into separate
positional arguments — the counterpart to the `**kwargs`-style unpacking
you'd see for dicts) kicks off every coroutine in `tasks` and waits for all
of them together, running them concurrently rather than one after another.

**Threads vs. asyncio, practically:** asyncio requires the whole call chain
to be `async` (an `async` function can't easily call a plain blocking one,
including this project's synchronous `OpenAI` client — you'd need
`AsyncOpenAI` instead, as above), which is a bigger structural change; thread
pools are the lower-effort retrofit onto existing synchronous code like
`embed_texts`. Given how this codebase is currently written entirely
synchronously, `ThreadPoolExecutor` is the more natural first step; `asyncio`
is the more scalable long-term answer if the project ever grows into a
server handling many concurrent requests rather than a notebook running a
batch job once.

**A caution that applies to either approach:** running requests concurrently
means you can hit OpenAI's rate limits faster than the sequential version
did. Pairing concurrency with retry/backoff logic (see the `try`/`except`
example in [12-exceptions.md](12-exceptions.md)) isn't optional once you
parallelize — it's the difference between "faster" and "faster until it
falls over."
