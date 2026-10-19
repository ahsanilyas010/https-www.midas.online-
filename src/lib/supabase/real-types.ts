// Types for the real, multi-tenant Postgres schema (supabase/migrations).
//
// The schema itself is GENERATED — never edit database.generated.ts by hand.
// After adding or changing a migration, apply it (`npx supabase db push`)
// and run `npm run types:gen` to refresh it. This file only adds the small
// helper aliases the rest of the app imports.
import type { Database, Json } from "./database.generated";

export type RealJson = Json;
export type RealDatabase = Database;

export type RealTables<T extends keyof RealDatabase["public"]["Tables"]> = RealDatabase["public"]["Tables"][T]["Row"];
export type RealTablesInsert<T extends keyof RealDatabase["public"]["Tables"]> = RealDatabase["public"]["Tables"][T]["Insert"];
export type RealTablesUpdate<T extends keyof RealDatabase["public"]["Tables"]> = RealDatabase["public"]["Tables"][T]["Update"];
export type RealEnums<T extends keyof RealDatabase["public"]["Enums"]> = RealDatabase["public"]["Enums"][T];
export type RealViews<T extends keyof RealDatabase["public"]["Views"]> = RealDatabase["public"]["Views"][T]["Row"];
