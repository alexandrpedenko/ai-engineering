import { Chip, Stack, Typography } from "@mui/material";
import type { Node, NodeProps } from "@xyflow/react";
import { type FlowNodeData, NodeFrame } from "./NodeFrame";

// An agent step on the canvas: its label, agent and required skills.
export function AgentStepNode({ data }: NodeProps<Node<FlowNodeData>>) {
  const { node } = data;
  const step = node.step.type === "agent" ? node.step : null;
  return (
    <NodeFrame node={node} kind="step">
      <Typography variant="subtitle2">{node.step.label}</Typography>
      <Typography variant="caption" color="text.secondary">
        {step?.agent || "no agent yet"}
      </Typography>
      {step && step.skills.length > 0 && (
        <Stack direction="row" spacing={0.5} sx={{ mt: 0.5, flexWrap: "wrap" }}>
          {step.skills.map((skill) => (
            <Chip key={skill} size="small" label={skill} />
          ))}
        </Stack>
      )}
    </NodeFrame>
  );
}
