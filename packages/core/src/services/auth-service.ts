import { createHash, randomBytes } from "node:crypto";
import type {
  ApiToken,
  AuthenticatedUser,
  GlobalRole,
  ProjectMembership,
  ProjectRole,
  User,
  UserStatus
} from "../domain/models";
import { getMongoCollections } from "../data/mongo";
import { nowIso } from "../utils/hash";
import {
  hashPassword,
  signAuthToken,
  verifyAuthToken,
  verifyPassword
} from "../utils/auth";

export type UserProfile = Omit<User, "password_hash">;

function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function normalizeDisplayName(value: string) {
  const displayName = value.trim();
  if (!displayName) {
    throw new Error("Display name is required.");
  }
  return displayName;
}

function normalizeMemberships(memberships: ProjectMembership[]) {
  const normalized = memberships.map((membership) => ({
    project_id: membership.project_id.trim(),
    project_role: membership.project_role
  }));
  const duplicate = normalized.find(
    (membership, index) =>
      normalized.findIndex((entry) => entry.project_id === membership.project_id) !== index
  );
  if (duplicate) {
    throw new Error(`Duplicate membership found for project ${duplicate.project_id}.`);
  }
  return normalized;
}

function sanitizeUser(user: User): UserProfile {
  const { password_hash: _passwordHash, ...profile } = user;
  return profile;
}

function toAuthenticatedUser(user: User): AuthenticatedUser {
  return {
    _id: user._id,
    username: user.username,
    email: user.email,
    display_name: user.display_name,
    global_roles: user.global_roles,
    memberships: user.memberships,
    token_version: user.token_version
  };
}

export async function listUsers(): Promise<UserProfile[]> {
  const collections = await getMongoCollections();
  const users = await collections.users.find().sort({ created_at: 1 }).toArray();
  return users.map(sanitizeUser);
}

export async function getUser(userId: string): Promise<UserProfile | undefined> {
  const collections = await getMongoCollections();
  const user = await collections.users.findOne({ _id: userId });
  return user ? sanitizeUser(user) : undefined;
}

export async function getUserByEmail(email: string): Promise<UserProfile | undefined> {
  const collections = await getMongoCollections();
  const user = await collections.users.findOne({ email: normalizeEmail(email) });
  return user ? sanitizeUser(user) : undefined;
}

export async function getUserByUsername(username: string): Promise<UserProfile | undefined> {
  const collections = await getMongoCollections();
  const user = await collections.users.findOne({ username: normalizeUsername(username) });
  return user ? sanitizeUser(user) : undefined;
}

async function getStoredUserByEmail(email: string): Promise<User | undefined> {
  const collections = await getMongoCollections();
  return (await collections.users.findOne({ email: normalizeEmail(email) })) ?? undefined;
}

async function getStoredUserByUsername(username: string): Promise<User | undefined> {
  const collections = await getMongoCollections();
  return (await collections.users.findOne({ username: normalizeUsername(username) })) ?? undefined;
}

async function getStoredUserById(userId: string): Promise<User | undefined> {
  const collections = await getMongoCollections();
  return (await collections.users.findOne({ _id: userId })) ?? undefined;
}

export async function createUser(input: {
  username: string;
  email?: string;
  display_name: string;
  password: string;
  global_roles?: GlobalRole[];
  memberships?: ProjectMembership[];
}): Promise<UserProfile> {
  const collections = await getMongoCollections();
  const username = normalizeUsername(input.username);
  if (await collections.users.findOne({ username })) {
    throw new Error(`Username already taken: ${username}`);
  }

  const email = input.email ? normalizeEmail(input.email) : undefined;
  if (email && (await collections.users.findOne({ email }))) {
    throw new Error(`Email already in use: ${email}`);
  }

  const timestamp = nowIso();
  const user: User = {
    _id: `user-${username}`,
    username,
    ...(email ? { email } : {}),
    display_name: normalizeDisplayName(input.display_name),
    password_hash: hashPassword(input.password),
    global_roles: input.global_roles ?? [],
    memberships: normalizeMemberships(input.memberships ?? []),
    status: "active",
    token_version: 1,
    created_at: timestamp,
    updated_at: timestamp
  } as User;

  await collections.users.insertOne(user);
  return sanitizeUser(user);
}

