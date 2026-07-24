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
    };
    Enums: {
      app_role: "admin" | "doctor" | "nurse" | "receptionist" | "cashier" | "patient";
    };
    CompositeTypes: Record<string, never>;
  };
};
