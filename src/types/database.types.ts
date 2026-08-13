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
    PostgrestVersion: "14.15"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          action: string
          clinic_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          meta: Json
          user_id: string | null
        }
        Insert: {
          action: string
          clinic_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          meta?: Json
          user_id?: string | null
        }
        Update: {
          action?: string
          clinic_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          meta?: Json
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          branch_id: string
          clinic_id: string
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          patient_id: string
          recall_id: string | null
          scheduled_at: string
          status: string
          updated_at: string
        }
        Insert: {
          branch_id: string
          clinic_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          patient_id: string
          recall_id?: string | null
          scheduled_at: string
          status?: string
          updated_at?: string
        }
        Update: {
          branch_id?: string
          clinic_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          patient_id?: string
          recall_id?: string | null
          scheduled_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_recall_id_fkey"
            columns: ["recall_id"]
            isOneToOne: false
            referencedRelation: "recalls"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          address: string | null
          clinic_id: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          clinic_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          clinic_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "branches_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_usage: {
        Row: {
          clinic_id: string
          created_at: string
          id: string
          messages_sent: number
          month: string
          patients_added: number
          recalls_created: number
          updated_at: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          id?: string
          messages_sent?: number
          month: string
          patients_added?: number
          recalls_created?: number
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          id?: string
          messages_sent?: number
          month?: string
          patients_added?: number
          recalls_created?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinic_usage_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      clinics: {
        Row: {
          address: string | null
          city: string | null
          created_at: string
          daily_message_cap: number
          email: string | null
          id: string
          is_active: boolean
          logo_url: string | null
          monthly_message_quota: number
          name: string
          onboarding_completed: boolean
          owner_name: string | null
          phone: string | null
          plan_expires_on: string | null
          plan_name: string
          plan_started_on: string | null
          send_time: string
          suspension_reason: string | null
          updated_at: string
          waba_business_id: string | null
          waba_phone_number_id: string | null
          whatsapp_enabled: boolean
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string
          daily_message_cap?: number
          email?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          monthly_message_quota?: number
          name: string
          onboarding_completed?: boolean
          owner_name?: string | null
          phone?: string | null
          plan_expires_on?: string | null
          plan_name?: string
          plan_started_on?: string | null
          send_time?: string
          suspension_reason?: string | null
          updated_at?: string
          waba_business_id?: string | null
          waba_phone_number_id?: string | null
          whatsapp_enabled?: boolean
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string
          daily_message_cap?: number
          email?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          monthly_message_quota?: number
          name?: string
          onboarding_completed?: boolean
          owner_name?: string | null
          phone?: string | null
          plan_expires_on?: string | null
          plan_name?: string
          plan_started_on?: string | null
          send_time?: string
          suspension_reason?: string | null
          updated_at?: string
          waba_business_id?: string | null
          waba_phone_number_id?: string | null
          whatsapp_enabled?: boolean
        }
        Relationships: []
      }
      message_log: {
        Row: {
          clinic_id: string
          created_at: string
          error_code: string | null
          error_message: string | null
          id: string
          mobile: string | null
          patient_id: string | null
          recall_id: string | null
          sent_at: string | null
          status: string | null
          template_name: string | null
          updated_at: string
          wa_message_id: string | null
        }
        Insert: {
          clinic_id: string
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          mobile?: string | null
          patient_id?: string | null
          recall_id?: string | null
          sent_at?: string | null
          status?: string | null
          template_name?: string | null
          updated_at?: string
          wa_message_id?: string | null
        }
        Update: {
          clinic_id?: string
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          mobile?: string | null
          patient_id?: string | null
          recall_id?: string | null
          sent_at?: string | null
          status?: string | null
          template_name?: string | null
          updated_at?: string
          wa_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_log_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_log_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_log_recall_id_fkey"
            columns: ["recall_id"]
            isOneToOne: false
            referencedRelation: "recalls"
            referencedColumns: ["id"]
          },
        ]
      }
      patients: {
        Row: {
          address: string | null
          age: number | null
          alt_mobile: string | null
          branch_id: string
          clinic_id: string
          created_at: string
          created_by: string | null
          do_not_disturb: boolean
          gender: string | null
          id: string
          is_active: boolean
          mobile: string
          name: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          age?: number | null
          alt_mobile?: string | null
          branch_id: string
          clinic_id: string
          created_at?: string
          created_by?: string | null
          do_not_disturb?: boolean
          gender?: string | null
          id?: string
          is_active?: boolean
          mobile: string
          name: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          age?: number | null
          alt_mobile?: string | null
          branch_id?: string
          clinic_id?: string
          created_at?: string
          created_by?: string | null
          do_not_disturb?: boolean
          gender?: string | null
          id?: string
          is_active?: boolean
          mobile?: string
          name?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patients_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patients_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patients_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          clinic_id: string
          created_at: string
          id: string
          mode: string | null
          notes: string | null
          paid_on: string
          period_from: string | null
          period_to: string | null
          recorded_by: string | null
          reference: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          clinic_id: string
          created_at?: string
          id?: string
          mode?: string | null
          notes?: string | null
          paid_on: string
          period_from?: string | null
          period_to?: string | null
          recorded_by?: string | null
          reference?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          clinic_id?: string
          created_at?: string
          id?: string
          mode?: string | null
          notes?: string | null
          paid_on?: string
          period_from?: string | null
          period_to?: string | null
          recorded_by?: string | null
          reference?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          branch_id: string | null
          clinic_id: string | null
          created_at: string
          full_name: string | null
          id: string
          is_active: boolean
          phone: string | null
          role: string
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          clinic_id?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          is_active?: boolean
          phone?: string | null
          role: string
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          clinic_id?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          phone?: string | null
          role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      recalls: {
        Row: {
          attempt_count: number
          branch_id: string
          clinic_id: string
          created_at: string
          due_date: string
          id: string
          last_attempt_at: string | null
          next_retry_date: string | null
          notes: string | null
          patient_id: string
          status: string
          updated_at: string
          visit_id: string | null
        }
        Insert: {
          attempt_count?: number
          branch_id: string
          clinic_id: string
          created_at?: string
          due_date: string
          id?: string
          last_attempt_at?: string | null
          next_retry_date?: string | null
          notes?: string | null
          patient_id: string
          status?: string
          updated_at?: string
          visit_id?: string | null
        }
        Update: {
          attempt_count?: number
          branch_id?: string
          clinic_id?: string
          created_at?: string
          due_date?: string
          id?: string
          last_attempt_at?: string | null
          next_retry_date?: string | null
          notes?: string | null
          patient_id?: string
          status?: string
          updated_at?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recalls_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recalls_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recalls_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recalls_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      treatment_types: {
        Row: {
          clinic_id: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          recall_days: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          recall_days: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          recall_days?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "treatment_types_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      visits: {
        Row: {
          amount: number | null
          branch_id: string
          clinic_id: string
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          patient_id: string
          tooth_numbers: string | null
          treatment_type_id: string | null
          updated_at: string
          visit_date: string
        }
        Insert: {
          amount?: number | null
          branch_id: string
          clinic_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          patient_id: string
          tooth_numbers?: string | null
          treatment_type_id?: string | null
          updated_at?: string
          visit_date?: string
        }
        Update: {
          amount?: number | null
          branch_id?: string
          clinic_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          patient_id?: string
          tooth_numbers?: string | null
          treatment_type_id?: string | null
          updated_at?: string
          visit_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "visits_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_treatment_type_id_fkey"
            columns: ["treatment_type_id"]
            isOneToOne: false
            referencedRelation: "treatment_types"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_templates: {
        Row: {
          approval_status: string | null
          body_preview: string | null
          category: string | null
          clinic_id: string
          created_at: string
          id: string
          is_default: boolean
          language_code: string
          meta_template_name: string
          updated_at: string
          variable_mapping: Json | null
        }
        Insert: {
          approval_status?: string | null
          body_preview?: string | null
          category?: string | null
          clinic_id: string
          created_at?: string
          id?: string
          is_default?: boolean
          language_code?: string
          meta_template_name: string
          updated_at?: string
          variable_mapping?: Json | null
        }
        Update: {
          approval_status?: string | null
          body_preview?: string | null
          category?: string | null
          clinic_id?: string
          created_at?: string
          id?: string
          is_default?: boolean
          language_code?: string
          meta_template_name?: string
          updated_at?: string
          variable_mapping?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_templates_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_branch_id: { Args: never; Returns: string }
      current_clinic_id: { Args: never; Returns: string }
      current_user_role: { Args: never; Returns: string }
      is_super_admin: { Args: never; Returns: boolean }
      seed_default_treatment_types: {
        Args: { p_clinic_id: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
