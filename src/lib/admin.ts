import type { User } from "@supabase/supabase-js";

const DEFAULT_ADMIN_EMAIL_LIST = "NEXT_PUBLIC_ADMIN_EMAILS";

const normalizeRole = (value: unknown) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const normalizeEmail = (value: unknown) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

export const normalizeAdminEmailList = (value?: string) => {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => normalizeEmail(item))
    .filter(Boolean);
};

const getAdminEmails = () => {
  if (typeof window === "undefined") return [];
  const envValue = process.env[DEFAULT_ADMIN_EMAIL_LIST] ?? "";
  return normalizeAdminEmailList(envValue);
};

export const hasEmailAdminFallback = (user: User | null, adminEmails: string[]) => {
  if (!user?.email) return false;
  return adminEmails.includes(normalizeEmail(user.email));
};

const hasRoleAdmin = (user: User | null): boolean => {
  const metadata = user?.user_metadata ?? {};
  const appMetadata = user?.app_metadata ?? {};
  const roleFromMetadata = normalizeRole((metadata as { role?: unknown }).role);
  const roleFromAppMetadata = normalizeRole((appMetadata as { role?: unknown }).role);
  return roleFromMetadata === "admin" || roleFromAppMetadata === "admin";
};

export const isAdminUser = (user: User | null): boolean => {
  if (!user) return false;
  if (hasRoleAdmin(user)) return true;
  return hasEmailAdminFallback(user, getAdminEmails());
};

export const getAdminDisplayName = (user: User | null) => {
  if (!user) return "Admin";
  return user.user_metadata?.name || user.user_metadata?.full_name || user.email || "Admin";
};

