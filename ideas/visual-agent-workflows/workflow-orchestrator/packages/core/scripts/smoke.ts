// Checks that the workspace is wired up: the agent SDK and LangGraph load,
// and a one-node graph runs. Calls no model and needs no API key.
import { Agent } from "@cursor/sdk";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";

const State = Annotation.Root({ greeting: Annotation<string> });

const graph = new StateGraph(State)
  .addNode("hello", () => ({ greeting: "hello from langgraph" }))
  .addEdge(START, "hello")
  .addEdge("hello", END)
  .compile();

const result = await graph.invoke({ greeting: "" });

console.log(`node            ${process.version}`);
console.log(`@cursor/sdk     Agent.create is ${typeof Agent.create}`);
console.log(`langgraph       ${result.greeting}`);
console.log(`CURSOR_API_KEY  ${process.env.CURSOR_API_KEY ? "set" : "not set (needed from slice 3)"}`);
