import { describe, expect, it } from "vitest";
import { AsyncQueue } from "../../../src/infrastructure/agentRuntime/AsyncQueue";

async function readAll<T>(queue: AsyncQueue<T>) {
  const values: T[] = [];
  for await (const value of queue) values.push(value);
  return values;
}

describe("AsyncQueue", () => {
  it("keeps values pushed before reading, and stops at end", async () => {
    const queue = new AsyncQueue<number>();
    queue.push(1);
    queue.push(2);
    queue.end();
    expect(await readAll(queue)).toEqual([1, 2]);
  });

  it("wakes a waiting reader for each new value", async () => {
    const queue = new AsyncQueue<string>();
    const reading = readAll(queue);
    queue.push("a");
    await Promise.resolve();
    queue.push("b");
    queue.end();
    expect(await reading).toEqual(["a", "b"]);
  });

  it("delivers values pushed before a failure, then rejects", async () => {
    const queue = new AsyncQueue<number>();
    queue.push(1);
    queue.fail(new Error("stream broke"));
    const seen: number[] = [];
    await expect(
      (async () => {
        for await (const value of queue) seen.push(value);
      })(),
    ).rejects.toThrow("stream broke");
    expect(seen).toEqual([1]);
  });

  it("ignores values pushed after end", async () => {
    const queue = new AsyncQueue<number>();
    queue.end();
    queue.push(1);
    expect(await readAll(queue)).toEqual([]);
  });
});
