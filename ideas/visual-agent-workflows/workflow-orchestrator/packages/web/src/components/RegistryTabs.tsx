import { Alert, Box, List, ListItem, ListItemButton, ListItemText, Stack, Tab, Tabs, Typography } from "@mui/material";
import type { Registry } from "@orch/core";
import { useState } from "react";

const kB = (bytes: number) => `${(bytes / 1024).toFixed(1)} kB`;

// What the orchestrator found in the project: skills, agents, artefacts, and
// the files it couldn't use. Choosing a skill, agent or artefact opens it.
export function RegistryTabs({ registry, onOpen }: { registry: Registry; onOpen: (path: string) => void }) {
  const [tab, setTab] = useState(0);
  return (
    <Stack spacing={2}>
      {registry.warnings.length > 0 && (
        <Alert severity="warning">
          {registry.warnings.length} file(s) couldn't be used:
          <List dense>
            {registry.warnings.map((w) => (
              <ListItem key={`${w.path}-${w.message}`} disablePadding>
                <ListItemText primary={w.path} secondary={w.message} />
              </ListItem>
            ))}
          </List>
        </Alert>
      )}
      <Tabs value={tab} onChange={(_, value: number) => setTab(value)}>
        <Tab label={`Skills (${registry.skills.length})`} />
        <Tab label={`Agents (${registry.agents.length})`} />
        <Tab label={`Artefacts (${registry.artefacts.length})`} />
      </Tabs>
      <Box role="tabpanel">
        {tab === 0 && (
          <List>
            {registry.skills.map((s) => (
              <ListItemButton key={s.name} divider onClick={() => onOpen(s.path)}>
                <ListItemText primary={s.name} secondary={`${s.description} · ${s.path}`} />
              </ListItemButton>
            ))}
          </List>
        )}
        {tab === 1 && (
          <List>
            {registry.agents.map((a) => (
              <ListItemButton key={a.name} divider onClick={() => onOpen(a.path)}>
                <ListItemText primary={a.model ? `${a.name} (model: ${a.model})` : a.name} secondary={`${a.description} · ${a.path}`} />
              </ListItemButton>
            ))}
          </List>
        )}
        {tab === 2 && (
          <List>
            {registry.artefacts.length === 0 && <Typography color="text.secondary">No artefacts yet.</Typography>}
            {registry.artefacts.map((a) => (
              <ListItemButton key={a.path} divider onClick={() => onOpen(a.path)}>
                <ListItemText primary={a.path} secondary={kB(a.size)} />
              </ListItemButton>
            ))}
          </List>
        )}
      </Box>
    </Stack>
  );
}
