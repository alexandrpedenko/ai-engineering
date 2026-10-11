import { Background, Controls, ReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

// An empty React Flow canvas. Nodes and edges arrive with the workflow editor.
export function WorkflowCanvas() {
  return (
    <ReactFlow nodes={[]} edges={[]} fitView>
      <Background />
      <Controls />
    </ReactFlow>
  );
}
