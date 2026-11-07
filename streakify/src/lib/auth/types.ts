/**
 * Login system types. Two interchangeable backends:
 *  - SupabaseAuth (real): Supabase Auth + profiles table + Row Level Security + 2FA
 *  - LocalAuth (demo):    in-memory accounts when Supabase isn't connected yet
 */
import type { Repo } from "../data";

export type Role = "admin" | "owner";

export type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  cafeId: string | null; // owners only
  title: string; // "Owner", "Manager"...
};

export type Session = {
  user: AuthUser;
  /** aal2 = passed two-factor this session */
  aal: "aal1" | "aal2";
  mfaEnrolled: boolean;
};

export type SignInResult = { ok: true; next: "done" | "mfa" | "enroll-mfa"; user: AuthUser } | { ok: false; message: string };

export interface AuthBackend {
  readonly kind: "supabase" | "local";
  readonly supportsMfa: boolean;

  signIn(email: string, password: string): Promise<SignInResult>;
  verifyMfa(code: string): Promise<boolean>;
  signOut(): Promise<void>;
  session(): Promise<Session | null>;
  enrollMfa(): Promise<{ factorId: string; qr: string; secret: string }>;
  confirmMfaEnroll(factorId: string, code: string): Promise<boolean>;
  /** Logged-in user sets a new password (after an invite or reset link). */
  setPassword(newPassword: string): Promise<{ ok: boolean; message?: string }>;
  /** Handles the link from an invite/reset email. Returns true when it logged the user in. */
  confirmLink(params: URLSearchParams): Promise<boolean>;

  /** Database access as this user (Row Level Security applies to owners). */
  scopedRepo(): Promise<Repo>;

  // ---- admin-only operations (callers must check the admin first) ----
  inviteOwner(input: { email: string; name: string | null; cafeId: string; title: string }, origin: string): Promise<{ userId: string; link: string }>;
  resetLink(email: string, origin: string): Promise<string | null>;
  changeEmail(userId: string, email: string): Promise<void>;
  removeUser(userId: string): Promise<void>;
  listMembers(cafeId: string): Promise<AuthUser[]>;
  getUser(userId: string): Promise<AuthUser | null>;
  findByEmail(email: string): Promise<AuthUser | null>;
}
