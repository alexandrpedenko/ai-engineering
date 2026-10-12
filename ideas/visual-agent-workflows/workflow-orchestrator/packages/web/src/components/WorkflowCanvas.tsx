import { Box } from "@mui/material";
import {
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  Controls,
  type Edge,
  MarkerType,
  type Node,
  type NodeTypes,
  ReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useEffect, useState } from "react";
import type { Canvas } from "../domain/workflowCanvas";
import { GateNode } from "./GateNode";
import type { FlowNodeData } from "./NodeFrame";
import { AgentStepNode } from "./AgentStepNode";

type Props = {
  canvas: Canvas;
  onSelect: (stepId: string | null) => void;
  onMove: (moved: { stepId: string; position: { x: number; y: number } }[]) => void;
  onConnect: (from: string, to: string) => void;
  onRemoveStep: (stepId: string) => void;
  onDisconnect: (from: string) => void;
};

const nodeTypes: NodeTypes = { agent: AgentStepNode, gate: GateNode };

function flowNodes(canvas: Canvas): Node<FlowNodeData>[] {
  return canvas.nodes.map((node) => ({ id: node.id, type: node.type, position: node.position, selected: node.selected, data: { node } }));
}

function flowEdges(canvas: Canvas): Edge[] {
  return canvas.edges.map((edge) =>
    edge.kind === "next"
      ? { id: edge.id, source: edge.source, target: edge.target, markerEnd: { type: MarkerType.ArrowClosed } }
      : {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          label: "reject",
          deletable: false,
          selectable: false,
          style: { strokeDasharray: "6 4" },
          markerEnd: { type: MarkerType.ArrowClosed },
        },
  );
}

// The workflow drawn with React Flow. The workflow (through `canvas`) is the
// source of truth: React Flow keeps its own copy only so nodes can follow the
// mouse while dragged, and every finished gesture is reported as an edit. A
// new `canvas` that arrives mid-drag leaves the dragged nodes where they are.
export function WorkflowCanvas({ canvas, onSelect, onMove, onConnect, onRemoveStep, onDisconnect }: Props) {
  const [nodes, setNodes] = useState(() => flowNodes(canvas));
  const [edges, setEdges] = useState(() => flowEdges(canvas));
  useEffect(() => {
    setNodes((current) =>
      flowNodes(canvas).map((node) => {
        const live = current.find((c) => c.id === node.id);
        return live?.dragging ? { ...node, position: live.position, dragging: true } : node;
      }),
    );
    setEdges(flowEdges(canvas));
  }, [canvas]);

  return (
    <Box aria-label="workflow canvas" sx={{ height: 520, border: 1, borderColor: "divider", borderRadius: 1 }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={(changes) => setNodes((current) => applyNodeChanges(changes, current))}
        onEdgesChange={(changes) => setEdges((current) => applyEdgeChanges(changes, current))}
        onNodeDragStop={(_, _node, dragged) => onMove(dragged.map((node) => ({ stepId: node.id, position: node.position })))}
        onNodeClick={(_, node) => onSelect(node.id)}
        onPaneClick={() => onSelect(null)}
        onConnect={(connection) => onConnect(connection.source, connection.target)}
        onNodesDelete={(deleted) => {
          for (const node of deleted) onRemoveStep(node.id);
        }}
        onEdgesDelete={(deleted) => {
          for (const edge of deleted) {
            if (canvas.edges.find((e) => e.id === edge.id)?.kind === "next") onDisconnect(edge.source);
          }
        }}
        deleteKeyCode={["Backspace", "Delete"]}
        fitView
      >
        <Background />
        <Controls />
      </ReactFlow>
    </Box>
  );
}
