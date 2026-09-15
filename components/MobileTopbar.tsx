"use client";

import { useUI } from "@/context/UIContext";

export default function MobileTopbar() {
  const { toggleSidebar } = useUI();
  return (
    <div className="mobile-topbar">
      <span className="material-symbols-outlined" onClick={() => toggleSidebar(true)}>
        menu
      </span>
      <div className="logo-text" style={{ fontSize: "17px" }}>
        Schela
      </div>
    </div>
  );
}
