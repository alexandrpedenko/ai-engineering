import { Box, Stack, Tooltip } from "@mui/material";
import { Handle, Position } from "@xyflow/react";
import type { ReactNode } from "react";
import type { CanvasNode } from "../domain/workflowCanvas";

// What every node on the canvas carries.
export type FlowNodeData = { node: CanvasNode };

type Props = { node: CanvasNode; kind: "step" | "gate"; children: ReactNode };

// The outline shared by every node on the canvas: a border coloured by the
// node's worst problem (or the selection), a dot naming that problem's
// severity with the messages in a tooltip, and a handle on each side to
// connect steps (in on the left, out on the right). Gates get a double border.
export function NodeFrame({ node, kind, children }: Props) {
  const border = node.severity ? `${node.severity}.main` : node.selected ? "primary.main" : "divider";
  return (
    <Box
      role="group"
      aria-label={`step ${node.id}`}
      sx={{
        minWidth: 180,
        maxWidth: 220,
        px: 1.5,
        py: 1,
        bgcolor: "background.paper",
        borderColor: border,
        borderRadius: kind === "step" ? 1 : 6,
        borderStyle: kind === "gate" ? "double" : "solid",
        borderWidth: kind === "gate" ? 4 : 2,
      }}
    >
      <Handle type="target" position={Position.Left} />
      <Stack direction="row" sx={{ alignItems: "flex-start", justifyContent: "space-between", gap: 1 }}>
        <Box sx={{ minWidth: 0 }}>{children}</Box>
        {node.severity && (
          <Tooltip title={node.problems.join(" · ")}>
            <Box
              component="span"
              aria-label={node.severity === "error" ? "has errors" : "has warnings"}
              sx={{ width: 8, height: 8, mt: 0.75, flexShrink: 0, borderRadius: "50%", bgcolor: `${node.severity}.main` }}
            />
          </Tooltip>
        )}
      </Stack>
      <Handle type="source" position={Position.Right} />
    </Box>
  );
}