export async function updateUser(
  userId: string,
  patch: {
    display_name?: string;
    password?: string;
    global_roles?: GlobalRole[];
    memberships?: ProjectMembership[];
    status?: UserStatus;
  }
): Promise<UserProfile> {
  const collections = await getMongoCollections();
  const current = await getStoredUserById(userId);
  if (!current) {
    throw new Error("User not found.");
  }

  const next: User = {
    ...current,
    display_name:
      patch.display_name === undefined
        ? current.display_name
        : normalizeDisplayName(patch.display_name),
    password_hash:
      patch.password === undefined ? current.password_hash : hashPassword(patch.password),
    global_roles: patch.global_roles ?? current.global_roles,
    memberships:
      patch.memberships === undefined
        ? current.memberships
        : normalizeMemberships(patch.memberships),
    status: patch.status ?? current.status,
    token_version:
      patch.password !== undefined ||
      patch.global_roles !== undefined ||
      patch.memberships !== undefined ||
      patch.status !== undefined
        ? current.token_version + 1
        : current.token_version,
    updated_at: nowIso()
  };

  await collections.users.replaceOne({ _id: userId }, next);
  return sanitizeUser(next);
}

export async function authenticateUser(username: string, password: string) {
  const user = await getStoredUserByUsername(username);
  if (!user || user.status !== "active" || !verifyPassword(password, user.password_hash)) {
    throw new Error("Invalid credentials.");
  }

  const authenticatedUser = toAuthenticatedUser(user);
  return {
    user: sanitizeUser(user),
    token: signAuthToken(authenticatedUser)
  };
}

export async function registerUser(input: {
  username: string;
  password: string;
  display_name: string;
  email?: string;
}): Promise<{ user: UserProfile; token: string }> {
  const profile = await createUser({
    username: input.username,
    password: input.password,
    display_name: input.display_name,
    email: input.email
  });

  const stored = await getStoredUserByUsername(input.username);
  if (!stored) {
    throw new Error("Registration failed.");
  }

  const token = signAuthToken(toAuthenticatedUser(stored));
  return { user: profile, token };
}

export async function getAuthenticatedUserFromToken(token: string): Promise<AuthenticatedUser> {
  const claims = verifyAuthToken(token);
  const user = await getStoredUserById(claims.sub);
  if (!user || user.status !== "active") {
    throw new Error("Authenticated user is unavailable.");
  }
  if (user.token_version !== claims.token_version) {
    throw new Error("Auth token is no longer valid.");
  }
  return toAuthenticatedUser(user);
}

export async function getAuthenticatedUserByEmail(email: string): Promise<AuthenticatedUser> {
  const user = await getStoredUserByEmail(email);
  if (!user || user.status !== "active") {
    throw new Error("Authenticated user is unavailable.");
  }
  return toAuthenticatedUser(user);
}

export async function ensureBootstrapAdmin() {
  const collections = await getMongoCollections();
  const count = await collections.users.countDocuments();
  if (count > 0) {
    await migrateUsersWithoutUsername();
    return;
  }

  const password = process.env.OPENSPEC_BOOTSTRAP_ADMIN_PASSWORD;
  const displayName = process.env.OPENSPEC_BOOTSTRAP_ADMIN_NAME ?? "Platform Admin";
  const email = process.env.OPENSPEC_BOOTSTRAP_ADMIN_EMAIL;
  const username =
    process.env.OPENSPEC_BOOTSTRAP_ADMIN_USERNAME ??
    (email ? email.split("@")[0].replace(/[^a-z0-9_-]/gi, "").toLowerCase() : undefined);

  if (!username || !password) {
    return;
  }

  await createUser({
    username,
    email: email || undefined,
    password,
    display_name: displayName,
    global_roles: ["platform_admin"]
  });
}

export async function migrateUsersWithoutUsername() {
  const collections = await getMongoCollections();
  const usersWithoutUsername = await collections.users
    .find({ username: { $exists: false } } as any)
    .toArray();

  for (const user of usersWithoutUsername) {
    const emailLocal = (user.email ?? user._id)
      .split("@")[0]
      .replace(/[^a-z0-9_-]/gi, "")
      .toLowerCase();

    let candidate = emailLocal || "user";
    let suffix = 0;
    while (await collections.users.findOne({ username: candidate })) {
      suffix++;
      candidate = `${emailLocal}-${suffix}`;
    }

    await collections.users.updateOne(
      { _id: user._id },
      { $set: { username: candidate, updated_at: nowIso() } }
    );
  }
}

const API_TOKEN_PREFIX = "osc_";

function hashApiToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export function isApiToken(token: string): boolean {
  return token.startsWith(API_TOKEN_PREFIX);
}

export async function createApiToken(
  userId: string,
  name: string
): Promise<{ token: ApiToken; rawToken: string }> {
  const collections = await getMongoCollections();
  const user = await collections.users.findOne({ _id: userId });
  if (!user || user.status !== "active") {
    throw new Error("User not found or inactive.");
  }

  const randomHex = randomBytes(20).toString("hex");
  const rawToken = `${API_TOKEN_PREFIX}${randomHex}`;
  const tokenHash = hashApiToken(rawToken);
  const prefix = rawToken.slice(0, 8);
  const timestamp = nowIso();

  const apiToken: ApiToken = {
    _id: `atkn-${randomBytes(8).toString("hex")}`,
    user_id: userId,
    name: name.trim(),
    token_hash: tokenHash,
    prefix,
    last_used_at: null,
    revoked_at: null,
    created_at: timestamp
  };

  await collections.apiTokens.insertOne(apiToken);
  return { token: apiToken, rawToken };
}

