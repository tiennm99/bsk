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
        Args: { p_user_id: string };
        Returns: boolean;
      };
    };
    Enums: {
      app_role: "admin" | "doctor" | "nurse" | "receptionist" | "cashier" | "patient";
    };
    CompositeTypes: Record<string, never>;
  };
};
