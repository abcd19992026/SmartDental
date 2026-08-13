// Hand-authored to match supabase/migrations/*.sql exactly. Once the Supabase project is
// linked, regenerate the authoritative version with `npm run types` (see supabase/README.md) --
// that command overwrites this file.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type UserRole = "super_admin" | "owner" | "receptionist";
export type Gender = "male" | "female" | "other";
export type RecallStatus =
  | "pending"
  | "sent"
  | "contacted"
  | "booked"
  | "completed"
  | "declined"
  | "failed";
export type TemplateCategory = "UTILITY" | "MARKETING";
export type ApprovalStatus = "pending" | "approved" | "rejected";
export type MessageStatus = "queued" | "sent" | "delivered" | "read" | "failed";
export type AppointmentStatus = "scheduled" | "completed" | "no_show" | "cancelled";
export type PaymentMode = "cash" | "upi" | "bank_transfer" | "cheque" | "other";

export interface Database {
  public: {
    Tables: {
      clinics: {
        Row: {
          id: string;
          name: string;
          owner_name: string | null;
          phone: string | null;
          email: string | null;
          city: string | null;
          address: string | null;
          logo_url: string | null;
          waba_phone_number_id: string | null;
          waba_business_id: string | null;
          whatsapp_enabled: boolean;
          send_time: string;
          daily_message_cap: number;
          monthly_message_quota: number;
          plan_name: string;
          plan_started_on: string | null;
          plan_expires_on: string | null;
          is_active: boolean;
          suspension_reason: string | null;
          onboarding_completed: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["clinics"]["Row"]> & { name: string };
        Update: Partial<Database["public"]["Tables"]["clinics"]["Row"]>;
        Relationships: [];
      };
      branches: {
        Row: {
          id: string;
          clinic_id: string;
          name: string;
          address: string | null;
          phone: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["branches"]["Row"]> & {
          clinic_id: string;
          name: string;
        };
        Update: Partial<Database["public"]["Tables"]["branches"]["Row"]>;
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          clinic_id: string | null;
          branch_id: string | null;
          full_name: string | null;
          phone: string | null;
          role: UserRole;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["profiles"]["Row"]> & {
          id: string;
          role: UserRole;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Row"]>;
        Relationships: [];
      };
      treatment_types: {
        Row: {
          id: string;
          clinic_id: string;
          name: string;
          recall_days: number;
          is_active: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["treatment_types"]["Row"]> & {
          clinic_id: string;
          name: string;
          recall_days: number;
        };
        Update: Partial<Database["public"]["Tables"]["treatment_types"]["Row"]>;
        Relationships: [];
      };
      whatsapp_templates: {
        Row: {
          id: string;
          clinic_id: string;
          meta_template_name: string;
          language_code: string;
          category: TemplateCategory | null;
          body_preview: string | null;
          variable_mapping: Json | null;
          approval_status: ApprovalStatus | null;
          is_default: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["whatsapp_templates"]["Row"]> & {
          clinic_id: string;
          meta_template_name: string;
        };
        Update: Partial<Database["public"]["Tables"]["whatsapp_templates"]["Row"]>;
        Relationships: [];
      };
      patients: {
        Row: {
          id: string;
          clinic_id: string;
          branch_id: string;
          name: string;
          mobile: string;
          alt_mobile: string | null;
          age: number | null;
          gender: Gender | null;
          address: string | null;
          notes: string | null;
          do_not_disturb: boolean;
          is_active: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["patients"]["Row"]> & {
          clinic_id: string;
          branch_id: string;
          name: string;
          mobile: string;
        };
        Update: Partial<Database["public"]["Tables"]["patients"]["Row"]>;
        Relationships: [];
      };
      visits: {
        Row: {
          id: string;
          patient_id: string;
          clinic_id: string;
          branch_id: string;
          treatment_type_id: string | null;
          visit_date: string;
          tooth_numbers: string | null;
          notes: string | null;
          amount: number | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["visits"]["Row"]> & {
          patient_id: string;
          clinic_id: string;
          branch_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["visits"]["Row"]>;
        Relationships: [];
      };
      recalls: {
        Row: {
          id: string;
          patient_id: string;
          visit_id: string | null;
          clinic_id: string;
          branch_id: string;
          due_date: string;
          status: RecallStatus;
          attempt_count: number;
          last_attempt_at: string | null;
          next_retry_date: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["recalls"]["Row"]> & {
          patient_id: string;
          clinic_id: string;
          branch_id: string;
          due_date: string;
        };
        Update: Partial<Database["public"]["Tables"]["recalls"]["Row"]>;
        Relationships: [];
      };
      message_log: {
        Row: {
          id: string;
          clinic_id: string;
          recall_id: string | null;
          patient_id: string | null;
          mobile: string | null;
          template_name: string | null;
          wa_message_id: string | null;
          status: MessageStatus | null;
          error_code: string | null;
          error_message: string | null;
          sent_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["message_log"]["Row"]> & { clinic_id: string };
        Update: Partial<Database["public"]["Tables"]["message_log"]["Row"]>;
        Relationships: [];
      };
      appointments: {
        Row: {
          id: string;
          clinic_id: string;
          branch_id: string;
          patient_id: string;
          recall_id: string | null;
          scheduled_at: string;
          status: AppointmentStatus;
          notes: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["appointments"]["Row"]> & {
          clinic_id: string;
          branch_id: string;
          patient_id: string;
          scheduled_at: string;
        };
        Update: Partial<Database["public"]["Tables"]["appointments"]["Row"]>;
        Relationships: [];
      };
      payments: {
        Row: {
          id: string;
          clinic_id: string;
          amount: number;
          paid_on: string;
          period_from: string | null;
          period_to: string | null;
          mode: PaymentMode | null;
          reference: string | null;
          notes: string | null;
          recorded_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["payments"]["Row"]> & {
          clinic_id: string;
          amount: number;
          paid_on: string;
        };
        Update: Partial<Database["public"]["Tables"]["payments"]["Row"]>;
        Relationships: [];
      };
      clinic_usage: {
        Row: {
          id: string;
          clinic_id: string;
          month: string;
          messages_sent: number;
          patients_added: number;
          recalls_created: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["clinic_usage"]["Row"]> & {
          clinic_id: string;
          month: string;
        };
        Update: Partial<Database["public"]["Tables"]["clinic_usage"]["Row"]>;
        Relationships: [];
      };
      activity_log: {
        Row: {
          id: string;
          clinic_id: string | null;
          user_id: string | null;
          action: string;
          entity_type: string | null;
          entity_id: string | null;
          meta: Json;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["activity_log"]["Row"]> & { action: string };
        Update: Partial<Database["public"]["Tables"]["activity_log"]["Row"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_super_admin: { Args: Record<string, never>; Returns: boolean };
      current_clinic_id: { Args: Record<string, never>; Returns: string | null };
      current_user_role: { Args: Record<string, never>; Returns: UserRole | null };
      current_branch_id: { Args: Record<string, never>; Returns: string | null };
      seed_default_treatment_types: { Args: { p_clinic_id: string }; Returns: void };
    };
  };
}
