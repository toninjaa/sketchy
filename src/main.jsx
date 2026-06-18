import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ClipboardPaste, Download, FileUp, FileText, Plus, Trash2 } from "lucide-react";
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
const FAVICON_VERSION = "5";

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

const sceneHeadingPattern =
  /^(INT|EXT|INT\.\/EXT|EXT\.\/INT|I\/E|EST|INT-EXT|EXT-INT)\.?\s+/i;
const transitionPattern = /^(CUT TO|FADE OUT|FADE IN|DISSOLVE TO|SMASH CUT TO|MATCH CUT TO):?$/i;
const FIRST_PAGE_CAPACITY = 41;
const PAGE_CAPACITY = 49;

function cleanStoredText(type, text) {
  if (type === "parenthetical") return text.replace(/^\(+|\)+$/g, "");
  return text;
}

function displayText(line) {
  const cleaned = cleanStoredText(line.type, line.text);
  if (line.type === "scene-title" || line.type === "character") return cleaned.toUpperCase();
  if (line.type === "parenthetical" && cleaned.trim()) return `(${cleaned})`;
  return cleaned;
}

function estimateLineUnits(line) {
  const textLength = Math.max(displayText(line).length, 1);
  const width = line.type === "dialogue" ? 42 : line.type === "parenthetical" ? 34 : 60;
  const wrappedRows = Math.max(1, Math.ceil(textLength / width));
  const spacing = line.type === "dialogue" ? 1.65 : 1;
  return wrappedRows + spacing;
}

function paginateLines(linesToPaginate) {
  const pages = [];
  let currentPage = [];
  let usedUnits = 0;
  let capacity = FIRST_PAGE_CAPACITY;

  for (const line of linesToPaginate) {
    const lineUnits = estimateLineUnits(line);
    if (currentPage.length > 0 && usedUnits + lineUnits > capacity) {
      pages.push(currentPage);
      currentPage = [];
      usedUnits = 0;
      capacity = PAGE_CAPACITY;
    }

    currentPage.push(line);
    usedUnits += lineUnits;
  }

  pages.push(currentPage);
  return pages;
}

function looksUppercase(text) {
  const letters = text.replace(/[^A-Za-z]/g, "");
  return letters.length > 0 && letters === letters.toUpperCase();
}

function classifyLine(text, previousType) {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (sceneHeadingPattern.test(trimmed)) return "scene-title";
  if (/^\(.+\)$/.test(trimmed)) return "parenthetical";
  if (previousType === "character" || previousType === "parenthetical") return "dialogue";
  if (transitionPattern.test(trimmed)) return "scene-title";
  if (looksUppercase(trimmed) && trimmed.length <= 32 && !/[.!?]$/.test(trimmed)) return "character";
  return "scene-description";
}

function parseScriptText(rawText) {
  const cleaned = rawText
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!cleaned) return [];

  const sourceLines = cleaned
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const parsed = [];
  for (const sourceLine of sourceLines) {
    const previousType = parsed.at(-1)?.type;
    const type = classifyLine(sourceLine, previousType);
    if (!type) continue;
    parsed.push({
      id: crypto.randomUUID(),
      type,
      text: cleanStoredText(type, sourceLine),
    });
  }

  return parsed;
}

async function extractPdfText(file) {
  const pdfjsLib = await import("pdfjs-dist");
  const pdfWorker = await import("pdfjs-dist/build/pdf.worker.mjs?url");
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker.default;

  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pages = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const items = content.items
      .filter((item) => item.str?.trim())
      .map((item) => ({
        text: item.str,
        x: Math.round(item.transform[4]),
        y: Math.round(item.transform[5]),
      }))
      .sort((a, b) => b.y - a.y || a.x - b.x);

    const rows = [];
    for (const item of items) {
      const row = rows.find((candidate) => Math.abs(candidate.y - item.y) < 4);
      if (row) row.items.push(item);
      else rows.push({ y: item.y, items: [item] });
    }

    pages.push(
      rows
        .map((row) =>
          row.items
            .sort((a, b) => a.x - b.x)
            .map((item) => item.text)
            .join(" ")
            .replace(/\s+/g, " ")
            .trim(),
        )
        .filter(Boolean)
        .join("\n"),
    );
  }

  return pages.join("\n\n");
}

