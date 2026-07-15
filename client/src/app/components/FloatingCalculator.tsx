import React, { useState, useEffect, useRef, useMemo } from "react";
import { 
  Calculator, X, Minus, RotateCcw, Copy, 
  Trash2, History, ClipboardList, Check, HelpCircle
} from "lucide-react";
import { toast } from "react-hot-toast";

// Types
interface HistoryItem {
  id: string;
  expression: string;
  result: string;
  note: string;
}

interface LineResult {
  text: string;
  result: number | null;
  error: boolean;
}

// Scratchpad Parsing Function
function parseScratchpad(text: string): { lines: LineResult[]; total: number } {
  const lines = text.split("\n");
  const symbolMap: Record<string, number> = {};
  const lineResults: LineResult[] = [];
  let grandTotal = 0;

  for (let line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      lineResults.push({ text: line, result: null, error: false });
      continue;
    }

    // Strip comments starting with // or #
    let cleanLine = trimmed.split(/\/\/|#/)[0].trim();
    if (!cleanLine) {
      lineResults.push({ text: line, result: null, error: false });
      continue;
    }

    // Check for assignment: variable = expression or variable: expression
    // e.g. salary = 5000, rent: 1200
    let varName: string | null = null;
    let exprStr = cleanLine;

    const assignMatch = cleanLine.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*[=:]\s*(.+)$/);
    if (assignMatch) {
      varName = assignMatch[1];
      exprStr = assignMatch[2];
    }

    // Replace variables in expression with their numeric values
    let evalStr = exprStr;
    const sortedVars = Object.keys(symbolMap).sort((a, b) => b.length - a.length);
    for (const v of sortedVars) {
      const escaped = v.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const regex = new RegExp(`\\b${escaped}\\b`, 'g');
      evalStr = evalStr.replace(regex, String(symbolMap[v]));
    }

    // Sanitization: Allow only numbers, operators, decimals, spaces, and brackets.
    // Characters allowed: 0-9, +, -, *, /, %, (, ), ., space
    const sanitized = evalStr.replace(/[^0-9+\-*/%().\s]/g, "");

    // If there are no numbers in the sanitized string, it's not a mathematical expression
    if (!/[0-9]/.test(sanitized)) {
      lineResults.push({ text: line, result: null, error: false });
      continue;
    }

    try {
      // Evaluate using safe Function constructor
      const val = new Function(`return (${sanitized});`)();
      if (typeof val === "number" && !isNaN(val) && isFinite(val)) {
        const rounded = Math.round(val * 100) / 100;
        if (varName) {
          symbolMap[varName] = rounded;
        }
        lineResults.push({ text: line, result: rounded, error: false });
        grandTotal += rounded;
      } else {
        lineResults.push({ text: line, result: null, error: false });
      }
    } catch (err) {
      if (varName || /[+\-*/%]/.test(sanitized)) {
        lineResults.push({ text: line, result: null, error: true });
      } else {
        lineResults.push({ text: line, result: null, error: false });
      }
    }
  }

  return { lines: lineResults, total: Math.round(grandTotal * 100) / 100 };
}

// Evaluate visual math string helper
function evaluateMath(expr: string): string {
  let sanitized = expr
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/[^0-9+\-*/%().\s]/g, "");

  if (!sanitized.trim()) return "0";

  try {
    const val = new Function(`return (${sanitized});`)();
    if (typeof val === "number" && !isNaN(val) && isFinite(val)) {
      return String(Math.round(val * 100000000) / 100000000);
    }
    return "Error";
  } catch (e) {
    return "Error";
  }
}

