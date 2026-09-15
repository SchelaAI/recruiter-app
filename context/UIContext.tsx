"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import type { Interview, Organization, Interviewer } from "@/lib/types";

interface UIContextType {
  wizardOpen: boolean;
  openWizard: () => void;
  openWizardWithCandidate: (id: string, name: string) => void;
  wizardPrefillCandidate: { id: string; name: string } | null;
  consumeWizardPrefill: () => void;
  closeWizard: () => void;

  addCandidateOpen: boolean;
  openAddCandidate: () => void;
  closeAddCandidate: () => void;

  candidatesVersion: number;
  bumpCandidatesVersion: () => void;

  candidateDrawerId: string | null;
  openCandidateDrawer: (id: string) => void;
  closeCandidateDrawer: () => void;

  interviewDrawerId: number | null;
  selectedInterview: Interview | null;
  openInterviewDrawer: (id: number) => void;
  closeInterviewDrawer: () => void;
  refreshInterviews: () => Promise<void>;

  rescheduleOpen: boolean;
  openReschedule: () => void;
  closeReschedule: () => void;

  cancelOpen: boolean;
  openCancel: () => void;
  closeCancel: () => void;

  escalationConvId: string | null;
  openEscalation: (id: string) => void;
  closeEscalation: () => void;

  notificationsOpen: boolean;
  toggleNotifications: () => void;
  closeNotifications: () => void;

  askSchelaExpanded: boolean;
  setAskSchelaExpanded: (v: boolean) => void;
  askSchelaSeed: string | null;
  openAskSchelaWith: (query: string) => void;
  consumeAskSchelaSeed: () => void;

  globalSearchOpen: boolean;
  openGlobalSearch: () => void;
  closeGlobalSearch: () => void;

  sidebarOpen: boolean;
  toggleSidebar: (open: boolean) => void;

  organization: Organization | null;
  refreshOrganization: () => Promise<void>;

  interviewers: Interviewer[];
  refreshInterviewers: () => Promise<void>;
}

const UIContext = createContext<UIContextType | null>(null);

export function UIProvider({ children }: { children: ReactNode }) {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardPrefillCandidate, setWizardPrefillCandidate] = useState<{ id: string; name: string } | null>(null);
  const [addCandidateOpen, setAddCandidateOpen] = useState(false);
  const [candidatesVersion, setCandidatesVersion] = useState(0);
  const [candidateDrawerId, setCandidateDrawerId] = useState<string | null>(null);
  const [interviewDrawerId, setInterviewDrawerId] = useState<number | null>(null);
  const [interviewsCache, setInterviewsCache] = useState<Interview[]>([]);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [escalationConvId, setEscalationConvId] = useState<string | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [askSchelaExpanded, setAskSchelaExpanded] = useState(false);
  const [askSchelaSeed, setAskSchelaSeed] = useState<string | null>(null);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [interviewers, setInterviewers] = useState<Interviewer[]>([]);

  const refreshInterviews = useCallback(async () => {
    try {
      const res = await fetch("/api/interviews");
      const data = await res.json();
      setInterviewsCache(data.interviews);
    } catch {
      // Network unavailable — keep the existing cache rather than breaking the UI.
    }
  }, []);

  const refreshOrganization = useCallback(async () => {
    try {
      const res = await fetch("/api/organization");
      const data = await res.json();
      if (data.organization) setOrganization(data.organization);
    } catch {
      // Keep whatever we already have.
    }
  }, []);

  const refreshInterviewers = useCallback(async () => {
    try {
      const res = await fetch("/api/interviewers");
      const data = await res.json();
      setInterviewers(data.interviewers ?? []);
    } catch {
      // Keep whatever we already have.
    }
  }, []);

  useEffect(() => {
    if (interviewDrawerId !== null) refreshInterviews();
  }, [interviewDrawerId, refreshInterviews]);

  // Load the hiring-company identity + team once for the whole dashboard —
  // every candidate-facing surface reads the company name from here.
  useEffect(() => {
    refreshOrganization();
    refreshInterviewers();
  }, [refreshOrganization, refreshInterviewers]);

  const selectedInterview = interviewsCache.find((i) => i.id === interviewDrawerId) ?? null;

  const value: UIContextType = {
    wizardOpen,
    openWizard: () => setWizardOpen(true),
    openWizardWithCandidate: (id, name) => { setWizardPrefillCandidate({ id, name }); setWizardOpen(true); },
    wizardPrefillCandidate,
    consumeWizardPrefill: () => setWizardPrefillCandidate(null),
    closeWizard: () => setWizardOpen(false),

    addCandidateOpen,
    openAddCandidate: () => setAddCandidateOpen(true),
    closeAddCandidate: () => setAddCandidateOpen(false),

    candidatesVersion,
    bumpCandidatesVersion: () => setCandidatesVersion((v) => v + 1),

    candidateDrawerId,
    openCandidateDrawer: (id) => setCandidateDrawerId(id),
    closeCandidateDrawer: () => setCandidateDrawerId(null),

    interviewDrawerId,
    selectedInterview,
    openInterviewDrawer: (id) => setInterviewDrawerId(id),
    closeInterviewDrawer: () => setInterviewDrawerId(null),
    refreshInterviews,

    rescheduleOpen,
    openReschedule: () => setRescheduleOpen(true),
    closeReschedule: () => setRescheduleOpen(false),

    cancelOpen,
    openCancel: () => setCancelOpen(true),
    closeCancel: () => setCancelOpen(false),

    escalationConvId,
    openEscalation: (id) => { setEscalationConvId(id); setNotificationsOpen(false); },
    closeEscalation: () => setEscalationConvId(null),

    notificationsOpen,
    toggleNotifications: () => setNotificationsOpen((v) => !v),
    closeNotifications: () => setNotificationsOpen(false),

    askSchelaExpanded,
    setAskSchelaExpanded,
    askSchelaSeed,
    openAskSchelaWith: (query) => { setAskSchelaSeed(query); setAskSchelaExpanded(true); },
    consumeAskSchelaSeed: () => setAskSchelaSeed(null),

    globalSearchOpen,
    openGlobalSearch: () => setGlobalSearchOpen(true),
    closeGlobalSearch: () => setGlobalSearchOpen(false),

    sidebarOpen,
    toggleSidebar: (open) => setSidebarOpen(open),

    organization,
    refreshOrganization,

    interviewers,
    refreshInterviewers,
  };

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export function useUI() {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error("useUI must be used within a UIProvider");
  return ctx;
}
