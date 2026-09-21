"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

export function ConversationRealtime({
  conversationId,
  interviewId,
}: {
  conversationId: string;
  interviewId?: number | null;
}) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let pendingWhileHidden = false;

    const refresh = () => {
      if (document.visibilityState !== "visible") {
        pendingWhileHidden = true;
        return;
      }
      if (refreshTimer) clearTimeout(refreshTimer);
      // Provider delivery/read events often arrive in small bursts. Batch them into
      // one RSC refresh instead of refetching the entire thread for every event.
      refreshTimer = setTimeout(() => router.refresh(), 350);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible" && pendingWhileHidden) {
        pendingWhileHidden = false;
        refresh();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    const channel = supabase
      .channel(`schela-thread:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        refresh,
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "conversations",
          filter: `id=eq.${conversationId}`,
        },
        refresh,
      );

    if (interviewId) {
      channel.on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "interviews",
          filter: `id=eq.${interviewId}`,
        },
        refresh,
      );
    }

    channel.subscribe();

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (refreshTimer) clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [conversationId, interviewId, router]);

  return null;
}