export default function FloatingCalculator() {
  // State variables
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [showSidePanel, setShowSidePanel] = useState(true);
  const [activeTab, setActiveTab] = useState<"history" | "scratchpad">("history");
  
  // Calculator values
  const [expression, setExpression] = useState("");
  const [displayValue, setDisplayValue] = useState("0");
  const [isNewCalculation, setIsNewCalculation] = useState(true);

  // History state
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    const saved = localStorage.getItem("calc-history");
    return saved ? JSON.parse(saved) : [];
  });
  const [editingHistoryId, setEditingHistoryId] = useState<string | null>(null);
  const [editExprValue, setEditExprValue] = useState("");

  // Scratchpad state
  const [scratchpadText, setScratchpadText] = useState<string>(() => {
    const saved = localStorage.getItem("calc-scratchpad");
    return saved || `// Live Scratchpad - Type your math here\n// Assign variables like rent = 1200\n\nRent: 1200\nElectricity: 145.50\nWater: 32\n\nSubtotal = Rent + Electricity + Water\nTax = Subtotal * 0.18\n\nTotal = Subtotal + Tax`;
  });

  // Reference for dragging
  const windowRef = useRef<HTMLDivElement>(null);
  const scratchpadTextareaRef = useRef<HTMLTextAreaElement>(null);
  const scratchpadResultsRef = useRef<HTMLDivElement>(null);

  // Position state (persist in localStorage)
  const [position, setPosition] = useState(() => {
    const saved = localStorage.getItem("calc-position");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (typeof parsed.x === "number" && typeof parsed.y === "number") {
          return parsed;
        }
      } catch (e) {}
    }
    // Default position
    return { x: window.innerWidth - 380, y: window.innerHeight - 520 };
  });

  // Size state (persist in localStorage)
  const [size, setSize] = useState(() => {
    const saved = localStorage.getItem("calc-size");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (typeof parsed.width === "number" && typeof parsed.height === "number") {
          return parsed;
        }
      } catch (e) {}
    }
    return { width: 660, height: 460 };
  });

  // Save history and scratchpad updates
  useEffect(() => {
    localStorage.setItem("calc-history", JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    localStorage.setItem("calc-scratchpad", scratchpadText);
  }, [scratchpadText]);

  // Sync scroll between scratchpad textarea and results list
  const handleScratchpadScroll = () => {
    if (scratchpadTextareaRef.current && scratchpadResultsRef.current) {
      scratchpadResultsRef.current.scrollTop = scratchpadTextareaRef.current.scrollTop;
    }
  };

  // Keyboard shortcut Alt + C to toggle open
  useEffect(() => {
    const handleToggleShortcut = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === "c" || e.key === "C" || e.key === "ç" || e.key === "Ç")) {
        e.preventDefault();
        setIsOpen((prev) => !prev);
        setIsMinimized(false);
      }
    };

    const handleCustomToggle = () => {
      setIsOpen((prev) => !prev);
      setIsMinimized(false);
    };

    window.addEventListener("keydown", handleToggleShortcut);
    window.addEventListener("toggle-calculator", handleCustomToggle);
    return () => {
      window.removeEventListener("keydown", handleToggleShortcut);
      window.removeEventListener("toggle-calculator", handleCustomToggle);
    };
  }, []);

  // Sync calculated scratchpad lines
  const parsedScratchpad = useMemo(() => {
    return parseScratchpad(scratchpadText);
  }, [scratchpadText]);

  // Handle calculator keypad clicks
  const handleInput = (char: string) => {
    if (isNewCalculation) {
      if (/[0-9(]/.test(char)) {
        setDisplayValue(char);
        setExpression(char);
      } else if (["+", "-", "*", "/", "×", "÷"].includes(char)) {
        // Continue calculating on previous result
        setExpression(displayValue + " " + char + " ");
        setDisplayValue("0");
      } else if (char === ".") {
        setDisplayValue("0.");
        setExpression("0.");
      }
      setIsNewCalculation(false);
      return;
    }

    // Append char
    if (["+", "-", "*", "/", "×", "÷"].includes(char)) {
      setExpression((prev) => prev + " " + char + " ");
      setDisplayValue("0");
    } else {
      setExpression((prev) => {
        const lastChar = prev.slice(-1);
        if (char === "." && lastChar === ".") return prev;
        return prev + char;
      });
      setDisplayValue((prev) => {
        if (prev === "0" && char !== ".") return char;
        if (char === "." && prev.includes(".")) return prev;
        return prev + char;
      });
    }
  };

  // Handle backspace 
  const handleBackspace = () => {
    if (isNewCalculation || expression.length <= 1) {
      handleClear();
      return;
    }

    setExpression((prev) => {
      // Check if we are removing a space-wrapped operator
      if (prev.endsWith(" ")) {
        return prev.slice(0, -3);
      }
      return prev.slice(0, -1);
    });

    setDisplayValue((prev) => {
      if (prev.length <= 1 || prev === "0") return "0";
      return prev.slice(0, -1);
    });
  };

  // Negate input +/-
  const handleNegate = () => {
    if (displayValue === "0") return;
    if (displayValue.startsWith("-")) {
      setDisplayValue(displayValue.slice(1));
      setExpression((prev) => prev.slice(0, -displayValue.length) + displayValue.slice(1));
    } else {
      setDisplayValue("-" + displayValue);
      setExpression((prev) => prev.slice(0, -displayValue.length) + "-" + displayValue);
    }
  };

  // Clear active input
  const handleClear = () => {
    setDisplayValue("0");
    setExpression("");
    setIsNewCalculation(true);
  };

  // Calculate percentage
  const handlePercent = () => {
    if (displayValue === "0") return;
    try {
      const val = parseFloat(displayValue) / 100;
      setDisplayValue(String(val));
      setExpression((prev) => prev.slice(0, -displayValue.length) + String(val));
    } catch (e) {}
  };

  // Evaluate formula
  const handleEvaluate = () => {
    if (!expression.trim()) return;
    const finalExpr = expression.replace(/×/g, "*").replace(/÷/g, "/");
    const result = evaluateMath(finalExpr);

    if (result !== "Error") {
      const newItem: HistoryItem = {
        id: Date.now().toString(),
        expression: expression,
        result: result,
        note: ""
      };
      setHistory((prev) => [newItem, ...prev]);
      setDisplayValue(result);
      setExpression(result);
      setIsNewCalculation(true);
    } else {
      setDisplayValue("Error");
      setIsNewCalculation(true);
    }
  };

  // Keyboard listeners when focused on calculator window (and not in an input/textarea)
  useEffect(() => {
    if (!isOpen || isMinimized) return;

    const handleKeyboardInput = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
        return;
      }

      const key = e.key;

      if (/^[0-9]$/.test(key)) {
        e.preventDefault();
        handleInput(key);
      } else if (key === ".") {
        e.preventDefault();
        handleInput(".");
      } else if (key === "+") {
        e.preventDefault();
        handleInput("+");
      } else if (key === "-") {
        e.preventDefault();
        handleInput("-");
      } else if (key === "*") {
        e.preventDefault();
        handleInput("×");
      } else if (key === "/") {
        e.preventDefault();
        handleInput("÷");
      } else if (key === "(" || key === ")") {
        e.preventDefault();
        handleInput(key);
      } else if (key === "Enter" || key === "=") {
        e.preventDefault();
        handleEvaluate();
      } else if (key === "Backspace") {
        e.preventDefault();
        handleBackspace();
      } else if (key === "Escape") {
        e.preventDefault();
        handleClear();
      } else if (key === "%") {
        e.preventDefault();
        handlePercent();
      }
    };

    window.addEventListener("keydown", handleKeyboardInput);
    return () => window.removeEventListener("keydown", handleKeyboardInput);
  }, [isOpen, isMinimized, expression, displayValue, isNewCalculation]);

  // Drag-and-drop window handler
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return; // Only left click
    if ((e.target as HTMLElement).closest("button") || (e.target as HTMLElement).closest("input") || (e.target as HTMLElement).closest("textarea")) {
      return; // Do not drag on interactions
    }

    e.preventDefault();
    const startX = e.clientX - position.x;
    const startY = e.clientY - position.y;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      let newX = moveEvent.clientX - startX;
      let newY = moveEvent.clientY - startY;

      const width = showSidePanel ? size.width : 340;
      const height = isMinimized ? 48 : size.height;

      // Restrict within screen bounds
      newX = Math.max(0, Math.min(newX, window.innerWidth - width));
      newY = Math.max(0, Math.min(newY, window.innerHeight - height));

      const newPos = { x: newX, y: newY };
      setPosition(newPos);
      localStorage.setItem("calc-position", JSON.stringify(newPos));
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  // Window resize handler
  const handleResizeMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const startWidth = size.width;
    const startHeight = size.height;
    const startMouseX = e.clientX;
    const startMouseY = e.clientY;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startMouseX;
      const deltaY = moveEvent.clientY - startMouseY;

      const minWidth = showSidePanel ? 600 : 340;
      const maxWidth = window.innerWidth - position.x - 20;
      const minHeight = 380;
      const maxHeight = window.innerHeight - position.y - 20;

      const newWidth = Math.max(minWidth, Math.min(startWidth + deltaX, maxWidth));
      const newHeight = Math.max(minHeight, Math.min(startHeight + deltaY, maxHeight));

      const newSize = { width: newWidth, height: newHeight };
      setSize(newSize);
      localStorage.setItem("calc-size", JSON.stringify(newSize));
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  // Copy display value to clipboard
  const handleCopyDisplay = () => {
    navigator.clipboard.writeText(displayValue);
    toast.success("Result copied to clipboard!", { id: "calc-toast" });
  };

  // Inline edit history item
  const startEditHistory = (item: HistoryItem) => {
    setEditingHistoryId(item.id);
    setEditExprValue(item.expression);
  };

  const saveEditHistory = (id: string) => {
    const updatedExpr = editExprValue.replace(/×/g, "*").replace(/÷/g, "/");
    const result = evaluateMath(updatedExpr);

    setHistory((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, expression: editExprValue, result: result !== "Error" ? result : item.result }
          : item
      )
    );
    setEditingHistoryId(null);
    toast.success("History updated!", { id: "calc-toast" });
  };

  const handleUpdateNote = (id: string, note: string) => {
    setHistory((prev) =>
      prev.map((item) => (item.id === id ? { ...item, note } : item))
    );
  };

  // Load history result back into display
  const loadHistoryItem = (item: HistoryItem) => {
    setDisplayValue(item.result);
    setExpression(item.result);
    setIsNewCalculation(true);
    toast.success("Loaded value to calculator", { id: "calc-toast" });
  };

  // HTML Rendering
  return (
    <>
      {/* Floating Action Button (Manual Launcher) */}
      <button
        onClick={() => {
          setIsOpen((prev) => !prev);
          setIsMinimized(false);
        }}
        className={`fixed bottom-6 right-6 z-[9998] flex items-center justify-center p-3.5 bg-indigo-600 dark:bg-indigo-500 hover:bg-indigo-700 dark:hover:bg-indigo-600 active:scale-95 text-white rounded-full shadow-2xl transition-all duration-300 group hover:rotate-12 border border-white/20`}
        title="Toggle Calculator (Alt + C)"
      >
        <Calculator className="w-6 h-6" />
        <span className="absolute right-full mr-3 px-2 py-1 text-xs font-semibold bg-slate-900/90 text-white rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
          Calculator (Alt + C)
        </span>
      </button>

      {/* Main Drag-and-drop Window */}
      {isOpen && (
        <div
          ref={windowRef}
          style={{
            top: `${position.y}px`,
            left: `${position.x}px`,
            width: isMinimized ? "300px" : showSidePanel ? `${size.width}px` : "340px",
            height: isMinimized ? "48px" : `${size.height}px`
          }}
          className="fixed z-[9999] flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden font-sans select-none"
        >
          {/* Header (Drag area) */}
          <div
            onMouseDown={handleMouseDown}
            className="flex items-center justify-between px-4 py-3 bg-slate-900 dark:bg-slate-950 text-white cursor-grab active:cursor-grabbing border-b border-slate-800"
          >
            <div className="flex items-center gap-2">
              <Calculator className="w-4 h-4 text-indigo-400" />
              <span className="text-xs font-semibold tracking-wide">
                Calculator {isMinimized ? "" : <span className="text-[10px] text-slate-400 font-normal"> (Alt + C to close)</span>}
              </span>
            </div>
            
            {/* Window control buttons */}
            <div className="flex items-center gap-1.5">
              {!isMinimized && (
                <button
                  onClick={() => setShowSidePanel((prev) => !prev)}
                  className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors"
                  title={showSidePanel ? "Collapse side panel" : "Expand side panel"}
                >
                  <ClipboardList className={`w-3.5 h-3.5 ${showSidePanel ? "text-indigo-400" : ""}`} />
                </button>
              )}
              <button
                onClick={() => setIsMinimized((prev) => !prev)}
                className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors"
                title={isMinimized ? "Restore" : "Minimize"}
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-md text-slate-400 hover:text-red-400 hover:bg-slate-800/80 transition-colors"
                title="Close"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Body */}
          {!isMinimized && (
            <div 
              style={{ height: `${size.height - 48}px` }}
              className="flex bg-slate-50 dark:bg-slate-950/20"
            >
              {/* Left Side: Traditional Calculator */}
              <div className="w-[340px] p-4 flex flex-col justify-between flex-shrink-0 bg-white dark:bg-slate-900">
                {/* Screen Display */}
                <div 
                  onClick={handleCopyDisplay}
                  className="group relative flex flex-col items-end justify-end bg-slate-950/90 dark:bg-slate-950/80 text-white px-4 py-3 h-24 select-text font-mono rounded-xl border border-slate-850 dark:border-slate-800 cursor-pointer shadow-inner"
                  title="Click to copy display"
                >
                  <div className="w-full text-right text-xs text-slate-450 dark:text-slate-505 truncate font-normal tracking-wide pr-1">
                    {expression || " "}
                  </div>
                  <div className="text-2xl font-semibold mt-1 tracking-tight select-all">
                    {displayValue}
                  </div>
                  {/* Hover Copy Overlay */}
                  <div className="absolute top-2 left-2 p-1 bg-slate-800 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                    <Copy className="w-3 h-3 text-slate-300" />
                  </div>
                </div>

                {/* Keyboard Layout */}
                <div className="grid grid-cols-4 gap-2 mt-3">
                  {/* Row 1 */}
                  <button
                    onClick={handleClear}
                    className="h-11 rounded-lg font-medium text-sm bg-slate-105 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 transition-all shadow-sm"
                  >
                    AC
                  </button>
                  <button
                    onClick={handleBackspace}
                    className="h-11 rounded-lg font-medium text-sm bg-slate-105 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 transition-all shadow-sm"
                  >
                    ⌫
                  </button>
                  <button
                    onClick={() => handleInput("(")}
                    className="h-11 rounded-lg font-medium text-sm bg-slate-105 dark:bg-slate-800 text-slate-750 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 transition-all shadow-sm"
                  >
                    (
                  </button>
                  <button
                    onClick={() => handleInput(")")}
                    className="h-11 rounded-lg font-medium text-sm bg-slate-105 dark:bg-slate-800 text-slate-750 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 transition-all shadow-sm"
                  >
                    )
                  </button>

                  {/* Row 2 */}
                  <button
                    onClick={() => handleInput("7")}
                    className="h-11 rounded-lg font-semibold text-base bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 transition-all shadow-sm"
                  >
                    7
                  </button>
                  <button
                    onClick={() => handleInput("8")}
                    className="h-11 rounded-lg font-semibold text-base bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 transition-all shadow-sm"
                  >
                    8
                  </button>
                  <button
                    onClick={() => handleInput("9")}
                    className="h-11 rounded-lg font-semibold text-base bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 transition-all shadow-sm"
                  >
                    9
                  </button>
                  <button
                    onClick={() => handleInput("÷")}
                    className="h-11 rounded-lg font-bold text-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 active:scale-95 transition-all shadow-sm"
                  >
                    ÷
                  </button>

                  {/* Row 3 */}
                  <button
                    onClick={() => handleInput("4")}
                    className="h-11 rounded-lg font-semibold text-base bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 transition-all shadow-sm"
                  >
                    4
                  </button>
                  <button
                    onClick={() => handleInput("5")}
                    className="h-11 rounded-lg font-semibold text-base bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 transition-all shadow-sm"
                  >
                    5
                  </button>
                  <button
                    onClick={() => handleInput("6")}
                    className="h-11 rounded-lg font-semibold text-base bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 transition-all shadow-sm"
                  >
                    6
                  </button>
                  <button
                    onClick={() => handleInput("×")}
                    className="h-11 rounded-lg font-bold text-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 active:scale-95 transition-all shadow-sm"
                  >
                    ×
                  </button>

                  {/* Row 4 */}
                  <button
                    onClick={() => handleInput("1")}
                    className="h-11 rounded-lg font-semibold text-base bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 transition-all shadow-sm"
                  >
                    1
                  </button>
                  <button
                    onClick={() => handleInput("2")}
                    className="h-11 rounded-lg font-semibold text-base bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 transition-all shadow-sm"
                  >
                    2
                  </button>
                  <button
                    onClick={() => handleInput("3")}
                    className="h-11 rounded-lg font-semibold text-base bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 transition-all shadow-sm"
                  >
                    3
                  </button>
                  <button
                    onClick={() => handleInput("-")}
                    className="h-11 rounded-lg font-bold text-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 active:scale-95 transition-all shadow-sm"
                  >
                    -
                  </button>

                  {/* Row 5 */}
                  <button
                    onClick={handleNegate}
                    className="h-11 rounded-lg font-medium text-sm bg-slate-105 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 transition-all shadow-sm"
                  >
                    ±
                  </button>
                  <button
                    onClick={() => handleInput("0")}
                    className="h-11 rounded-lg font-semibold text-base bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 transition-all shadow-sm"
                  >
                    0
                  </button>
                  <button
                    onClick={() => handleInput(".")}
                    className="h-11 rounded-lg font-semibold text-base bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 transition-all shadow-sm"
                  >
                    .
                  </button>
                  <button
                    onClick={() => handleInput("+")}
                    className="h-11 rounded-lg font-bold text-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 active:scale-95 transition-all shadow-sm"
                  >
                    +
                  </button>

                  {/* Evaluator Button spans 4 columns */}
                  <button
                    onClick={handleEvaluate}
                    className="col-span-4 h-12 mt-1 rounded-xl font-bold text-lg bg-emerald-600 dark:bg-emerald-550 text-white hover:bg-emerald-700 dark:hover:bg-emerald-600 active:scale-98 transition-all shadow-md flex items-center justify-center gap-1"
                  >
                    Evaluate =
                  </button>
                </div>
              </div>

              {/* Right Side: Tabbed Side Panel (History & Scratchpad) */}
              {showSidePanel && (
                <div 
                  style={{ width: `${size.width - 340}px` }}
                  className="border-l border-slate-200 dark:border-slate-800 flex flex-col bg-slate-50 dark:bg-slate-900/40 flex-shrink-0"
                >
                  {/* Tab Selector */}
                  <div className="flex border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1 gap-1">
                    <button
                      onClick={() => setActiveTab("history")}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-md transition-all ${
                        activeTab === "history"
                          ? "bg-slate-100 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm"
                          : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-350 hover:bg-slate-50 dark:hover:bg-slate-900/50"
                      }`}
                    >
                      <History className="w-3.5 h-3.5" />
                      History Tape
                    </button>
                    <button
                      onClick={() => setActiveTab("scratchpad")}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-md transition-all ${
                        activeTab === "scratchpad"
                          ? "bg-slate-100 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm"
                          : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-350 hover:bg-slate-50 dark:hover:bg-slate-900/50"
                      }`}
                    >
                      <ClipboardList className="w-3.5 h-3.5" />
                      Scratchpad
                    </button>
                  </div>

                  {/* History Content */}
                  {activeTab === "history" && (
                    <div className="flex-1 flex flex-col min-h-0">
                      <div className="flex-1 overflow-y-auto p-3 space-y-3">
                        {history.length === 0 ? (
                          <div className="flex flex-col items-center justify-center h-full text-slate-400 dark:text-slate-500 text-xs text-center p-4">
                            <History className="w-8 h-8 mb-2 stroke-[1.5]" />
                            <p>No calculations recorded yet</p>
                            <p className="text-[10px] mt-1">Press enter/equal to record results</p>
                          </div>
                        ) : (
                          history.map((item) => (
                            <div
                              key={item.id}
                              className="group relative bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow transition-all space-y-1.5"
                            >
                              {editingHistoryId === item.id ? (
                                // Inline edit expression mode
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="text"
                                    value={editExprValue}
                                    onChange={(e) => setEditExprValue(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") saveEditHistory(item.id);
                                      if (e.key === "Escape") setEditingHistoryId(null);
                                    }}
                                    className="flex-1 text-xs font-mono px-2 py-1 bg-slate-50 dark:bg-slate-950 border border-slate-250 dark:border-slate-800 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-900 dark:text-white"
                                    autoFocus
                                  />
                                  <button
                                    onClick={() => saveEditHistory(item.id)}
                                    className="p-1 bg-emerald-50 text-emerald-600 rounded hover:bg-emerald-100"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => setEditingHistoryId(null)}
                                    className="p-1 bg-slate-100 text-slate-500 rounded hover:bg-slate-200"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ) : (
                                // Default details view
                                <div className="flex justify-between items-start gap-2">
                                  <div 
                                    onClick={() => startEditHistory(item)}
                                    className="text-xs font-mono text-slate-500 dark:text-slate-400 hover:text-indigo-500 dark:hover:text-indigo-400 cursor-pointer flex-1 truncate"
                                    title="Double click to edit formula"
                                  >
                                    {item.expression}
                                  </div>
                                  <button
                                    onClick={() => loadHistoryItem(item)}
                                    className="text-xs font-bold font-mono text-slate-800 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                                    title="Insert value to calculator"
                                  >
                                    = {item.result}
                                  </button>
                                </div>
                              )}

                              {/* Label annotation */}
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="text"
                                  value={item.note}
                                  placeholder="Add label (e.g. rent, office...)"
                                  onChange={(e) => handleUpdateNote(item.id, e.target.value)}
                                  className="w-full text-[10px] px-1 bg-transparent border-0 border-b border-transparent hover:border-slate-200 dark:hover:border-slate-850 focus:border-indigo-400 focus:outline-none placeholder-slate-400 text-slate-600 dark:text-slate-350"
                                />
                                <button
                                  onClick={() => setHistory((prev) => prev.filter((i) => i.id !== item.id))}
                                  className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-red-500 rounded transition-opacity"
                                  title="Delete item"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                      
                      {/* Footer Actions */}
                      {history.length > 0 && (
                        <div className="p-2 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex justify-end">
                          <button
                            onClick={() => {
                              setHistory([]);
                              toast.success("History cleared", { id: "calc-toast" });
                            }}
                            className="flex items-center gap-1 py-1 px-2.5 text-[10px] font-semibold text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 rounded transition-colors"
                          >
                            <Trash2 className="w-3 h-3" />
                            Clear History
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Scratchpad Content */}
                  {activeTab === "scratchpad" && (
                    <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-slate-900">
                      {/* Split Editor */}
                      <div className="flex-1 flex min-h-0 relative">
                        {/* Textarea Input */}
                        <textarea
                          ref={scratchpadTextareaRef}
                          value={scratchpadText}
                          onChange={(e) => setScratchpadText(e.target.value)}
                          onScroll={handleScratchpadScroll}
                          placeholder="Type notes and equations..."
                          className="flex-1 p-3 font-mono text-xs leading-relaxed resize-none outline-none border-0 bg-slate-50/50 dark:bg-slate-950/10 text-slate-800 dark:text-slate-100 overflow-y-auto whitespace-pre pr-2"
                        />
                        
                        {/* Parallel evaluation column */}
                        <div
                          ref={scratchpadResultsRef}
                          className="w-[100px] border-l border-slate-100 dark:border-slate-850 p-3 font-mono text-xs leading-relaxed text-right bg-slate-100/30 dark:bg-slate-950/30 text-indigo-600 dark:text-indigo-400 overflow-hidden pointer-events-none select-text"
                        >
                          {parsedScratchpad.lines.map((l, i) => (
                            <div key={i} className="h-[18px] truncate leading-[18px]">
                              {l.error ? (
                                <span className="text-red-500 font-semibold" title="Evaluation error">Err</span>
                              ) : l.result !== null ? (
                                l.result.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })
                              ) : (
                                "\u00A0" // non-breaking space to preserve line height spacing
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Grand Total Footer */}
                      <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 flex justify-between items-center">
                        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Scratchpad Sum:</span>
                        <span className="text-sm font-bold font-mono text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 px-2 py-0.5 rounded border border-indigo-100 dark:border-indigo-900/50">
                          {parsedScratchpad.total.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Resize Handle */}
              <div
                onMouseDown={handleResizeMouseDown}
                className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize flex items-end justify-end p-0.5 z-[10000] select-none"
                title="Drag to resize"
              >
                <svg
                  width="8"
                  height="8"
                  viewBox="0 0 8 8"
                  className="text-slate-400 dark:text-slate-650 fill-current hover:text-indigo-500 transition-colors"
                >
                  <path d="M6 0 L8 0 L8 8 L0 8 L0 6 L4 6 L4 4 L6 4 Z" />
                </svg>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
