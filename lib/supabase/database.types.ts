// Hand-authored to match supabase/migrations/0001_init.sql exactly.
// Once the project is live, regenerate with:
//   npx supabase gen types typescript --project-id <ref> > lib/supabase/database.types.ts
// and this file becomes redundant — safe to overwrite.

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: { id: string; name: string; website: string | null; powered_by_schela: boolean; wa_template_name: string | null; wa_template_language: string; created_at: string; updated_at: string };
        Insert: { id?: string; name: string; website?: string | null; powered_by_schela?: boolean; wa_template_name?: string | null; wa_template_language?: string; created_at?: string; updated_at?: string };
        Update: { id?: string; name?: string; website?: string | null; powered_by_schela?: boolean; wa_template_name?: string | null; wa_template_language?: string; created_at?: string; updated_at?: string };
        Relationships: [];
      };
      interviewers: {
        Row: {
          id: string;
          org_id: string;
          name: string;
          role: string | null;
          email: string | null;
          availability: "available" | "busy" | "away";
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["interviewers"]["Row"]> & { org_id: string; name: string };
        Update: Partial<Database["public"]["Tables"]["interviewers"]["Row"]>;
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          org_id: string | null;
          full_name: string;
          email: string;
          phone: string | null;
          avatar_url: string | null;
          onboarding_role: string | null;
          company: string | null;
          team_size: string | null;
          channel_preference: string | null;
          onboarding_completed: boolean;
          ai_confidence_threshold: number;
          ai_auto_execute: boolean;
          ai_log_decisions: boolean;
          scheduling_duration: string;
          scheduling_buffer_min: number;
          scheduling_reschedule_limit: number;
          working_hours_start: string;
          working_hours_end: string;
          notif_new_reply: boolean;
          notif_confirmed: boolean;
          notif_reminders: boolean;
          notif_weekly_digest: boolean;
          email_from_name: string | null;
          email_from_address: string | null;
          email_reply_to: string | null;
          email_signature: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["profiles"]["Row"]> & { id: string; email: string };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Row"]>;
        Relationships: [];
      };
      candidates: {
        Row: {
          id: string;
          org_id: string;
          name: string;
          job_position: string | null;
          country_code: string;
          phone: string;
          email: string;
          preferred_channel: "wa" | "em" | null;
          time_zone: string | null;
          notes: string | null;
          ai_state: string;
          score: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["candidates"]["Row"]> & {
          id: string; org_id: string; name: string; country_code: string; phone: string; email: string;
        };
        Update: Partial<Database["public"]["Tables"]["candidates"]["Row"]>;
        Relationships: [];
      };
      interviews: {
        Row: {
          id: number;
          org_id: string;
          candidate_id: string;
          scheduled_at: string;
          duration_minutes: number;
          format: string;
          channel: "wa" | "em";
          ai_state: string;
          interviewer: string;
          handled_by: "ai" | "you";
          meeting_link: string | null;
          calendar_event_id: string | null;
          reminder_24h_sent_at: string | null;
          reminder_1h_sent_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["interviews"]["Row"]> & {
          org_id: string; candidate_id: string; scheduled_at: string; channel: "wa" | "em"; interviewer: string;
        };
        Update: Partial<Database["public"]["Tables"]["interviews"]["Row"]>;
        Relationships: [];
      };
      conversations: {
        Row: {
          id: string;
          org_id: string;
          candidate_id: string;
          channel: "wa" | "em";
          unread: boolean;
          escalated: boolean;
          confidence: number | null;
          suggested_reply: string | null;
          escalation_reason: string | null;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["conversations"]["Row"]> & {
          id: string; org_id: string; candidate_id: string; channel: "wa" | "em";
        };
        Update: Partial<Database["public"]["Tables"]["conversations"]["Row"]>;
        Relationships: [];
      };
      messages: {
        Row: {
          id: number;
          conversation_id: string;
          from_role: "schela" | "candidate" | "system";
          text: string;
          channel: "wa" | "em" | null;
          delivered: boolean;
          delivery_error: string | null;
          sender_kind: "ai" | "human" | "candidate" | "system";
          sender_name: string | null;
          attachment_url: string | null;
          attachment_name: string | null;
          attachment_type: string | null;
          attachment_size: number | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["messages"]["Row"]> & {
          conversation_id: string; from_role: "schela" | "candidate" | "system"; text: string;
        };
        Update: Partial<Database["public"]["Tables"]["messages"]["Row"]>;
        Relationships: [];
      };
      action_items: {
        Row: {
          id: string;
          org_id: string;
          category: string;
          candidate_id: string | null;
          conversation_id: string | null;
          interview_id: number | null;
          summary: string;
          confidence: number | null;
          resolved: boolean;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["action_items"]["Row"]> & {
          id: string; org_id: string; category: string; summary: string;
        };
        Update: Partial<Database["public"]["Tables"]["action_items"]["Row"]>;
        Relationships: [];
      };
      notifications: {
        Row: {
          id: number;
          org_id: string;
          type: string;
          title: string;
          description: string;
          unread: boolean;
          link_candidate_id: string | null;
          link_conversation_id: string | null;
          link_interview_id: number | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["notifications"]["Row"]> & {
          org_id: string; type: string; title: string; description: string;
        };
        Update: Partial<Database["public"]["Tables"]["notifications"]["Row"]>;
        Relationships: [];
      };
      integrations: {
        Row: {
          id: string; org_id: string; name: string; icon: string;
          connected: boolean; account: string | null; last_synced: string | null;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          config: any | null;
        };
        Insert: Partial<Database["public"]["Tables"]["integrations"]["Row"]> & {
          id: string; org_id: string; name: string; icon: string;
        };
        Update: Partial<Database["public"]["Tables"]["integrations"]["Row"]>;
        Relationships: [];
      };
      ai_decisions: {
        Row: {
          id: number; org_id: string; conversation_id: string | null; message_id: number | null;
          tier: "tier1" | "tier2" | "human"; model: string | null; intent: string | null;
          confidence: number | null; action_taken: string | null;
          reasoning: string | null; ambiguities: string[] | null; escalation_reason: string | null;
          input_tokens: number | null; output_tokens: number | null; created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["ai_decisions"]["Row"]> & {
          org_id: string; tier: "tier1" | "tier2" | "human";
        };
        Update: Partial<Database["public"]["Tables"]["ai_decisions"]["Row"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
