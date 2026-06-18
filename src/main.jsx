import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Download, FileText, Plus, Trash2 } from "lucide-react";
import "./styles.css";

const TYPES = [
  {
    id: "scene-title",
    label: "Scene Title",
    next: "scene-description",
    placeholder: "INT. COFFEE SHOP - NIGHT",
  },
  {
    id: "scene-description",
    label: "Scene Description",
    next: "character",
    placeholder: "Rain needles against the windows.",
  },
  {
    id: "character",
    label: "Character",
    next: "dialogue",
    placeholder: "MAYA",
  },
  {
    id: "dialogue",
    label: "Dialogue",
    next: "parenthetical",
    placeholder: "I thought you were done with impossible things.",
  },
  {
    id: "parenthetical",
    label: "Parenthetical",
    next: "dialogue",
    placeholder: "quietly",
  },
];

const TYPE_BY_ID = Object.fromEntries(TYPES.map((type) => [type.id, type]));
const STORAGE_KEY = "sketchy-script-editor-v1";

const initialLines = [
  { id: crypto.randomUUID(), type: "scene-title", text: "INT. WRITER'S ROOM - NIGHT" },
  {
    id: crypto.randomUUID(),
    type: "scene-description",
    text: "A blank page glows on an old laptop. Coffee cools beside it.",
  },
  { id: crypto.randomUUID(), type: "character", text: "TONI" },
  { id: crypto.randomUUID(), type: "dialogue", text: "Okay. Let's make this feel like a real script." },
];

function normalizeText(type, text) {
  if (type === "scene-title" || type === "character") return text.toUpperCase();
  if (type === "parenthetical") return text.replace(/^\(+|\)+$/g, "");
  return text;
}

function displayText(line) {
  const normalized = normalizeText(line.type, line.text);
  if (line.type === "parenthetical" && normalized.trim()) return `(${normalized})`;
  return normalized;
}

function App() {
  const [title, setTitle] = useState("Untitled Screenplay");
  const [lines, setLines] = useState(initialLines);
  const [activeId, setActiveId] = useState(initialLines[0].id);
  const inputRefs = useRef({});

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved);
      if (parsed.title) setTitle(parsed.title);
      if (Array.isArray(parsed.lines) && parsed.lines.length) {
        setLines(parsed.lines);
        setActiveId(parsed.lines[0].id);
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ title, lines }));
  }, [title, lines]);

  useEffect(() => {
    inputRefs.current[activeId]?.focus();
  }, [activeId, lines.length]);

  const activeLine = useMemo(
    () => lines.find((line) => line.id === activeId) ?? lines[0],
    [activeId, lines],
  );

  function updateLine(id, patch) {
    setLines((current) =>
      current.map((line) => {
        if (line.id !== id) return line;
        const next = { ...line, ...patch };
        return { ...next, text: normalizeText(next.type, next.text) };
      }),
    );
  }

  function addLine(afterId, forcedType) {
    setLines((current) => {
      const index = current.findIndex((line) => line.id === afterId);
      const currentLine = current[index] ?? current[current.length - 1];
      const type = forcedType ?? TYPE_BY_ID[currentLine.type].next;
      const newLine = { id: crypto.randomUUID(), type, text: "" };
      const next = [...current];
      next.splice(index + 1, 0, newLine);
      setActiveId(newLine.id);
      return next;
    });
  }

  function removeLine(id) {
    if (lines.length === 1) return;
    setLines((current) => {
      const index = current.findIndex((line) => line.id === id);
      const next = current.filter((line) => line.id !== id);
      setActiveId(next[Math.max(0, index - 1)].id);
      return next;
    });
  }

  function cycleType(line) {
    const nextType = TYPE_BY_ID[line.type].next;
    updateLine(line.id, { type: nextType });
  }

  function handleKeyDown(event, line) {
    if (event.key === "Tab") {
      event.preventDefault();
      cycleType(line);
    }
    if (event.key === "Enter") {
      event.preventDefault();
      addLine(line.id);
    }
    if (event.key === "Backspace" && !line.text && lines.length > 1) {
      event.preventDefault();
      removeLine(line.id);
    }
  }

  function downloadPdf() {
    document.title = `${title || "screenplay"}.pdf`;
    window.print();
    document.title = "Script Editor";
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <FileText size={22} aria-hidden="true" />
          <div>
            <strong>Sketchy Draft</strong>
            <span>Screenplay editor</span>
          </div>
        </div>

        <label className="field-label" htmlFor="script-title">
          Title
        </label>
        <input
          id="script-title"
          className="title-input"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />

        <label className="field-label" htmlFor="line-type">
          Current Line
        </label>
        <select
          id="line-type"
          className="type-select"
          value={activeLine?.type ?? "scene-description"}
          onChange={(event) => updateLine(activeLine.id, { type: event.target.value })}
        >
          {TYPES.map((type) => (
            <option key={type.id} value={type.id}>
              {type.label}
            </option>
          ))}
        </select>

        <button className="primary-button" onClick={downloadPdf}>
          <Download size={18} aria-hidden="true" />
          Download PDF
        </button>

        <div className="note">
          Auto-saved in this browser. A database becomes useful for multiple scripts, sync,
          collaboration, accounts, backups, or cross-device access.
        </div>
      </aside>

      <section className="desk">
        <div className="page" aria-label="Screenplay page">
          <input
            className="screenplay-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            aria-label="Screenplay title"
          />

          <div className="script-lines">
            {lines.map((line) => (
              <div
                className={`script-line ${line.type} ${line.id === activeId ? "is-active" : ""}`}
                key={line.id}
                onFocus={() => setActiveId(line.id)}
              >
                <textarea
                  ref={(element) => {
                    inputRefs.current[line.id] = element;
                    if (element) {
                      element.style.height = "0px";
                      element.style.height = `${element.scrollHeight}px`;
                    }
                  }}
                  value={displayText(line)}
                  placeholder={TYPE_BY_ID[line.type].placeholder}
                  onChange={(event) => updateLine(line.id, { text: event.target.value })}
                  onKeyDown={(event) => handleKeyDown(event, line)}
                  rows={1}
                  aria-label={TYPE_BY_ID[line.type].label}
                />
                <button
                  className="line-action add"
                  onClick={() => addLine(line.id)}
                  title="Add line"
                  aria-label="Add line"
                >
                  <Plus size={14} aria-hidden="true" />
                </button>
                <button
                  className="line-action remove"
                  onClick={() => removeLine(line.id)}
                  title="Delete line"
                  aria-label="Delete line"
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
