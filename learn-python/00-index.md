# Learning Python from this codebase

These notes walk through Python language features using real code from
[`openai/read-next-project/readnext/config.py`](../openai/read-next-project/readnext/config.py)
and [`embed.py`](../openai/read-next-project/readnext/embed.py). Each file below
picks a theme, quotes the actual lines, and explains what's going on —
plus a bit of extra material where the source code doesn't happen to touch
something worth knowing.

Read in whatever order interests you; each file stands alone.

**Foundations**

1. [Modules & imports](01-modules-and-imports.md)
2. [pathlib: paths as objects](02-pathlib.md)
3. [Type hints](03-type-hints.md)
4. [Functions: defaults, keyword args, batching](04-functions.md)
5. [The module-level cache pattern (`global`, `Optional`, singletons)](05-global-singleton.md)
6. [Comprehensions, `enumerate`, `zip`, slicing](06-comprehensions-and-loops.md)
7. [Dicts, f-strings, and JSON](07-dicts-fstrings-json.md)
8. [Files, `with`, and context managers](08-files-and-context-managers.md)
9. [NumPy basics](09-numpy-basics.md)
10. [Decorators, bonus tour](10-decorators.md)

**Medium**

11. [Classes & OOP](11-classes-and-oop.md)
12. [Exceptions & error handling](12-exceptions.md)
13. [Iterators & generators (`yield`)](13-iterators-and-generators.md)
14. [Logging vs. print / hand-rolled logs](14-logging.md)

**Higher-level**

15. [Concurrency: threading & asyncio](15-concurrency.md)
16. [Dependency & environment management (Pipenv, venvs, `.env`)](16-dependencies-and-environments.md)
17. [Functional patterns: map/filter/lambda/sorted key](17-functional-patterns.md)
18. [Testing with pytest](18-testing-with-pytest.md)
