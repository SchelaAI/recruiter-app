"use client";

import { useEffect, useRef, useState } from "react";
import { useUI } from "@/context/UIContext";

export default function CommandBar() {
  const inputRef = useRef<HTMLInputElement>(null);
  const { askSchelaExpanded, setAskSchelaExpanded, openAskSchelaWith } = useUI();
  const [value, setValue] = useState("");

  useEffect(() => {
    function onKeydown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKeydown);
    return () => document.removeEventListener("keydown", onKeydown);
  }, []);

  if (askSchelaExpanded) return null;

  function submit() {
    const q = value.trim();
    if (q) { openAskSchelaWith(q); setValue(""); }
    else setAskSchelaExpanded(true);
  }

  return (
    <div className="command-bar-wrap">
      <div className="command-bar">
        <span className="material-symbols-outlined">auto_awesome</span>
        <input
          ref={inputRef}
          type="text"
          placeholder="Ask Schela to find candidates, draft updates, or pull analytics..."
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => { if (!value) setAskSchelaExpanded(true); }}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
        />
        <span className="kbd-badge">⌘ J</span>
      </div>
    </div>
  );
}
