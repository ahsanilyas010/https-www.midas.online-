// Database types for the app schema (supabase/migrations), plus the demo-only Zoom tables.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      attendance_sessions: {
        Row: {
          agent_note: string | null
          approved_at: string | null
          approved_by: string | null
          break_minutes: number
          clock_in_at: string | null
          clock_in_device: string | null
          clock_in_ip: unknown
          clock_out_at: string | null
          clock_out_ip: unknown
          created_at: string
          early_leave_minutes: number
          id: string
          is_manual_entry: boolean
          late_minutes: number
          lead_note: string | null
          manual_reason: string | null
          productive_minutes: number
          shift_id: string | null
          status: Database["public"]["Enums"]["attendance_status"] | null
          user_id: string
          work_date: string
          worked_minutes: number
        }
        Insert: {
          agent_note?: string | null
          approved_at?: string | null
          approved_by?: string | null
          break_minutes?: number
          clock_in_at?: string | null
          clock_in_device?: string | null
          clock_in_ip?: unknown
          clock_out_at?: string | null
          clock_out_ip?: unknown
          created_at?: string
          early_leave_minutes?: number
          id?: string
          is_manual_entry?: boolean
          late_minutes?: number
          lead_note?: string | null
          manual_reason?: string | null
          productive_minutes?: number
          shift_id?: string | null
          status?: Database["public"]["Enums"]["attendance_status"] | null
          user_id: string
          work_date: string
          worked_minutes?: number
        }
        Update: {
          agent_note?: string | null
          approved_at?: string | null
          approved_by?: string | null
          break_minutes?: number
          clock_in_at?: string | null
          clock_in_device?: string | null
          clock_in_ip?: unknown
          clock_out_at?: string | null
          clock_out_ip?: unknown
          created_at?: string
          early_leave_minutes?: number
          id?: string
          is_manual_entry?: boolean
          late_minutes?: number
          lead_note?: string | null
          manual_reason?: string | null
          productive_minutes?: number
          shift_id?: string | null
          status?: Database["public"]["Enums"]["attendance_status"] | null
          user_id?: string
          work_date?: string
          worked_minutes?: number
        }
        Relationships: [
          {
            foreignKeyName: "attendance_sessions_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_sessions_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          after_data: Json | null
          before_data: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: number
          ip: unknown
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: number
          ip?: unknown
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: number
          ip?: unknown
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      aux_logs: {
        Row: {
          duration_seconds: number | null
          ended_at: string | null
          id: string
          reason: string | null
          session_id: string
          started_at: string
          state: Database["public"]["Enums"]["aux_state"]
          user_id: string
        }
        Insert: {
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          reason?: string | null
          session_id: string
          started_at?: string
          state: Database["public"]["Enums"]["aux_state"]
          user_id: string
        }
        Update: {
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          reason?: string | null
          session_id?: string
          started_at?: string
          state?: Database["public"]["Enums"]["aux_state"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "aux_logs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "attendance_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aux_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      call_attempts: {
        Row: {
          agent_id: string
          attempt_no: number
          campaign_id: string
          created_at: string
          disposition_id: string | null
          ended_at: string | null
          id: string
          lead_id: string
          lead_local_time: string
          notes: string | null
          offshore_disclosure_given: boolean | null
          screening_run_id: string | null
          started_at: string
          talk_seconds: number | null
          within_call_window: boolean
          wrap_seconds: number | null
        }
        Insert: {
          agent_id: string
          attempt_no: number
          campaign_id: string
          created_at?: string
          disposition_id?: string | null
          ended_at?: string | null
          id?: string
          lead_id: string
          lead_local_time: string
          notes?: string | null
          offshore_disclosure_given?: boolean | null
          screening_run_id?: string | null
          started_at?: string
          talk_seconds?: number | null
          within_call_window: boolean
          wrap_seconds?: number | null
        }
        Update: {
          agent_id?: string
          attempt_no?: number
          campaign_id?: string
          created_at?: string
          disposition_id?: string | null
          ended_at?: string | null
          id?: string
          lead_id?: string
          lead_local_time?: string
          notes?: string | null
          offshore_disclosure_given?: boolean | null
          screening_run_id?: string | null
          started_at?: string
          talk_seconds?: number | null
          within_call_window?: boolean
          wrap_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "call_attempts_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_attempts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_attempts_disposition_id_fkey"
            columns: ["disposition_id"]
            isOneToOne: false
            referencedRelation: "dispositions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_attempts_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_attempts_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_dialable_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_attempts_screening_run_id_fkey"
            columns: ["screening_run_id"]
            isOneToOne: false
            referencedRelation: "suppression_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_assignments: {
        Row: {
          campaign_id: string
          created_at: string
          daily_target: number | null
          user_id: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          daily_target?: number | null
          user_id: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          daily_target?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_assignments_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_fields: {
        Row: {
          campaign_id: string
          field_type: string
          id: string
          is_required: boolean
          key: string
          label: string
          options: Json | null
          show_in_list: boolean
          sort_order: number
        }
        Insert: {
          campaign_id: string
          field_type: string
          id?: string
          is_required?: boolean
          key: string
          label: string
          options?: Json | null
          show_in_list?: boolean
          sort_order?: number
        }
        Update: {
          campaign_id?: string
          field_type?: string
          id?: string
          is_required?: boolean
          key?: string
          label?: string
          options?: Json | null
          show_in_list?: boolean
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "campaign_fields_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          audience: string
          call_days: number[]
          call_window_end: string
          call_window_start: string
          client_id: string
          code: string
          created_at: string
          dpa_reference: string | null
          id: string
          is_active: boolean
          market: string
          max_attempts: number
          min_hours_between_attempts: number
          name: string
          objection_handling_md: string | null
          opening_disclosure: string | null
          requires_ctps_screening: boolean
          requires_offshore_disclosure: boolean
          requires_tps_screening: boolean
          requires_us_dnc_screening: boolean
          risk_tier: string
          screening_max_age_days: number
          script_md: string | null
          vertical: string
          vertical_preset_overridden: boolean
        }
        Insert: {
          audience: string
          call_days?: number[]
          call_window_end?: string
          call_window_start?: string
          client_id: string
          code: string
          created_at?: string
          dpa_reference?: string | null
          id?: string
          is_active?: boolean
          market: string
          max_attempts?: number
          min_hours_between_attempts?: number
          name: string
          objection_handling_md?: string | null
          opening_disclosure?: string | null
          requires_ctps_screening?: boolean
          requires_offshore_disclosure?: boolean
          requires_tps_screening?: boolean
          requires_us_dnc_screening?: boolean
          risk_tier?: string
          screening_max_age_days?: number
          script_md?: string | null
          vertical?: string
          vertical_preset_overridden?: boolean
        }
        Update: {
          audience?: string
          call_days?: number[]
          call_window_end?: string
          call_window_start?: string
          client_id?: string
          code?: string
          created_at?: string
          dpa_reference?: string | null
          id?: string
          is_active?: boolean
          market?: string
          max_attempts?: number
          min_hours_between_attempts?: number
          name?: string
          objection_handling_md?: string | null
          opening_disclosure?: string | null
          requires_ctps_screening?: boolean
          requires_offshore_disclosure?: boolean
          requires_tps_screening?: boolean
          requires_us_dnc_screening?: boolean
          risk_tier?: string
          screening_max_age_days?: number
          script_md?: string | null
          vertical?: string
          vertical_preset_overridden?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_agent_labels: {
        Row: {
          agent_id: string
          client_id: string
          created_at: string
          label: string
        }
        Insert: {
          agent_id: string
          client_id: string
          created_at?: string
          label: string
        }
        Update: {
          agent_id?: string
          client_id?: string
          created_at?: string
          label?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_agent_labels_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_agent_labels_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          contact_email: string | null
          contact_name: string | null
          contract_ref: string | null
          country: string | null
          created_at: string
          dpa_signed_on: string | null
          full_visibility: boolean
          id: string
          is_active: boolean
          is_data_controller: boolean
          name: string
          notes: string | null
        }
        Insert: {
          contact_email?: string | null
          contact_name?: string | null
          contract_ref?: string | null
          country?: string | null
          created_at?: string
          dpa_signed_on?: string | null
          full_visibility?: boolean
          id?: string
          is_active?: boolean
          is_data_controller?: boolean
          name: string
          notes?: string | null
        }
        Update: {
          contact_email?: string | null
          contact_name?: string | null
          contract_ref?: string | null
          country?: string | null
          created_at?: string
          dpa_signed_on?: string | null
          full_visibility?: boolean
          id?: string
          is_active?: boolean
          is_data_controller?: boolean
          name?: string
          notes?: string | null
        }
        Relationships: []
      }
      credential_events: {
        Row: {
          actor_id: string | null
          created_at: string
          event: string
          id: number
          ip: unknown
          note: string | null
          user_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event: string
          id?: number
          ip?: unknown
          note?: string | null
          user_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event?: string
          id?: number
          ip?: unknown
          note?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credential_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credential_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      data_sources: {
        Row: {
          config: Json
          created_at: string
          id: string
          is_active: boolean
          lawful_basis: string
          lia_document_path: string | null
          licence_terms_url: string | null
          market: string | null
          name: string
          notes: string | null
          provider_url: string | null
          source_type: string
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          lawful_basis: string
          lia_document_path?: string | null
          licence_terms_url?: string | null
          market?: string | null
          name: string
          notes?: string | null
          provider_url?: string | null
          source_type: string
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          lawful_basis?: string
          lia_document_path?: string | null
          licence_terms_url?: string | null
          market?: string | null
          name?: string
          notes?: string | null
          provider_url?: string | null
          source_type?: string
        }
        Relationships: []
      }
      dispositions: {
        Row: {
          campaign_id: string | null
          category: string
          code: string
          colour: string | null
          id: string
          is_terminal: boolean
          label: string
          requires_email: boolean
          requires_followup: boolean
          requires_note: boolean
          sets_dnc: boolean
          sort_order: number
        }
        Insert: {
          campaign_id?: string | null
          category: string
          code: string
          colour?: string | null
          id?: string
          is_terminal?: boolean
          label: string
          requires_email?: boolean
          requires_followup?: boolean
          requires_note?: boolean
          sets_dnc?: boolean
          sort_order?: number
        }
        Update: {
          campaign_id?: string | null
          category?: string
          code?: string
          colour?: string | null
          id?: string
          is_terminal?: boolean
          label?: string
          requires_email?: boolean
          requires_followup?: boolean
          requires_note?: boolean
          sets_dnc?: boolean
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "dispositions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      email_sends: {
        Row: {
          agent_id: string
          body_sent_html: string
          campaign_id: string
          clicked_at: string | null
          created_at: string
          delivered_at: string | null
          id: string
          lead_id: string
          opened_at: string | null
          provider_error: string | null
          provider_message_id: string | null
          sent_at: string | null
          status: string
          subject_sent: string
          template_id: string | null
          to_email: string
        }
        Insert: {
          agent_id: string
          body_sent_html: string
          campaign_id: string
          clicked_at?: string | null
          created_at?: string
          delivered_at?: string | null
          id?: string
          lead_id: string
          opened_at?: string | null
          provider_error?: string | null
          provider_message_id?: string | null
          sent_at?: string | null
          status?: string
          subject_sent: string
          template_id?: string | null
          to_email: string
        }
        Update: {
          agent_id?: string
          body_sent_html?: string
          campaign_id?: string
          clicked_at?: string | null
          created_at?: string
          delivered_at?: string | null
          id?: string
          lead_id?: string
          opened_at?: string | null
          provider_error?: string | null
          provider_message_id?: string | null
          sent_at?: string | null
          status?: string
          subject_sent?: string
          template_id?: string | null
          to_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_sends_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_sends_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_sends_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_sends_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_dialable_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_sends_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      email_suppression: {
        Row: {
          created_at: string
          email: string
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          reason?: string
        }
        Relationships: []
      }
      email_templates: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          body_html: string
          body_text: string | null
          campaign_id: string | null
          created_at: string
          from_email: string | null
          from_name: string | null
          id: string
          is_active: boolean
          merge_fields: string[] | null
          name: string
          reply_to: string | null
          requires_approval: boolean
          subject: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          body_html: string
          body_text?: string | null
          campaign_id?: string | null
          created_at?: string
          from_email?: string | null
          from_name?: string | null
          id?: string
          is_active?: boolean
          merge_fields?: string[] | null
          name: string
          reply_to?: string | null
          requires_approval?: boolean
          subject: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          body_html?: string
          body_text?: string | null
          campaign_id?: string | null
          created_at?: string
          from_email?: string | null
          from_name?: string | null
          id?: string
          is_active?: boolean
          merge_fields?: string[] | null
          name?: string
          reply_to?: string | null
          requires_approval?: boolean
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_templates_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_templates_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      followups: {
        Row: {
          assigned_to: string
          campaign_id: string
          completed_at: string | null
          completed_call_id: string | null
          created_at: string
          created_by: string | null
          due_at: string
          due_at_lead_local: string | null
          escalated_at: string | null
          followup_type: string
          id: string
          lead_id: string
          note: string | null
          priority: string
          reminded_at: string | null
          snooze_count: number
          status: string
        }
        Insert: {
          assigned_to: string
          campaign_id: string
          completed_at?: string | null
          completed_call_id?: string | null
          created_at?: string
          created_by?: string | null
          due_at: string
          due_at_lead_local?: string | null
          escalated_at?: string | null
          followup_type: string
          id?: string
          lead_id: string
          note?: string | null
          priority?: string
          reminded_at?: string | null
          snooze_count?: number
          status?: string
        }
        Update: {
          assigned_to?: string
          campaign_id?: string
          completed_at?: string | null
          completed_call_id?: string | null
          created_at?: string
          created_by?: string | null
          due_at?: string
          due_at_lead_local?: string | null
          escalated_at?: string | null
          followup_type?: string
          id?: string
          lead_id?: string
          note?: string | null
          priority?: string
          reminded_at?: string | null
          snooze_count?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "followups_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followups_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followups_completed_call_id_fkey"
            columns: ["completed_call_id"]
            isOneToOne: false
            referencedRelation: "call_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followups_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followups_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_dialable_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      holidays: {
        Row: {
          holiday_date: string
          id: string
          market: string | null
          name: string
        }
        Insert: {
          holiday_date: string
          id?: string
          market?: string | null
          name: string
        }
        Update: {
          holiday_date?: string
          id?: string
          market?: string | null
          name?: string
        }
        Relationships: []
      }
      lead_batches: {
        Row: {
          acquired_at: string
          campaign_id: string
          column_mapping: Json | null
          created_at: string
          data_source_id: string
          error_report_path: string | null
          id: string
          notes: string | null
          original_filename: string | null
          rows_accepted: number
          rows_duplicate: number
          rows_rejected: number
          rows_suppressed: number
          rows_total: number
          status: string
          storage_path: string | null
          uploaded_by: string | null
        }
        Insert: {
          acquired_at: string
          campaign_id: string
          column_mapping?: Json | null
          created_at?: string
          data_source_id: string
          error_report_path?: string | null
          id?: string
          notes?: string | null
          original_filename?: string | null
          rows_accepted?: number
          rows_duplicate?: number
          rows_rejected?: number
          rows_suppressed?: number
          rows_total?: number
          status?: string
          storage_path?: string | null
          uploaded_by?: string | null
        }
        Update: {
          acquired_at?: string
          campaign_id?: string
          column_mapping?: Json | null
          created_at?: string
          data_source_id?: string
          error_report_path?: string | null
          id?: string
          notes?: string | null
          original_filename?: string | null
          rows_accepted?: number
          rows_duplicate?: number
          rows_rejected?: number
          rows_suppressed?: number
          rows_total?: number
          status?: string
          storage_path?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_batches_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_batches_data_source_id_fkey"
            columns: ["data_source_id"]
            isOneToOne: false
            referencedRelation: "data_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_batches_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          alt_phone_e164: string | null
          assigned_at: string | null
          assigned_to: string | null
          attempt_count: number
          batch_id: string | null
          campaign_id: string
          city: string | null
          company_name: string | null
          consent_captured_at: string | null
          consent_evidence_path: string | null
          consent_source: string | null
          consent_status: string | null
          country_code: string
          created_at: string
          custom: Json
          data_source_id: string | null
          dnc_reason: string | null
          dnc_set_at: string | null
          do_not_call: boolean
          email: string | null
          external_ref: string | null
          first_name: string | null
          id: string
          job_title: string | null
          last_attempt_at: string | null
          last_disposition_id: string | null
          last_name: string | null
          lead_score: number | null
          lead_timezone: string | null
          next_action_at: string | null
          phone_e164: string
          phone_raw: string | null
          phone_type: string | null
          postcode: string | null
          region: string | null
          retention_expires_at: string | null
          screened_at: string | null
          screening_run_id: string | null
          screening_status: Database["public"]["Enums"]["screening_status"]
          status: Database["public"]["Enums"]["lead_status"]
          updated_at: string
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          alt_phone_e164?: string | null
          assigned_at?: string | null
          assigned_to?: string | null
          attempt_count?: number
          batch_id?: string | null
          campaign_id: string
          city?: string | null
          company_name?: string | null
          consent_captured_at?: string | null
          consent_evidence_path?: string | null
          consent_source?: string | null
          consent_status?: string | null
          country_code: string
          created_at?: string
          custom?: Json
          data_source_id?: string | null
          dnc_reason?: string | null
          dnc_set_at?: string | null
          do_not_call?: boolean
          email?: string | null
          external_ref?: string | null
          first_name?: string | null
          id?: string
          job_title?: string | null
          last_attempt_at?: string | null
          last_disposition_id?: string | null
          last_name?: string | null
          lead_score?: number | null
          lead_timezone?: string | null
          next_action_at?: string | null
          phone_e164: string
          phone_raw?: string | null
          phone_type?: string | null
          postcode?: string | null
          region?: string | null
          retention_expires_at?: string | null
          screened_at?: string | null
          screening_run_id?: string | null
          screening_status?: Database["public"]["Enums"]["screening_status"]
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          alt_phone_e164?: string | null
          assigned_at?: string | null
          assigned_to?: string | null
          attempt_count?: number
          batch_id?: string | null
          campaign_id?: string
          city?: string | null
          company_name?: string | null
          consent_captured_at?: string | null
          consent_evidence_path?: string | null
          consent_source?: string | null
          consent_status?: string | null
          country_code?: string
          created_at?: string
          custom?: Json
          data_source_id?: string | null
          dnc_reason?: string | null
          dnc_set_at?: string | null
          do_not_call?: boolean
          email?: string | null
          external_ref?: string | null
          first_name?: string | null
          id?: string
          job_title?: string | null
          last_attempt_at?: string | null
          last_disposition_id?: string | null
          last_name?: string | null
          lead_score?: number | null
          lead_timezone?: string | null
          next_action_at?: string | null
          phone_e164?: string
          phone_raw?: string | null
          phone_type?: string | null
          postcode?: string | null
          region?: string | null
          retention_expires_at?: string | null
          screened_at?: string | null
          screening_run_id?: string | null
          screening_status?: Database["public"]["Enums"]["screening_status"]
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "lead_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_data_source_id_fkey"
            columns: ["data_source_id"]
            isOneToOne: false
            referencedRelation: "data_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_requests: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          from_date: string
          id: string
          is_half_day: boolean
          leave_type: string
          reason: string | null
          status: string
          to_date: string
          user_id: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          from_date: string
          id?: string
          is_half_day?: boolean
          leave_type: string
          reason?: string | null
          status?: string
          to_date: string
          user_id: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          from_date?: string
          id?: string
          is_half_day?: boolean
          leave_type?: string
          reason?: string | null
          status?: string
          to_date?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          agent_code: string | null
          allow_login_outside_shift: boolean
          client_id: string | null
          created_at: string
          failed_login_count: number
          full_name: string
          id: string
          is_active: boolean
          joined_on: string | null
          last_login_at: string | null
          last_login_ip: unknown
          locked_until: string | null
          must_change_password: boolean
          password_set_at: string | null
          phone: string | null
          role: Database["public"]["Enums"]["app_role"]
          team_id: string | null
          timezone: string
          totp_enabled: boolean
          updated_at: string
        }
        Insert: {
          agent_code?: string | null
          allow_login_outside_shift?: boolean
          client_id?: string | null
          created_at?: string
          failed_login_count?: number
          full_name: string
          id: string
          is_active?: boolean
          joined_on?: string | null
          last_login_at?: string | null
          last_login_ip?: unknown
          locked_until?: string | null
          must_change_password?: boolean
          password_set_at?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          team_id?: string | null
          timezone?: string
          totp_enabled?: boolean
          updated_at?: string
        }
        Update: {
          agent_code?: string | null
          allow_login_outside_shift?: boolean
          client_id?: string | null
          created_at?: string
          failed_login_count?: number
          full_name?: string
          id?: string
          is_active?: boolean
          joined_on?: string | null
          last_login_at?: string | null
          last_login_ip?: unknown
          locked_until?: string | null
          must_change_password?: boolean
          password_set_at?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          team_id?: string | null
          timezone?: string
          totp_enabled?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      qa_reviews: {
        Row: {
          agent_acknowledged_at: string | null
          agent_id: string
          call_attempt_id: string
          coaching_notes: string | null
          created_at: string
          fatal_breach: boolean
          id: string
          passed: boolean | null
          reviewer_id: string
          scorecard_id: string
          scores: Json
          total_score: number | null
        }
        Insert: {
          agent_acknowledged_at?: string | null
          agent_id: string
          call_attempt_id: string
          coaching_notes?: string | null
          created_at?: string
          fatal_breach?: boolean
          id?: string
          passed?: boolean | null
          reviewer_id: string
          scorecard_id: string
          scores: Json
          total_score?: number | null
        }
        Update: {
          agent_acknowledged_at?: string | null
          agent_id?: string
          call_attempt_id?: string
          coaching_notes?: string | null
          created_at?: string
          fatal_breach?: boolean
          id?: string
          passed?: boolean | null
          reviewer_id?: string
          scorecard_id?: string
          scores?: Json
          total_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "qa_reviews_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qa_reviews_call_attempt_id_fkey"
            columns: ["call_attempt_id"]
            isOneToOne: false
            referencedRelation: "call_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qa_reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qa_reviews_scorecard_id_fkey"
            columns: ["scorecard_id"]
            isOneToOne: false
            referencedRelation: "qa_scorecards"
            referencedColumns: ["id"]
          },
        ]
      }
      qa_scorecards: {
        Row: {
          campaign_id: string | null
          created_at: string
          criteria: Json
          id: string
          is_active: boolean
          name: string
          pass_threshold: number
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string
          criteria: Json
          id?: string
          is_active?: boolean
          name: string
          pass_threshold?: number
        }
        Update: {
          campaign_id?: string | null
          created_at?: string
          criteria?: Json
          id?: string
          is_active?: boolean
          name?: string
          pass_threshold?: number
        }
        Relationships: [
          {
            foreignKeyName: "qa_scorecards_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_assignments: {
        Row: {
          created_at: string
          effective_from: string
          effective_to: string | null
          id: string
          shift_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          effective_from: string
          effective_to?: string | null
          id?: string
          shift_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          shift_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_assignments_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shifts: {
        Row: {
          break_allowance_minutes: number
          created_at: string
          crosses_midnight: boolean | null
          days_of_week: number[]
          end_time: string
          grace_minutes: number
          id: string
          is_active: boolean
          name: string
          start_time: string
          timezone: string
        }
        Insert: {
          break_allowance_minutes?: number
          created_at?: string
          crosses_midnight?: boolean | null
          days_of_week?: number[]
          end_time: string
          grace_minutes?: number
          id?: string
          is_active?: boolean
          name: string
          start_time: string
          timezone?: string
        }
        Update: {
          break_allowance_minutes?: number
          created_at?: string
          crosses_midnight?: boolean | null
          days_of_week?: number[]
          end_time?: string
          grace_minutes?: number
          id?: string
          is_active?: boolean
          name?: string
          start_time?: string
          timezone?: string
        }
        Relationships: []
      }
      source_fetch_runs: {
        Row: {
          assigned_team_id: string | null
          assigned_to: string | null
          campaign_id: string | null
          data_source_id: string
          error: string | null
          finished_at: string | null
          id: string
          params: Json
          raw_response_path: string | null
          records_found: number
          records_imported: number
          records_rejected: number
          skip_screening: boolean
          started_at: string
          status: string
          triggered_by: string | null
        }
        Insert: {
          assigned_team_id?: string | null
          assigned_to?: string | null
          campaign_id?: string | null
          data_source_id: string
          error?: string | null
          finished_at?: string | null
          id?: string
          params?: Json
          raw_response_path?: string | null
          records_found?: number
          records_imported?: number
          records_rejected?: number
          skip_screening?: boolean
          started_at?: string
          status?: string
          triggered_by?: string | null
        }
        Update: {
          assigned_team_id?: string | null
          assigned_to?: string | null
          campaign_id?: string | null
          data_source_id?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          params?: Json
          raw_response_path?: string | null
          records_found?: number
          records_imported?: number
          records_rejected?: number
          skip_screening?: boolean
          started_at?: string
          status?: string
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "source_fetch_runs_assigned_team_id_fkey"
            columns: ["assigned_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_fetch_runs_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_fetch_runs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_fetch_runs_data_source_id_fkey"
            columns: ["data_source_id"]
            isOneToOne: false
            referencedRelation: "data_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_fetch_runs_triggered_by_fkey"
            columns: ["triggered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      suppression_list: {
        Row: {
          added_by: string | null
          created_at: string
          evidence_note: string | null
          expires_at: string | null
          is_permanent: boolean
          lead_id: string | null
          market: string | null
          phone_e164: string
          reason: Database["public"]["Enums"]["suppression_reason"]
          source: string | null
        }
        Insert: {
          added_by?: string | null
          created_at?: string
          evidence_note?: string | null
          expires_at?: string | null
          is_permanent?: boolean
          lead_id?: string | null
          market?: string | null
          phone_e164: string
          reason: Database["public"]["Enums"]["suppression_reason"]
          source?: string | null
        }
        Update: {
          added_by?: string | null
          created_at?: string
          evidence_note?: string | null
          expires_at?: string | null
          is_permanent?: boolean
          lead_id?: string | null
          market?: string | null
          phone_e164?: string
          reason?: Database["public"]["Enums"]["suppression_reason"]
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suppression_list_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      suppression_runs: {
        Row: {
          batch_id: string | null
          campaign_id: string | null
          evidence_path: string | null
          id: string
          numbers_matched: number | null
          numbers_submitted: number | null
          provider: string
          provider_reference: string | null
          ran_at: string
          ran_by: string | null
          valid_until: string | null
        }
        Insert: {
          batch_id?: string | null
          campaign_id?: string | null
          evidence_path?: string | null
          id?: string
          numbers_matched?: number | null
          numbers_submitted?: number | null
          provider: string
          provider_reference?: string | null
          ran_at?: string
          ran_by?: string | null
          valid_until?: string | null
        }
        Update: {
          batch_id?: string | null
          campaign_id?: string | null
          evidence_path?: string | null
          id?: string
          numbers_matched?: number | null
          numbers_submitted?: number | null
          provider?: string
          provider_reference?: string | null
          ran_at?: string
          ran_by?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suppression_runs_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "lead_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suppression_runs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suppression_runs_ran_by_fkey"
            columns: ["ran_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          id: string
          name: string
          team_lead_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          team_lead_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          team_lead_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teams_team_lead_id_fkey"
            columns: ["team_lead_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      unphoned_contacts: {
        Row: {
          assigned_to: string | null
          campaign_id: string
          company_ref: string | null
          contact_added_on: string | null
          country_hint: string
          created_at: string
          custom: Json
          data_source_id: string
          email: string | null
          first_name: string | null
          id: string
          last_name: string | null
          person_ref: string
          phone_raw: string | null
          project_ref: string
          project_title: string | null
          project_town: string | null
          project_value: number | null
          promoted_at: string | null
          promoted_lead_id: string | null
          role: string | null
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          campaign_id: string
          company_ref?: string | null
          contact_added_on?: string | null
          country_hint?: string
          created_at?: string
          custom?: Json
          data_source_id: string
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          person_ref: string
          phone_raw?: string | null
          project_ref: string
          project_title?: string | null
          project_town?: string | null
          project_value?: number | null
          promoted_at?: string | null
          promoted_lead_id?: string | null
          role?: string | null
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          campaign_id?: string
          company_ref?: string | null
          contact_added_on?: string | null
          country_hint?: string
          created_at?: string
          custom?: Json
          data_source_id?: string
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          person_ref?: string
          phone_raw?: string | null
          project_ref?: string
          project_title?: string | null
          project_town?: string | null
          project_value?: number | null
          promoted_at?: string | null
          promoted_lead_id?: string | null
          role?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "unphoned_contacts_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unphoned_contacts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unphoned_contacts_data_source_id_fkey"
            columns: ["data_source_id"]
            isOneToOne: false
            referencedRelation: "data_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unphoned_contacts_data_source_id_fkey"
            columns: ["data_source_id"]
            isOneToOne: false
            referencedRelation: "v_source_performance"
            referencedColumns: ["data_source_id"]
          },
          {
            foreignKeyName: "unphoned_contacts_promoted_lead_id_fkey"
            columns: ["promoted_lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unphoned_contacts_promoted_lead_id_fkey"
            columns: ["promoted_lead_id"]
            isOneToOne: false
            referencedRelation: "v_dialable_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      user_sessions: {
        Row: {
          ended_at: string | null
          ended_reason: string | null
          id: string
          ip: unknown
          last_seen_at: string | null
          started_at: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          ended_at?: string | null
          ended_reason?: string | null
          id?: string
          ip?: unknown
          last_seen_at?: string | null
          started_at?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          ended_at?: string | null
          ended_reason?: string | null
          id?: string
          ip?: unknown
          last_seen_at?: string | null
          started_at?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          id: string
          provider: string
          connected: boolean
          account_email: string | null
          account_name: string | null
          plan: string | null
          connected_at: string | null
          connected_by: string | null
          settings: Json
        }
        Insert: {
          id: string
          provider: string
          connected: boolean
          account_email?: string | null
          account_name?: string | null
          plan?: string | null
          connected_at?: string | null
          connected_by?: string | null
          settings?: Json
        }
        Update: {
          id?: string
          provider?: string
          connected?: boolean
          account_email?: string | null
          account_name?: string | null
          plan?: string | null
          connected_at?: string | null
          connected_by?: string | null
          settings?: Json
        }
        Relationships: [
          {
            foreignKeyName: "integrations_connected_by_fkey"
            columns: ["connected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      zoom_meetings: {
        Row: {
          id: string
          zoom_meeting_id: string
          topic: string
          agenda: string | null
          start_time: string
          duration_minutes: number
          timezone: string
          join_url: string
          start_url: string
          password: string | null
          host_id: string
          lead_id: string | null
          campaign_id: string | null
          invitee_name: string | null
          invitee_email: string | null
          status: string
          source: string
          participants: number | null
          actual_duration_minutes: number | null
          recording_url: string | null
          ai_summary: string | null
          created_at: string
        }
        Insert: {
          id?: string
          zoom_meeting_id: string
          topic: string
          agenda?: string | null
          start_time: string
          duration_minutes?: number
          timezone: string
          join_url: string
          start_url: string
          password?: string | null
          host_id: string
          lead_id?: string | null
          campaign_id?: string | null
          invitee_name?: string | null
          invitee_email?: string | null
          status?: string
          source: string
          participants?: number | null
          actual_duration_minutes?: number | null
          recording_url?: string | null
          ai_summary?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          zoom_meeting_id?: string
          topic?: string
          agenda?: string | null
          start_time?: string
          duration_minutes?: number
          timezone?: string
          join_url?: string
          start_url?: string
          password?: string | null
          host_id?: string
          lead_id?: string | null
          campaign_id?: string | null
          invitee_name?: string | null
          invitee_email?: string | null
          status?: string
          source?: string
          participants?: number | null
          actual_duration_minutes?: number | null
          recording_url?: string | null
          ai_summary?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "zoom_meetings_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zoom_meetings_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zoom_meetings_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_dialable_leads: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          alt_phone_e164: string | null
          assigned_at: string | null
          assigned_to: string | null
          attempt_count: number | null
          batch_id: string | null
          campaign_code: string | null
          campaign_id: string | null
          city: string | null
          company_name: string | null
          consent_captured_at: string | null
          consent_evidence_path: string | null
          consent_source: string | null
          consent_status: string | null
          country_code: string | null
          created_at: string | null
          custom: Json | null
          data_source_id: string | null
          dnc_reason: string | null
          dnc_set_at: string | null
          do_not_call: boolean | null
          email: string | null
          external_ref: string | null
          first_name: string | null
          id: string | null
          job_title: string | null
          last_attempt_at: string | null
          last_disposition_id: string | null
          last_name: string | null
          lead_local_time: string | null
          lead_score: number | null
          lead_timezone: string | null
          market: string | null
          next_action_at: string | null
          phone_e164: string | null
          phone_raw: string | null
          phone_type: string | null
          postcode: string | null
          region: string | null
          retention_expires_at: string | null
          screened_at: string | null
          screening_run_id: string | null
          screening_status:
            | Database["public"]["Enums"]["screening_status"]
            | null
          status: Database["public"]["Enums"]["lead_status"] | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "lead_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_data_source_id_fkey"
            columns: ["data_source_id"]
            isOneToOne: false
            referencedRelation: "data_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      v_campaign_funnel: {
        Row: {
          campaign_id: string | null
          contacted: number | null
          converted: number | null
          dialable: number | null
          loaded: number | null
          qualified: number | null
          screened_passed: number | null
          worked: number | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      v_source_performance: {
        Row: {
          contacted: number | null
          converted: number | null
          data_source_id: string | null
          fetch_run_count: number | null
          last_fetched_at: string | null
          lawful_basis: string | null
          leads_loaded: number | null
          is_active: boolean | null
          market: string | null
          name: string | null
          qualified: number | null
          screened_passed: number | null
          source_type: string | null
          suppressed: number | null
          worked: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      auth_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      check_rate_limit: {
        Args: { p_bucket: string; p_identifier: string; p_max_hits: number; p_window_seconds: number }
        Returns: boolean
      }
      clock_in: { Args: { p_device?: string; p_ip?: unknown }; Returns: string }
      clock_out: { Args: { p_ip?: unknown }; Returns: string }
      get_agent_scorecard: {
        Args: { p_campaign_id?: string; p_from: string; p_to: string }
        Returns: {
          agent_id: string
          avg_talk_seconds: number
          avg_wrap_seconds: number
          calls_attempted: number
          campaign_id: string
          connects: number
          conversions: number
          day: string
          talk_seconds: number
          unique_leads_touched: number
        }[]
      }
      get_client_agent_activity: {
        Args: { p_client_id?: string; p_from?: string; p_to?: string }
        Returns: Database["public"]["CompositeTypes"]["client_agent_activity_row"][]
        SetofOptions: {
          from: "*"
          to: "client_agent_activity_row"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_client_dispositions: {
        Args: { p_client_id?: string }
        Returns: {
          attempts: number
          campaign_code: string
          campaign_id: string
          campaign_name: string
          category: string
          disposition_code: string
          disposition_label: string
        }[]
      }
      get_client_funnel: {
        Args: { p_client_id?: string }
        Returns: {
          campaign_code: string
          campaign_id: string
          campaign_name: string
          contacted: number
          converted: number
          dialable: number
          loaded: number
          market: string | null
          qualified: number
        }[]
      }
      get_client_leads: {
        Args: { p_client_id?: string }
        Returns: {
          id: string
          campaign_id: string
          campaign_name: string
          campaign_code: string
          first_name: string | null
          last_name: string | null
          company_name: string | null
          job_title: string | null
          phone_e164: string
          email: string | null
          address_line1: string | null
          city: string | null
          region: string | null
          postcode: string | null
          status: string
          screening_status: string
          do_not_call: boolean
          assigned_agent_label: string | null
          attempt_count: number
          custom: Json
          created_at: string
        }[]
      }
      get_client_call_log: {
        Args: { p_client_id?: string }
        Returns: {
          id: string
          lead_id: string
          campaign_id: string
          campaign_code: string
          first_name: string | null
          last_name: string | null
          company_name: string | null
          phone_e164: string
          agent_label: string | null
          attempt_no: number
          disposition_code: string | null
          disposition_label: string | null
          category: string | null
          started_at: string
          ended_at: string | null
          talk_seconds: number | null
          wrap_seconds: number | null
          notes: string | null
        }[]
      }
      get_client_followups: {
        Args: { p_client_id?: string }
        Returns: {
          id: string
          lead_id: string
          campaign_id: string
          campaign_code: string
          first_name: string | null
          last_name: string | null
          company_name: string | null
          phone_e164: string
          agent_label: string | null
          followup_type: string
          due_at: string
          note: string | null
          priority: string
          status: string
          snooze_count: number
        }[]
      }
      is_manager: { Args: never; Returns: boolean }
      my_team_id: { Args: never; Returns: string }
      my_team_members: { Args: never; Returns: string[] }
      promote_unphoned_contact: {
        Args: {
          p_contact_id: string
          p_phone_e164: string
          p_phone_raw: string
        }
        Returns: string
      }
      record_call_attempt: {
        Args: {
          p_disposition_code: string
          p_lead_id: string
          p_next_action_at?: string
          p_notes?: string
          p_wrap_seconds?: number
        }
        Returns: string
      }
      set_aux_state: {
        Args: {
          p_reason?: string
          p_state: Database["public"]["Enums"]["aux_state"]
        }
        Returns: string
      }
      snooze_followup: {
        Args: { p_followup_id: string }
        Returns: {
          assigned_to: string
          campaign_id: string
          completed_at: string | null
          completed_call_id: string | null
          created_at: string
          created_by: string | null
          due_at: string
          due_at_lead_local: string | null
          escalated_at: string | null
          followup_type: string
          id: string
          lead_id: string
          note: string | null
          priority: string
          reminded_at: string | null
          snooze_count: number
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "followups"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      sweep_followups: { Args: never; Returns: undefined }
    }
    Enums: {
      app_role:
        | "super_admin"
        | "ops_manager"
        | "team_lead"
        | "qa"
        | "agent"
        | "client_viewer"
      attendance_status:
        | "present"
        | "late"
        | "absent"
        | "half_day"
        | "on_leave"
        | "holiday"
        | "week_off"
        | "wfh"
      aux_state:
        | "available"
        | "on_call"
        | "after_call_work"
        | "break"
        | "lunch"
        | "prayer"
        | "meeting"
        | "training"
        | "system_issue"
        | "idle"
        | "offline"
      lead_status:
        | "new"
        | "screening"
        | "ready"
        | "assigned"
        | "in_progress"
        | "callback"
        | "contacted"
        | "qualified"
        | "converted"
        | "rejected"
        | "unreachable"
        | "suppressed"
      screening_status:
        | "unscreened"
        | "pending"
        | "passed"
        | "blocked"
        | "expired"
      suppression_reason:
        | "internal_optout"
        | "verbal_dnc"
        | "tps"
        | "ctps"
        | "us_national_dnc"
        | "state_dnc"
        | "client_supplied_dnc"
        | "complaint"
        | "litigator"
        | "deceased"
        | "wrong_number"
        | "invalid_number"
        | "duplicate_entity"
        | "vulnerable_person"
    }
    CompositeTypes: {
      agent_scorecard_row: {
        agent_id: string | null
        avg_talk_seconds: number | null
        avg_wrap_seconds: number | null
        calls_attempted: number | null
        campaign_id: string | null
        connects: number | null
        conversions: number | null
        day: string | null
        talk_seconds: number | null
        unique_leads_touched: number | null
      }
      client_agent_activity_row: {
        day: string | null
        agents_active: number | null
        calls_attempted: number | null
        connects: number | null
        talk_minutes: number | null
        wrap_minutes: number | null
        attendance_minutes: number | null
        productive_minutes: number | null
      }
      client_disposition_row: {
        attempts: number | null
        campaign_code: string | null
        campaign_id: string | null
        campaign_name: string | null
        category: string | null
        disposition_code: string | null
        disposition_label: string | null
      }
      client_funnel_row: {
        campaign_code: string | null
        campaign_id: string | null
        campaign_name: string | null
        contacted: number | null
        converted: number | null
        dialable: number | null
        loaded: number | null
        market: string | null
        qualified: number | null
      }
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "super_admin",
        "ops_manager",
        "team_lead",
        "qa",
        "agent",
        "client_viewer",
      ],
      attendance_status: [
        "present",
        "late",
        "absent",
        "half_day",
        "on_leave",
        "holiday",
        "week_off",
        "wfh",
      ],
      aux_state: [
        "available",
        "on_call",
        "after_call_work",
        "break",
        "lunch",
        "prayer",
        "meeting",
        "training",
        "system_issue",
        "idle",
        "offline",
      ],
      lead_status: [
        "new",
        "screening",
        "ready",
        "assigned",
        "in_progress",
        "callback",
        "contacted",
        "qualified",
        "converted",
        "rejected",
        "unreachable",
        "suppressed",
      ],
      screening_status: [
        "unscreened",
        "pending",
        "passed",
        "blocked",
        "expired",
      ],
      suppression_reason: [
        "internal_optout",
        "verbal_dnc",
        "tps",
        "ctps",
        "us_national_dnc",
        "state_dnc",
        "client_supplied_dnc",
        "complaint",
        "litigator",
        "deceased",
        "wrong_number",
        "invalid_number",
        "duplicate_entity",
        "vulnerable_person",
      ],
    },
  },
} as const
