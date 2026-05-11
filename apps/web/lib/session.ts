import {
  authenticateByApiToken,
  authenticateUser,
  ensureBootstrapAdmin,
  getAuthenticatedUserByEmail,
  getAuthenticatedUserFromToken,
  isApiToken,
  type AuthenticatedUser
} from "@spec-center/core";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

export const authCookieName = "openspec-auth";

export const isSecureCookie =
  process.env.OPENSPEC_COOKIE_SECURE != null
    ? process.env.OPENSPEC_COOKIE_SECURE === "true"
    : process.env.NODE_ENV === "production";

export type SessionUser = AuthenticatedUser & {
  label: string;
};

export function isPlatformAdmin(user: Pick<AuthenticatedUser, "global_roles"> | null | undefined) {
  return Boolean(user?.global_roles.includes("platform_admin"));
}

export function isProjectAdmin(
  user: Pick<AuthenticatedUser, "global_roles" | "memberships"> | null | undefined,
  projectId?: string | null
) {
  if (!user) return false;
  if (user.global_roles.includes("platform_admin")) return true;
  if (!projectId) {
    return user.memberships.some((m) => m.project_role === "project_admin");
  }
  return user.memberships.some(
    (m) => m.project_id === projectId && m.project_role === "project_admin"
  );
}

function toLabel(displayName: string, username: string) {
  const source = displayName || username;
  return source
    .split(/\s+/)
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function toSessionUser(user: AuthenticatedUser): SessionUser {
  return {
    ...user,
    label: toLabel(user.display_name, user.username)
  };
}

export async function createLoginSession(username: string, password: string) {
  await ensureBootstrapAdmin();
  return authenticateUser(username, password);
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  await ensureBootstrapAdmin();
  const cookieStore = await cookies();
  const token = cookieStore.get(authCookieName)?.value;
  if (!token) {
    return null;
  }

  try {
    return toSessionUser(await getAuthenticatedUserFromToken(token));
  } catch {
    return null;
  }
}

export async function requireCurrentUser() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

export async function requirePlatformAdmin() {
  const user = await requireCurrentUser();
  if (!isPlatformAdmin(user)) {
    redirect("/");
  }
  return user;
}

export async function requireProjectAdmin() {
  const user = await requireCurrentUser();
  if (!isProjectAdmin(user)) {
    redirect("/");
  }
  return user;
}

async function resolveToken(token: string): Promise<AuthenticatedUser> {
  if (isApiToken(token)) {
    return authenticateByApiToken(token);
  }
  return getAuthenticatedUserFromToken(token);
}

export async function getAuthenticatedUserForRequest(
  request?: Request
): Promise<AuthenticatedUser | null> {
  await ensureBootstrapAdmin();
  const authorization = request?.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    return resolveToken(authorization.slice("Bearer ".length).trim());
  }

  if (request) {
    const cookieHeader = request.headers.get("cookie") ?? "";
    const match = cookieHeader
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${authCookieName}=`));
    if (match) {
      try {
        return await resolveToken(decodeURIComponent(match.slice(authCookieName.length + 1)));
      } catch {
        return null;
      }
    }
  }

  const headerStore = await headers().catch(() => null);
  const headerAuth = headerStore?.get("authorization");
  if (headerAuth?.startsWith("Bearer ")) {
    return resolveToken(headerAuth.slice("Bearer ".length).trim());
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(authCookieName)?.value;
  if (!token) {
    return null;
  }

  try {
    return await resolveToken(token);
  } catch {
    return null;
  }
}

export async function requireAuthenticatedUser(request?: Request) {
  const user = await getAuthenticatedUserForRequest(request);
  if (!user) {
    throw new Error("Authentication required.");
  }
  return user;
}

export async function getSessionUserByEmail(email: string) {
  return toSessionUser(await getAuthenticatedUserByEmail(email));
}
