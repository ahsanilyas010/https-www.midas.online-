// Database types for the REAL, multi-tenant Postgres schema
// (supabase/migrations/00000000000038 onward) — Phase 1's new surfaces
// only (auth/identity, onboarding, branding, platform admin, seeding).
//
// This is deliberately a SEPARATE type from ./types.ts: the legacy/demo
// schema (used by src/lib/supabase/server.ts's createClient(), and every
// pre-existing CRM action file and page) already has tables named
// `profiles`, `campaigns`, `leads`, `teams`, `clients`, `audit_log` with a
// completely different, single-tenant shape. Reusing one `Database` type
// for both would force one shape to lie about the other's columns —
// hence two independent type files for two independent schemas, each with
// its own client constructor (./real.ts, ./service.ts vs ./server.ts,
// ./admin.ts).
//
// Hand-written to match the Phase 1 migrations since this environment has
// no live Supabase project to generate against. Regenerate for real with
// `supabase gen types typescript --linked > src/lib/supabase/real-types.ts`
// once a project is linked.

export type RealJson =
  | string
  | number
  | boolean
  | null
  | { [key: string]: RealJson | undefined }
  | RealJson[]

export type RealDatabase = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      platform_admins: {
        Row: {
          id: string
          email: string
          full_name: string | null
          created_at: string
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string | null
          created_at?: string
        }
        Relationships: []
      }
      rate_limit_hits: {
        Row: {
          bucket: string
          identifier: string
          window_start: string
          hit_count: number
        }
        Insert: {
          bucket: string
          identifier: string
          window_start: string
          hit_count?: number
        }
        Update: {
          bucket?: string
          identifier?: string
          window_start?: string
          hit_count?: number
        }
        Relationships: []
      }
      workspaces: {
        Row: {
          id: string
          slug: string
          name: string
          plan: RealDatabase["public"]["Enums"]["workspace_plan"]
          seat_limit: number
          status: RealDatabase["public"]["Enums"]["workspace_status"]
          is_demo: boolean
          billing_status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          brand_logo_url: string | null
          brand_primary_color: string | null
          brand_product_name: string | null
          onboarding_step: string | null
          signup: RealJson
          demo_allowed_numbers: string[]
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          slug: string
          name: string
          plan?: RealDatabase["public"]["Enums"]["workspace_plan"]
          seat_limit?: number
          status?: RealDatabase["public"]["Enums"]["workspace_status"]
          is_demo?: boolean
          billing_status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          brand_logo_url?: string | null
          brand_primary_color?: string | null
          brand_product_name?: string | null
          onboarding_step?: string | null
          signup?: RealJson
          demo_allowed_numbers?: string[]
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          slug?: string
          name?: string
          plan?: RealDatabase["public"]["Enums"]["workspace_plan"]
          seat_limit?: number
          status?: RealDatabase["public"]["Enums"]["workspace_status"]
          is_demo?: boolean
          billing_status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          brand_logo_url?: string | null
          brand_primary_color?: string | null
          brand_product_name?: string | null
          onboarding_step?: string | null
          signup?: RealJson
          demo_allowed_numbers?: string[]
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      teams: {
        Row: {
          id: string
          workspace_id: string
          name: string
          team_lead_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          name: string
          team_lead_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          name?: string
          team_lead_id?: string | null
          created_at?: string
        }
        Relationships: []
      }
      clients: {
        Row: {
          id: string
          workspace_id: string
          name: string
          country: string | null
          contact_name: string | null
          contact_email: string | null
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          name: string
          country?: string | null
          contact_name?: string | null
          contact_email?: string | null
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          name?: string
          country?: string | null
          contact_name?: string | null
          contact_email?: string | null
          is_active?: boolean
          created_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          id: string
          workspace_id: string
          email: string
          full_name: string
          agent_code: string | null
          role: RealDatabase["public"]["Enums"]["app_role"]
          team_id: string | null
          client_id: string | null
          phone: string | null
          timezone: string
          is_active: boolean
          joined_on: string | null
          must_change_password: boolean
          password_set_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          workspace_id: string
          email: string
          full_name: string
          agent_code?: string | null
          role?: RealDatabase["public"]["Enums"]["app_role"]
          team_id?: string | null
          client_id?: string | null
          phone?: string | null
          timezone?: string
          is_active?: boolean
          joined_on?: string | null
          must_change_password?: boolean
          password_set_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          email?: string
          full_name?: string
          agent_code?: string | null
          role?: RealDatabase["public"]["Enums"]["app_role"]
          team_id?: string | null
          client_id?: string | null
          phone?: string | null
          timezone?: string
          is_active?: boolean
          joined_on?: string | null
          must_change_password?: boolean
          password_set_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      campaigns: {
        Row: {
          id: string
          workspace_id: string
          client_id: string | null
          name: string
          vertical: string | null
          country: string | null
          timezone: string
          caller_id: string | null
          calling_window_start: string | null
          calling_window_end: string | null
          max_attempts: number
          cooling_off_hours: number
          recording_enabled: boolean
          disclosure_script: string | null
          objection_notes: string | null
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          client_id?: string | null
          name: string
          vertical?: string | null
          country?: string | null
          timezone?: string
          caller_id?: string | null
          calling_window_start?: string | null
          calling_window_end?: string | null
          max_attempts?: number
          cooling_off_hours?: number
          recording_enabled?: boolean
          disclosure_script?: string | null
          objection_notes?: string | null
          status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          client_id?: string | null
          name?: string
          vertical?: string | null
          country?: string | null
          timezone?: string
          caller_id?: string | null
          calling_window_start?: string | null
          calling_window_end?: string | null
          max_attempts?: number
          cooling_off_hours?: number
          recording_enabled?: boolean
          disclosure_script?: string | null
          objection_notes?: string | null
          status?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      campaign_assignments: {
        Row: {
          id: string
          workspace_id: string
          campaign_id: string
          user_id: string
          created_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          campaign_id: string
          user_id: string
          created_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          campaign_id?: string
          user_id?: string
          created_at?: string
        }
        Relationships: []
      }
      lead_batches: {
        Row: {
          id: string
          workspace_id: string
          campaign_id: string | null
          source: string | null
          uploaded_by: string | null
          row_count: number
          status: string
          screened_at: string | null
          storage_path: string | null
          evidence_url: string | null
          created_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          campaign_id?: string | null
          source?: string | null
          uploaded_by?: string | null
          row_count?: number
          status?: string
          screened_at?: string | null
          storage_path?: string | null
          evidence_url?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          campaign_id?: string | null
          source?: string | null
          uploaded_by?: string | null
          row_count?: number
          status?: string
          screened_at?: string | null
          storage_path?: string | null
          evidence_url?: string | null
          created_at?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          id: string
          workspace_id: string
          campaign_id: string | null
          batch_id: string | null
          phone_e164: string | null
          full_name: string | null
          screening_status: "pending" | "passed" | "failed" | "expired"
          screened_at: string | null
          phone_hash: string | null
          attempts: number
          last_attempt_at: string | null
          claimed_by: string | null
          claimed_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          campaign_id?: string | null
          batch_id?: string | null
          phone_e164?: string | null
          full_name?: string | null
          screening_status?: "pending" | "passed" | "failed" | "expired"
          screened_at?: string | null
          phone_hash?: string | null
          attempts?: number
          last_attempt_at?: string | null
          claimed_by?: string | null
          claimed_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          campaign_id?: string | null
          batch_id?: string | null
          phone_e164?: string | null
          full_name?: string | null
          screening_status?: "pending" | "passed" | "failed" | "expired"
          screened_at?: string | null
          phone_hash?: string | null
          attempts?: number
          last_attempt_at?: string | null
          claimed_by?: string | null
          claimed_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      suppression_list: {
        Row: {
          id: string
          workspace_id: string
          phone_hash: string
          reason: string
          evidence_url: string | null
          added_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          phone_hash: string
          reason: string
          evidence_url?: string | null
          added_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          phone_hash?: string
          reason?: string
          evidence_url?: string | null
          added_by?: string | null
          created_at?: string
        }
        Relationships: []
      }
      dispositions: {
        Row: {
          id: string
          code: string
          label: string
          outcome_group: "connect" | "no_connect" | "dnc" | "conversion"
          is_terminal: boolean
          sets_dnc: boolean
          requires_followup: boolean
          requires_note: boolean
          sort: number
        }
        Insert: {
          id?: string
          code: string
          label: string
          outcome_group: "connect" | "no_connect" | "dnc" | "conversion"
          is_terminal?: boolean
          sets_dnc?: boolean
          requires_followup?: boolean
          requires_note?: boolean
          sort?: number
        }
        Update: {
          id?: string
          code?: string
          label?: string
          outcome_group?: "connect" | "no_connect" | "dnc" | "conversion"
          is_terminal?: boolean
          sets_dnc?: boolean
          requires_followup?: boolean
          requires_note?: boolean
          sort?: number
        }
        Relationships: []
      }
      calls: {
        Row: {
          id: string
          workspace_id: string
          lead_id: string
          campaign_id: string | null
          agent_id: string
          disposition_id: string | null
          notes: string | null
          started_at: string
          ended_at: string | null
          created_at: string
          provider_call_sid: string | null
          direction: "outbound" | "inbound"
          status: "initiated" | "ringing" | "in-progress" | "completed" | "busy" | "no-answer" | "failed" | "canceled"
          from_number: string | null
          to_number: string | null
          recording_sid: string | null
          recording_path: string | null
        }
        Insert: {
          id?: string
          workspace_id: string
          lead_id: string
          campaign_id?: string | null
          agent_id: string
          disposition_id?: string | null
          notes?: string | null
          started_at?: string
          ended_at?: string | null
          created_at?: string
          provider_call_sid?: string | null
          direction?: "outbound" | "inbound"
          status?: "initiated" | "ringing" | "in-progress" | "completed" | "busy" | "no-answer" | "failed" | "canceled"
          from_number?: string | null
          to_number?: string | null
          recording_sid?: string | null
          recording_path?: string | null
        }
        Update: {
          id?: string
          workspace_id?: string
          lead_id?: string
          campaign_id?: string | null
          agent_id?: string
          disposition_id?: string | null
          notes?: string | null
          started_at?: string
          ended_at?: string | null
          created_at?: string
          provider_call_sid?: string | null
          direction?: "outbound" | "inbound"
          status?: "initiated" | "ringing" | "in-progress" | "completed" | "busy" | "no-answer" | "failed" | "canceled"
          from_number?: string | null
          to_number?: string | null
          recording_sid?: string | null
          recording_path?: string | null
        }
        Relationships: []
      }
      callbacks: {
        Row: {
          id: string
          workspace_id: string
          lead_id: string
          call_id: string | null
          agent_id: string | null
          due_at: string
          snooze_count: number
          status: "pending" | "done" | "escalated" | "cancelled"
          created_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          lead_id: string
          call_id?: string | null
          agent_id?: string | null
          due_at: string
          snooze_count?: number
          status?: "pending" | "done" | "escalated" | "cancelled"
          created_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          lead_id?: string
          call_id?: string | null
          agent_id?: string | null
          due_at?: string
          snooze_count?: number
          status?: "pending" | "done" | "escalated" | "cancelled"
          created_at?: string
        }
        Relationships: []
      }
      twilio_credentials: {
        Row: {
          id: string
          workspace_id: string
          account_sid: string | null
          auth_token_secret_id: string | null
          status: string
          twiml_app_sid: string | null
          caller_id_default: string | null
          verified_at: string | null
          last_error: string | null
          api_key_sid: string | null
          api_key_secret_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          account_sid?: string | null
          auth_token_secret_id?: string | null
          status?: string
          twiml_app_sid?: string | null
          caller_id_default?: string | null
          verified_at?: string | null
          last_error?: string | null
          api_key_sid?: string | null
          api_key_secret_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          account_sid?: string | null
          auth_token_secret_id?: string | null
          status?: string
          twiml_app_sid?: string | null
          caller_id_default?: string | null
          verified_at?: string | null
          last_error?: string | null
          api_key_sid?: string | null
          api_key_secret_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      twilio_numbers: {
        Row: {
          id: string
          workspace_id: string
          phone_number: string
          friendly_name: string | null
          capabilities: RealJson
          synced_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          phone_number: string
          friendly_name?: string | null
          capabilities?: RealJson
          synced_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          phone_number?: string
          friendly_name?: string | null
          capabilities?: RealJson
          synced_at?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          id: number
          actor_id: string | null
          workspace_id: string | null
          action: string
          entity_type: string
          entity_id: string | null
          before_data: RealJson | null
          after_data: RealJson | null
          created_at: string
        }
        Insert: {
          id?: number
          actor_id?: string | null
          workspace_id?: string | null
          action: string
          entity_type: string
          entity_id?: string | null
          before_data?: RealJson | null
          after_data?: RealJson | null
          created_at?: string
        }
        Update: {
          id?: number
          actor_id?: string | null
          workspace_id?: string | null
          action?: string
          entity_type?: string
          entity_id?: string | null
          before_data?: RealJson | null
          after_data?: RealJson | null
          created_at?: string
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      is_platform_admin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      check_rate_limit: {
        Args: {
          p_bucket: string
          p_identifier: string
          p_max_hits: number
          p_window_seconds: number
        }
        Returns: boolean
      }
      auth_workspace_id: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      auth_role: {
        Args: Record<PropertyKey, never>
        Returns: RealDatabase["public"]["Enums"]["app_role"]
      }
      is_workspace_manager: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      my_team_id: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      my_client_id: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      my_team_members: {
        Args: Record<PropertyKey, never>
        Returns: string[]
      }
      create_workspace_with_owner: {
        Args: {
          p_user_id: string
          p_email: string
          p_full_name: string
          p_workspace_name: string
          p_slug: string
          p_phone?: string | null
          p_team_size?: string | null
          p_signup?: RealJson
        }
        Returns: RealDatabase["public"]["Tables"]["workspaces"]["Row"]
      }
      mark_onboarding_step: {
        Args: {
          p_workspace_id: string
          p_step: string
        }
        Returns: undefined
      }
      set_twilio_credentials: {
        Args: {
          p_workspace_id: string
          p_account_sid: string
          p_auth_token: string
        }
        Returns: undefined
      }
      compute_phone_hash: {
        Args: { p_phone: string }
        Returns: string
      }
      next_lead_for_agent: {
        Args: { p_agent_id: string }
        Returns: RealDatabase["public"]["Tables"]["leads"]["Row"] | null
      }
      record_call_attempt: {
        Args: {
          p_lead_id: string
          p_disposition_code: string
          p_notes?: string | null
          p_callback_due_at?: string | null
        }
        Returns: RealDatabase["public"]["Tables"]["calls"]["Row"]
      }
      screen_lead_batch: {
        Args: { p_batch_id: string; p_evidence_url: string | null }
        Returns: number
      }
      get_twilio_auth_token: {
        Args: { p_workspace_id: string }
        Returns: string
      }
      set_twilio_api_key: {
        Args: { p_workspace_id: string; p_api_key_sid: string; p_api_key_secret: string }
        Returns: undefined
      }
      get_twilio_api_key_secret: {
        Args: { p_workspace_id: string }
        Returns: string
      }
    }
    Enums: {
      app_role: "super_admin" | "ops_manager" | "team_lead" | "agent" | "qa_analyst" | "client"
      workspace_plan: "free" | "paid"
      workspace_status: "onboarding" | "active" | "suspended" | "canceled"
    }
    CompositeTypes: Record<string, never>
  }
}

export type RealTables<T extends keyof RealDatabase["public"]["Tables"]> = RealDatabase["public"]["Tables"][T]["Row"]
export type RealTablesInsert<T extends keyof RealDatabase["public"]["Tables"]> = RealDatabase["public"]["Tables"][T]["Insert"]
export type RealTablesUpdate<T extends keyof RealDatabase["public"]["Tables"]> = RealDatabase["public"]["Tables"][T]["Update"]
export type RealEnums<T extends keyof RealDatabase["public"]["Enums"]> = RealDatabase["public"]["Enums"][T]