export async function listApiTokens(userId: string) {
  const collections = await getMongoCollections();
  const tokens = await collections.apiTokens
    .find({ user_id: userId })
    .sort({ created_at: -1 })
    .toArray();
  return tokens.map(({ token_hash: _, ...rest }) => rest);
}

export async function revokeApiToken(tokenId: string, actorId: string) {
  const collections = await getMongoCollections();
  const token = await collections.apiTokens.findOne({ _id: tokenId });
  if (!token) {
    throw new Error("Token not found.");
  }

  const actor = await collections.users.findOne({ _id: actorId });
  if (token.user_id !== actorId && !actor?.global_roles.includes("platform_admin")) {
    throw new Error("Cannot revoke another user's token.");
  }

  if (token.revoked_at) {
    return;
  }

  await collections.apiTokens.updateOne(
    { _id: tokenId },
    { $set: { revoked_at: nowIso() } }
  );
}

export async function authenticateByApiToken(rawToken: string): Promise<AuthenticatedUser> {
  const collections = await getMongoCollections();
  const tokenHash = hashApiToken(rawToken);
  const apiToken = await collections.apiTokens.findOne({ token_hash: tokenHash });

  if (!apiToken) {
    throw new Error("Invalid API token.");
  }
  if (apiToken.revoked_at) {
    throw new Error("API token has been revoked.");
  }

  const user = await collections.users.findOne({ _id: apiToken.user_id });
  if (!user || user.status !== "active") {
    throw new Error("Token owner is unavailable.");
  }

  collections.apiTokens
    .updateOne({ _id: apiToken._id }, { $set: { last_used_at: nowIso() } })
    .catch(() => {});

  return toAuthenticatedUser(user);
}

export function hasGlobalRole(user: AuthenticatedUser, role: GlobalRole) {
  return user.global_roles.includes(role);
}

export function getProjectMembership(
  user: AuthenticatedUser,
  projectId: string
): ProjectMembership | undefined {
  return user.memberships.find((membership) => membership.project_id === projectId);
}

export function hasProjectRole(
  user: AuthenticatedUser,
  projectId: string,
  roles: ProjectRole[]
) {
  return (
    hasGlobalRole(user, "platform_admin") ||
    roles.includes(getProjectMembership(user, projectId)?.project_role as ProjectRole)
  );
}

export function assertCanManageUsers(user: AuthenticatedUser) {
  if (!hasGlobalRole(user, "platform_admin")) {
    throw new Error("Only platform administrators can manage users.");
  }
}

export function assertProjectReadable(user: AuthenticatedUser, projectId: string) {
  if (!hasProjectRole(user, projectId, ["viewer", "reviewer", "pm", "project_admin"])) {
    throw new Error(`User cannot access project ${projectId}.`);
  }
}

export function assertCanManageProject(user: AuthenticatedUser, projectId: string) {
  if (!hasProjectRole(user, projectId, ["project_admin"])) {
    throw new Error(`User cannot manage project ${projectId}.`);
  }
}

export function assertCanCreateProject(user: AuthenticatedUser) {
  if (!hasGlobalRole(user, "platform_admin")) {
    throw new Error("Only platform administrators can create projects.");
  }
}

export function assertCanAdvanceChange(user: AuthenticatedUser, projectId: string) {
  if (!hasProjectRole(user, projectId, ["pm", "project_admin"])) {
    throw new Error(`User cannot advance changes in project ${projectId}.`);
  }
}

export function assertCanComment(user: AuthenticatedUser, projectId: string) {
  if (!hasProjectRole(user, projectId, ["reviewer", "pm", "project_admin"])) {
    throw new Error(`User cannot comment in project ${projectId}.`);
  }
}

export function assertCanManageReviewers(user: AuthenticatedUser, projectId: string) {
  if (!hasProjectRole(user, projectId, ["pm", "project_admin"])) {
    throw new Error(`User cannot manage reviewers in project ${projectId}.`);
  }
}

export function assertCanReviewAs(
  actor: AuthenticatedUser,
  projectId: string,
  reviewerUser: string
) {
  if (actor.username !== reviewerUser && !hasGlobalRole(actor, "platform_admin")) {
    throw new Error("Reviewer actions can only be performed by the assigned authenticated user.");
  }
  if (!hasProjectRole(actor, projectId, ["reviewer", "pm", "project_admin"])) {
    throw new Error(`User cannot review in project ${projectId}.`);
  }
}
