import { z } from "zod";

export const repoBindingSchema = z.object({
  type: z.literal("repo"),
  repo: z.string().min(1),
  branch: z.string().min(1),
  change_name: z.string().min(1)
});

export const urlLinkSchema = z.object({
  type: z.literal("url"),
  url: z.string().url(),
  label: z.string().optional()
});

export const linkedAssetSchema = z.discriminatedUnion("type", [
  repoBindingSchema,
  urlLinkSchema
]);

/** Accepts old data without `type` field and normalizes to RepoBinding */
const legacyRepoBindingSchema = z.object({
  repo: z.string().min(1),
  branch: z.string().min(1),
  change_name: z.string().min(1)
}).transform((v) => ({ ...v, type: "repo" as const }));

export const linkedAssetFlexibleSchema = z.union([
  linkedAssetSchema,
  legacyRepoBindingSchema
]);

/** @deprecated Use linkedAssetSchema or linkedAssetFlexibleSchema instead */
export const repoChangeBindingSchema = z.object({
  repo: z.string().min(1),
  branch: z.string().min(1),
  change_name: z.string().min(1)
});

export const projectRepoBindingSchema = z.object({
  repo: z.string().min(1),
  default_branch: z.string().min(1)
});

export const projectRoleSchema = z.enum(["project_admin", "pm", "reviewer", "viewer"]);
export const globalRoleSchema = z.enum(["platform_admin"]);

export const projectMembershipSchema = z.object({
  project_id: z.string().min(1),
  project_role: projectRoleSchema
});

export const usernameSchema = z
  .string()
  .regex(/^[a-zA-Z0-9_-]{3,32}$/, "Username must be 3-32 characters (letters, digits, _ or -)")
  .transform((v) => v.toLowerCase());

export const createUserSchema = z.object({
  username: usernameSchema,
  email: z.string().email().optional(),
  display_name: z.string().min(1),
  password: z.string().min(8),
  global_roles: z.array(globalRoleSchema).default([]),
  memberships: z.array(projectMembershipSchema).default([])
});

export const registerSchema = z.object({
  username: usernameSchema,
  password: z.string().min(8),
  display_name: z.string().min(1),
  email: z.string().email().optional()
});

export const updateUserSchema = z.object({
  display_name: z.string().min(1).optional(),
  password: z.string().min(8).optional(),
  global_roles: z.array(globalRoleSchema).optional(),
  memberships: z.array(projectMembershipSchema).optional(),
  status: z.enum(["active", "disabled"]).optional()
});

export const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1)
});

export const createProjectSchema = z.object({
  slug: z.string().min(2),
  name: z.string().min(2),
  description: z.string().nullable().optional(),
  is_default: z.boolean().optional()
});

export const updateProjectSchema = createProjectSchema.partial();

export const createChangeSchema = z.object({
  project_id: z.string().min(1).optional(),
  title: z.string().min(3),
  description: z.string().min(3),
  prd_link: z.string().url().nullable().optional(),
  sprint: z.string().nullable().optional(),
  created_by: z.string().email(),
  repo_changes: z.array(linkedAssetFlexibleSchema).default([]),
  review_required: z.boolean().default(true)
});

export const updateChangeSchema = createChangeSchema.partial().extend({
  version: z.number().int().min(1).optional()
});

export const reviewerSchema = z.object({
  user: z.string().min(1),
  role: z.string().min(1),
  assigned_specs: z.array(z.string()).default([])
});

export const startReviewSchema = z.object({
  reviewers: z.array(reviewerSchema).optional()
});

export const reviewerConfigSchema = z.object({
  user: z.string().min(1),
  role: z.string().min(1)
});

export const updateProjectReviewersSchema = z.object({
  reviewers: z.array(reviewerConfigSchema)
});

export const reviewerApproveSpecSchema = z.object({
  reason: z.string().optional()
});

export const createCommentSchema = z.object({
  author: z.string().email(),
  content: z.string().min(1),
  anchor: z.object({
    type: z.literal("heading"),
    heading_path: z.string().min(1),
    line_hint: z.number().int().min(1)
  })
});

export const updateCommentSchema = z.object({
  status: z.enum(["open", "resolved"])
});

export const createApiTokenSchema = z.object({
  name: z.string().min(1)
});

export const syncUploadPayloadSchema = z.object({
  project_id: z.string().min(1).nullable().optional(),
  scope: z.enum(["change", "product"]),
  change_id: z.string().nullable(),
  capability: z.string().min(1),
  repo: z.string().min(1),
  branch: z.string().min(1),
  change_name: z.string().nullable(),
  path: z.string().min(1),
  content: z.string().min(1).max(1024 * 1024),
  content_hash: z.string().min(1),
  commit_sha: z.string().min(1),
  collected_at: z.string().min(1)
});

export const syncBatchPayloadSchema = z.object({
  items: z.array(syncUploadPayloadSchema).min(1)
});

export const bindSchema = z.object({
  project_id: z.string().min(1).optional(),
  change_id: z.string().min(1),
  repo: z.string().min(1),
  branch: z.string().min(1),
  change_name: z.string().min(1)
});

export const reviewerActionSchema = z.object({
  reason: z.string().optional()
});

export const aiBriefSchema = z.object({
  specId: z.string().min(1),
  sessionId: z.string().optional()
});

export const aiCrossSpecSchema = z.object({
  changeId: z.string().min(1)
});
