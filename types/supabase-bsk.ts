// PLACEHOLDER — regenerate via `pnpm db:gen-types` after running migrations.
// Hand-written to keep typecheck green until provisioning is done.
//
// Shape mirrors the canonical output of:
//   supabase gen types typescript --schema bsk
// Matches migration: supabase/migrations/20260525163300_bsk_init.sql

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  bsk: {
    Tables: {
      admin_allowlist: {
        Row: { created_at: string; email: string };
        Insert: { created_at?: string; email: string };
        Update: { created_at?: string; email?: string };
        Relationships: [];
      };
      audit_log: {
        Row: {
          action: string;
          actor_id: string | null;
          created_at: string;
          details: Json | null;
          entity: string;
          entity_id: string | null;
          id: number;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          created_at?: string;
          details?: Json | null;
          entity: string;
          entity_id?: string | null;
          id?: never;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          created_at?: string;
          details?: Json | null;
          entity?: string;
          entity_id?: string | null;
          id?: never;
        };
        Relationships: [];
      };
      checkups: {
        Row: {
          blood_pressure: string | null;
          checkup_date: string;
          checkup_type: string | null;
          conclusion: string | null;
          created_at: string;
          created_by: string | null;
          customer_id: number;
          deleted: boolean;
          diagnosis: string | null;
          doctor_id: number | null;
          heart_beat: string | null;
          height: number | null;
          id: number;
          notes: string | null;
          queue_number: number | null;
          recheck_date: string | null;
          shift_id: number | null;
          status: Database["bsk"]["Enums"]["checkup_status"];
          symptoms: string | null;
          temperature: number | null;
          template_id: number | null;
          updated_at: string;
          weight: number | null;
        };
        Insert: {
          blood_pressure?: string | null;
          checkup_date?: string;
          checkup_type?: string | null;
          conclusion?: string | null;
          created_at?: string;
          created_by?: string | null;
          customer_id: number;
          deleted?: boolean;
          diagnosis?: string | null;
          doctor_id?: number | null;
          heart_beat?: string | null;
          height?: number | null;
          id?: never;
          notes?: string | null;
          queue_number?: number | null;
          recheck_date?: string | null;
          shift_id?: number | null;
          status?: Database["bsk"]["Enums"]["checkup_status"];
          symptoms?: string | null;
          temperature?: number | null;
          template_id?: number | null;
          updated_at?: string;
          weight?: number | null;
        };
        Update: {
          blood_pressure?: string | null;
          checkup_date?: string;
          checkup_type?: string | null;
          conclusion?: string | null;
          created_at?: string;
          created_by?: string | null;
          customer_id?: number;
          deleted?: boolean;
          diagnosis?: string | null;
          doctor_id?: number | null;
          heart_beat?: string | null;
          height?: number | null;
          id?: never;
          notes?: string | null;
          queue_number?: number | null;
          recheck_date?: string | null;
          shift_id?: number | null;
          status?: Database["bsk"]["Enums"]["checkup_status"];
          symptoms?: string | null;
          temperature?: number | null;
          template_id?: number | null;
          updated_at?: string;
          weight?: number | null;
        };
        Relationships: [];
      };
      shifts: {
        Row: { code: string; id: number; sort_order: number };
        Insert: { code: string; id: number; sort_order?: number };
        Update: { code?: string; id?: number; sort_order?: number };
        Relationships: [];
      };
      checkup_templates: {
        Row: {
          created_at: string;
          deleted: boolean;
          fields: Json;
          gender: string;
          id: number;
          name: string;
          photo_num: number;
          title: string | null;
        };
        Insert: {
          created_at?: string;
          deleted?: boolean;
          fields?: Json;
          gender?: string;
          id?: never;
          name: string;
          photo_num?: number;
          title?: string | null;
        };
        Update: {
          created_at?: string;
          deleted?: boolean;
          fields?: Json;
          gender?: string;
          id?: never;
          name?: string;
          photo_num?: number;
          title?: string | null;
        };
        Relationships: [];
      };
      clinic_settings: {
        Row: {
          address: string | null;
          id: boolean;
          name: string | null;
          phone: string | null;
          prefix: string | null;
          updated_at: string;
        };
        Insert: {
          address?: string | null;
          id?: boolean;
          name?: string | null;
          phone?: string | null;
          prefix?: string | null;
          updated_at?: string;
        };
        Update: {
          address?: string | null;
          id?: boolean;
          name?: string | null;
          phone?: string | null;
          prefix?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      customers: {
        Row: {
          address_detail: string | null;
          cccd: string | null;
          created_at: string;
          deleted: boolean;
          dob: string | null;
          first_name: string;
          gender: string | null;
          id: number;
          last_name: string;
          phone: string | null;
          province_code: string | null;
          ward_code: string | null;
        };
        Insert: {
          address_detail?: string | null;
          cccd?: string | null;
          created_at?: string;
          deleted?: boolean;
          dob?: string | null;
          first_name: string;
          gender?: string | null;
          id?: never;
          last_name: string;
          phone?: string | null;
          province_code?: string | null;
          ward_code?: string | null;
        };
        Update: {
          address_detail?: string | null;
          cccd?: string | null;
          created_at?: string;
          deleted?: boolean;
          dob?: string | null;
          first_name?: string;
          gender?: string | null;
          id?: never;
          last_name?: string;
          phone?: string | null;
          province_code?: string | null;
          ward_code?: string | null;
        };
        Relationships: [];
      };
      medicines: {
        Row: {
          company: string | null;
          cost_price: number | null;
          created_at: string;
          deleted: boolean;
          id: number;
          name: string;
          route: string | null;
          sale_price: number;
          unit: string | null;
        };
        Insert: {
          company?: string | null;
          cost_price?: number | null;
          created_at?: string;
          deleted?: boolean;
          id?: never;
          name: string;
          route?: string | null;
          sale_price?: number;
          unit?: string | null;
        };
        Update: {
          company?: string | null;
          cost_price?: number | null;
          created_at?: string;
          deleted?: boolean;
          id?: never;
          name?: string;
          route?: string | null;
          sale_price?: number;
          unit?: string | null;
        };
        Relationships: [];
      };
      services: {
        Row: { created_at: string; deleted: boolean; id: number; name: string; price: number };
        Insert: { created_at?: string; deleted?: boolean; id?: never; name: string; price?: number };
        Update: { created_at?: string; deleted?: boolean; id?: never; name?: string; price?: number };
        Relationships: [];
      };
      provinces: {
        Row: { code: string; name: string };
        Insert: { code: string; name: string };
        Update: { code?: string; name?: string };
        Relationships: [];
      };
      wards: {
        Row: { code: string; name: string; province_code: string };
        Insert: { code: string; name: string; province_code: string };
        Update: { code?: string; name?: string; province_code?: string };
        Relationships: [
          {
            foreignKeyName: "wards_province_code_fkey";
            columns: ["province_code"];
            isOneToOne: false;
            referencedRelation: "provinces";
            referencedColumns: ["code"];
          },
        ];
      };
      doctors: {
        Row: {
          created_at: string;
          deleted: boolean;
          first_name: string;
          id: number;
          last_name: string;
        };
        Insert: {
          created_at?: string;
          deleted?: boolean;
          first_name: string;
          id?: never;
          last_name: string;
        };
        Update: {
          created_at?: string;
          deleted?: boolean;
          first_name?: string;
          id?: never;
          last_name?: string;
        };
        Relationships: [];
      };
      app_users: {
        Row: {
          created_at: string;
          full_name: string | null;
          invited_by: string | null;
          role: Database["bsk"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          full_name?: string | null;
          invited_by?: string | null;
          role: Database["bsk"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          full_name?: string | null;
          invited_by?: string | null;
          role?: Database["bsk"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "app_users_invited_by_fkey";
            columns: ["invited_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "app_users_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      current_role: {
        Args: Record<string, never>;
        Returns: Database["bsk"]["Enums"]["app_role"] | null;
      };
      claim_first_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      log_audit: {
        Args: {
          p_action: string;
          p_entity: string;
          p_entity_id?: string;
          p_details?: Json;
        };
        Returns: undefined;
      };
      immutable_unaccent: {
        Args: { "": string };
        Returns: string;
      };
      search_customers: {
        Args: { q: string };
        Returns: Database["bsk"]["Tables"]["customers"]["Row"][];
      };
      register_checkup: {
        Args: {
          p_customer_id: number;
          p_shift_id: number;
          p_doctor_id?: number;
          p_template_id?: number;
          p_checkup_type?: string;
        };
        Returns: number;
      };
    };
    Enums: {
      app_role: "admin" | "doctor" | "nurse" | "receptionist" | "cashier" | "patient";
      checkup_status: "waiting" | "in_progress" | "done";
    };
    CompositeTypes: Record<string, never>;
  };
};