function App() {
  const [title, setTitle] = useState("Untitled Screenplay");
  const [lines, setLines] = useState(initialLines);
  const [activeId, setActiveId] = useState(initialLines[0].id);
  const [importText, setImportText] = useState("");
  const [importMode, setImportMode] = useState("replace");
  const [importStatus, setImportStatus] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const inputRefs = useRef({});

  useEffect(() => {
    const faviconHref = `${import.meta.env.BASE_URL}favicon-32.png?v=${FAVICON_VERSION}`;
    document.querySelectorAll("link[rel~='icon'], link[rel='shortcut icon']").forEach((link) => {
      link.remove();
    });

    const favicon = document.createElement("link");
    favicon.rel = "icon";
    favicon.type = "image/png";
    favicon.sizes = "32x32";
    favicon.href = faviconHref;
    document.head.append(favicon);
  }, []);

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
  const pages = useMemo(() => paginateLines(lines), [lines]);

  function updateLine(id, patch) {
    setLines((current) =>
      current.map((line) => {
        if (line.id !== id) return line;
        const next = { ...line, ...patch };
        return { ...next, text: cleanStoredText(next.type, next.text) };
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

  function applyImportedText(rawText, label = "text") {
    const parsed = parseScriptText(rawText);
    if (!parsed.length) {
      setImportStatus(`No editable text found in that ${label}.`);
      return;
    }

    setLines((current) => (importMode === "append" ? [...current, ...parsed] : parsed));
    setActiveId(parsed[0].id);
    setImportText("");
    setImportStatus(`Imported ${parsed.length} editable lines from ${label}.`);
  }

  async function handleFileUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setImportStatus(`Reading ${file.name}...`);

    try {
      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      const rawText = isPdf ? await extractPdfText(file) : await file.text();
      applyImportedText(rawText, file.name);
    } catch (error) {
      setImportStatus(`Could not import ${file.name}. ${error.message}`);
    } finally {
      setIsImporting(false);
      event.target.value = "";
    }
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <FileText size={20} />
          </div>
          <div>
            <strong>Sketchy</strong>
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

        <div className="import-panel">
          <div className="panel-title">
            <ClipboardPaste size={17} aria-hidden="true" />
            Import Draft
          </div>

          <textarea
            className="paste-box"
            value={importText}
            onChange={(event) => setImportText(event.target.value)}
            placeholder="Paste script text here..."
            aria-label="Paste script text"
          />

          <div className="import-options" aria-label="Import mode">
            <label>
              <input
                type="radio"
                name="import-mode"
                value="replace"
                checked={importMode === "replace"}
                onChange={(event) => setImportMode(event.target.value)}
              />
              Replace
            </label>
            <label>
              <input
                type="radio"
                name="import-mode"
                value="append"
                checked={importMode === "append"}
                onChange={(event) => setImportMode(event.target.value)}
              />
              Append
            </label>
          </div>

          <button
            className="secondary-button"
            onClick={() => applyImportedText(importText, "pasted text")}
            disabled={!importText.trim() || isImporting}
          >
            <ClipboardPaste size={16} aria-hidden="true" />
            Parse Paste
          </button>

          <label className={`secondary-button file-button ${isImporting ? "is-disabled" : ""}`}>
            <FileUp size={16} aria-hidden="true" />
            Upload TXT/PDF
            <input
              type="file"
              accept=".txt,.text,.md,.fountain,.pdf,text/plain,application/pdf"
              onChange={handleFileUpload}
              disabled={isImporting}
            />
          </label>

          {importStatus && <div className="import-status">{importStatus}</div>}
        </div>

        <div className="note">
          Auto-saved in this browser. A database becomes useful for multiple scripts, sync,
          collaboration, accounts, backups, or cross-device access.
        </div>
      </aside>

      <section className="desk">
        <div className="page-stack" aria-label="Screenplay pages">
          {pages.map((pageLines, pageIndex) => (
            <div className="page" key={`page-${pageIndex}`} aria-label={`Screenplay page ${pageIndex + 1}`}>
              {pageIndex > 0 && <div className="page-number">{pageIndex + 1}.</div>}

              {pageIndex === 0 && (
                <input
                  className="screenplay-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  aria-label="Screenplay title"
                />
              )}

              <div className="script-lines">
                {pageLines.map((line) => (
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
          ))}
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
