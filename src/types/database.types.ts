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
            referencedRelation: "patient_billing_summary"
            referencedColumns: ["patient_id"]
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
          included_branches: number
          included_receptionists: number
          is_active: boolean
          letterhead: Json | null
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
          included_branches?: number
          included_receptionists?: number
          is_active?: boolean
          letterhead?: Json | null
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
          included_branches?: number
          included_receptionists?: number
          is_active?: boolean
          letterhead?: Json | null
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
      medicines: {
        Row: {
          clinic_id: string
          created_at: string
          default_dosage: string | null
          default_duration: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          default_dosage?: string | null
          default_duration?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          default_dosage?: string | null
          default_duration?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "medicines_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      message_log: {
        Row: {
          clinic_id: string
          created_at: string
          error_code: string | null
          error_message: string | null
          id: string
          is_test: boolean
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
          is_test?: boolean
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
          is_test?: boolean
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
            referencedRelation: "patient_billing_summary"
            referencedColumns: ["patient_id"]
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
      patient_payments: {
        Row: {
          amount: number
          branch_id: string
          client_request_id: string | null
          clinic_id: string
          created_at: string
          created_by: string
          id: string
          mode: string
          notes: string | null
          paid_on: string
          patient_id: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          amount: number
          branch_id: string
          client_request_id?: string | null
          clinic_id: string
          created_at?: string
          created_by?: string
          id?: string
          mode: string
          notes?: string | null
          paid_on?: string
          patient_id: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          amount?: number
          branch_id?: string
          client_request_id?: string | null
          clinic_id?: string
          created_at?: string
          created_by?: string
          id?: string
          mode?: string
          notes?: string | null
          paid_on?: string
          patient_id?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_payments_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_payments_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_payments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient_billing_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "patient_payments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_payments_voided_by_fkey"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      prescriptions: {
        Row: {
          blood_pressure: string | null
          branch_id: string
          chief_complaint: string | null
          client_request_id: string | null
          clinic_id: string
          created_at: string
          created_by: string
          doctor_name: string
          height: string | null
          id: string
          investigation: Json | null
          medical_history: Json | null
          medications: Json | null
          notes: string | null
          occupation: string | null
          oral_examination: string | null
          past_dental_history: string | null
          patient_id: string
          prescribed_on: string
          provisional_diagnosis: string | null
          spo2: string | null
          teeth: number[] | null
          treatment_plan: string | null
          updated_at: string
          visit_id: string | null
          weight: string | null
        }
        Insert: {
          blood_pressure?: string | null
          branch_id: string
          chief_complaint?: string | null
          client_request_id?: string | null
          clinic_id: string
          created_at?: string
          created_by?: string
          doctor_name: string
          height?: string | null
          id?: string
          investigation?: Json | null
          medical_history?: Json | null
          medications?: Json | null
          notes?: string | null
          occupation?: string | null
          oral_examination?: string | null
          past_dental_history?: string | null
          patient_id: string
          prescribed_on?: string
          provisional_diagnosis?: string | null
          spo2?: string | null
          teeth?: number[] | null
          treatment_plan?: string | null
          updated_at?: string
          visit_id?: string | null
          weight?: string | null
        }
        Update: {
          blood_pressure?: string | null
          branch_id?: string
          chief_complaint?: string | null
          client_request_id?: string | null
          clinic_id?: string
          created_at?: string
          created_by?: string
          doctor_name?: string
          height?: string | null
          id?: string
          investigation?: Json | null
          medical_history?: Json | null
          medications?: Json | null
          notes?: string | null
          occupation?: string | null
          oral_examination?: string | null
          past_dental_history?: string | null
          patient_id?: string
          prescribed_on?: string
          provisional_diagnosis?: string | null
          spo2?: string | null
          teeth?: number[] | null
          treatment_plan?: string | null
          updated_at?: string
          visit_id?: string | null
          weight?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prescriptions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescriptions_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescriptions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescriptions_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient_billing_summary"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "prescriptions_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescriptions_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
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
          avatar_url?: string | null
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
          avatar_url?: string | null
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
          reply_dismissed_at: string | null
          reply_received_at: string | null
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
          reply_dismissed_at?: string | null
          reply_received_at?: string | null
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
          reply_dismissed_at?: string | null
          reply_received_at?: string | null
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
            referencedRelation: "patient_billing_summary"
            referencedColumns: ["patient_id"]
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
          client_request_id: string | null
          clinic_id: string
          created_at: string
          created_by: string | null
          discount_percent: number
          id: string
          net_amount: number | null
          notes: string | null
          patient_id: string
          teeth: number[] | null
          tooth_numbers: string | null
          treatment_type_id: string | null
          updated_at: string
          visit_date: string
        }
        Insert: {
          amount?: number | null
          branch_id: string
          client_request_id?: string | null
          clinic_id: string
          created_at?: string
          created_by?: string | null
          discount_percent?: number
          id?: string
          net_amount?: number | null
          notes?: string | null
          patient_id: string
          teeth?: number[] | null
          tooth_numbers?: string | null
          treatment_type_id?: string | null
          updated_at?: string
          visit_date?: string
        }
        Update: {
          amount?: number | null
          branch_id?: string
          client_request_id?: string | null
          clinic_id?: string
          created_at?: string
          created_by?: string | null
          discount_percent?: number
          id?: string
          net_amount?: number | null
          notes?: string | null
          patient_id?: string
          teeth?: number[] | null
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
            referencedRelation: "patient_billing_summary"
            referencedColumns: ["patient_id"]
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
      patient_billing_summary: {
        Row: {
          clinic_id: string | null
          due: number | null
          patient_id: string | null
          total_billed: number | null
          total_paid: number | null
        }
        Relationships: [
          {
            foreignKeyName: "patients_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      create_branch: {
        Args: {
          p_address?: string
          p_clinic_id: string
          p_name: string
          p_phone?: string
        }
        Returns: string
      }
      create_clinic_with_branches: {
        Args: { p_branches: Json; p_clinic: Json }
        Returns: Json
      }
      create_visit_with_recall: {
        Args: {
          p_amount: number
          p_client_request_id?: string
          p_discount_percent?: number
          p_notes: string
          p_patient_id: string
          p_recall_date_override?: string
          p_teeth?: number[]
          p_tooth_numbers: string
          p_treatment_type_id: string
          p_visit_date: string
        }
        Returns: Json
      }
      current_branch_id: { Args: never; Returns: string }
      current_clinic_id: { Args: never; Returns: string }
      current_user_role: { Args: never; Returns: string }
      delete_clinic_cascade: {
        Args: { p_clinic_id: string }
        Returns: undefined
      }
      find_orphaned_clinics: {
        Args: never
        Returns: {
          detail: string
          email: string
          id: string
          kind: string
          name: string
        }[]
      }
      get_clinics_list: {
        Args: never
        Returns: {
          city: string
          id: string
          is_active: boolean
          messages_sent_this_month: number
          name: string
          owner_name: string
          patients_count: number
          plan_expires_on: string
          whatsapp_configured: boolean
        }[]
      }
      get_platform_overview: { Args: never; Returns: Json }
      increment_clinic_messages_sent: {
        Args: { p_clinic_id: string; p_count?: number; p_month: string }
        Returns: undefined
      }
      is_super_admin: { Args: never; Returns: boolean }
      prune_activity_log: { Args: never; Returns: undefined }
      prune_message_log: { Args: never; Returns: undefined }
      seed_default_medicines: {
        Args: { p_clinic_id: string }
        Returns: undefined
      }
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
