"use client";

import { useEffect } from "react";
import { useUI } from "@/context/UIContext";

export default function GlobalShortcuts() {
  const {
    closeWizard, closeCandidateDrawer, closeInterviewDrawer, closeReschedule,
    closeCancel, closeEscalation, closeNotifications, askSchelaExpanded, setAskSchelaExpanded,
    globalSearchOpen, closeGlobalSearch,
  } = useUI();

  useEffect(() => {
    function onKeydown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        // Global search and Ask Schela manage their own Escape listeners with priority;
        // still safe to call here since closing an already-closed panel is a no-op.
        if (globalSearchOpen) { closeGlobalSearch(); return; }
        if (askSchelaExpanded) { setAskSchelaExpanded(false); return; }
        closeWizard();
        closeCandidateDrawer();
        closeInterviewDrawer();
        closeReschedule();
        closeCancel();
        closeEscalation();
        closeNotifications();
      }
    }
    document.addEventListener("keydown", onKeydown);
    return () => document.removeEventListener("keydown", onKeydown);
  }, [
    closeWizard, closeCandidateDrawer, closeInterviewDrawer, closeReschedule,
    closeCancel, closeEscalation, closeNotifications, askSchelaExpanded, setAskSchelaExpanded,
    globalSearchOpen, closeGlobalSearch,
  ]);

  return null;
}
