import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { AuthenticatedUser, GlobalRole, ProjectMembership } from "../domain/models";

const PASSWORD_ALGO = "scrypt";
const DEFAULT_JWT_TTL_SECONDS = 60 * 60 * 8;

type JwtPayload = {
  sub: string;
  username: string;
  email?: string;
  display_name: string;
  global_roles: GlobalRole[];
  memberships: ProjectMembership[];
  token_version: number;
  exp: number;
  iat: number;
};

export type AuthTokenClaims = JwtPayload;

function base64UrlEncode(value: string | Buffer) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${padding}`, "base64").toString("utf8");
}

function getJwtSecret() {
  const secret = process.env.OPENSPEC_JWT_SECRET ?? process.env.JWT_SECRET;
  if (!secret && process.env.NODE_ENV !== "production") {
    return "openspec-dev-secret";
  }
  if (!secret) {
    throw new Error("Missing OPENSPEC_JWT_SECRET configuration.");
  }
  return secret;
}

export function getJwtTtlSeconds() {
  const raw = process.env.OPENSPEC_JWT_TTL_SECONDS ?? process.env.JWT_TTL_SECONDS;
  const parsed = raw ? Number(raw) : DEFAULT_JWT_TTL_SECONDS;
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("Invalid OPENSPEC_JWT_TTL_SECONDS configuration.");
  }
  return parsed;
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${PASSWORD_ALGO}:${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string) {
  const [algorithm, salt, expectedHash] = storedHash.split(":");
  if (algorithm !== PASSWORD_ALGO || !salt || !expectedHash) {
    return false;
  }

  const actualHash = scryptSync(password, salt, 64).toString("hex");
  return timingSafeEqual(Buffer.from(actualHash, "hex"), Buffer.from(expectedHash, "hex"));
}

export function signAuthToken(user: AuthenticatedUser) {
  const now = Math.floor(Date.now() / 1000);
  const payload: JwtPayload = {
    sub: user._id,
    username: user.username,
    email: user.email,
    display_name: user.display_name,
    global_roles: user.global_roles,
    memberships: user.memberships,
    token_version: user.token_version,
    iat: now,
    exp: now + getJwtTtlSeconds()
  };
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const input = `${encodedHeader}.${encodedPayload}`;
  const signature = createHmac("sha256", getJwtSecret()).update(input).digest();
  return `${input}.${base64UrlEncode(signature)}`;
}

export function verifyAuthToken(token: string): AuthTokenClaims {
  const [encodedHeader, encodedPayload, encodedSignature] = token.split(".");
  if (!encodedHeader || !encodedPayload || !encodedSignature) {
    throw new Error("Invalid auth token format.");
  }

  const input = `${encodedHeader}.${encodedPayload}`;
  const expected = createHmac("sha256", getJwtSecret()).update(input).digest();
  const actual = Buffer.from(
    encodedSignature.replace(/-/g, "+").replace(/_/g, "/"),
    "base64"
  );

  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new Error("Invalid auth token signature.");
  }

  const payload = JSON.parse(base64UrlDecode(encodedPayload)) as JwtPayload;
  if (!payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) {
    throw new Error("Auth token expired.");
  }

  return payload;
}
