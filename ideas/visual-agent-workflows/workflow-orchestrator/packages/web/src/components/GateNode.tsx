import { Typography } from "@mui/material";
import type { Node, NodeProps } from "@xyflow/react";
import { type FlowNodeData, NodeFrame } from "./NodeFrame";

// A gate on the canvas: its label, marked as a review.
export function GateNode({ data }: NodeProps<Node<FlowNodeData>>) {
  const { node } = data;
  return (
    <NodeFrame node={node} kind="gate">
      <Typography variant="caption" color="text.secondary">
        ◆ review
      </Typography>
      <Typography variant="subtitle2">{node.step.label}</Typography>
    </NodeFrame>
  );
}
