import { Box, useColorScheme } from "@mui/material";
import { Editor, type OnMount } from "@monaco-editor/react";
import { useEffect, useRef } from "react";

type Props = {
  value: string;
  language: string; // a Monaco language id, e.g. "markdown"
  label: string; // what screen readers call the editor
  onChange: (value: string) => void;
  onSave: () => void; // ⌘/Ctrl+S inside the editor
};

// A code editor (Monaco) for one file's text, in the app's light or dark mode,
// with word wrap. ⌘/Ctrl+S calls onSave instead of the browser's "save page".
export function CodeEditor({ value, language, label, onChange, onSave }: Props) {
  const { mode, systemMode } = useColorScheme();
  const dark = (mode === "system" ? systemMode : mode) === "dark";
  const save = useRef(onSave);
  useEffect(() => {
    save.current = onSave;
  }, [onSave]);

  const mount: OnMount = (editor, monaco) => {
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => save.current());
  };

  return (
    <Box sx={{ height: 560, border: 1, borderColor: "divider", borderRadius: 1, overflow: "hidden" }}>
      <Editor
        value={value}
        language={language}
        theme={dark ? "vs-dark" : "light"}
        onChange={(text) => onChange(text ?? "")}
        onMount={mount}
        options={{ ariaLabel: label, wordWrap: "on", minimap: { enabled: false }, scrollBeyondLastLine: false, fontSize: 13 }}
      />
    </Box>
  );
}
