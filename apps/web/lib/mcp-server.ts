import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  queryRag,
  searchCenter,
  listChanges,
  getChange,
  createChange,
  updateChange,
  deleteChange,
  deleteProductSpec,
  listSpecsForChange,
  listProductSpecs,
  getSpec,
  getSpecSnapshots,
  getSnapshot,
  getOverviewMetrics,
  listProjectCatalog,
  getActiveProject,
  syncUpload,
  syncBatch,
  getSyncStatus,
  updateSpec,
  deleteChangeSpec,
  sha256,
  upsertChangesFromPayload,
  type AuthenticatedUser,
  type ImportPayload
} from "@spec-center/core";

function resolveProjectId(
  explicitId: string | undefined,
  user: AuthenticatedUser
): string | undefined {
  if (explicitId) return explicitId;
  return user.memberships[0]?.project_id;
}

export function createMcpServer(user: AuthenticatedUser) {
  const server = new McpServer({
    name: "spec-center",
    version: "0.1.0"
  });

  // ── Tool: ask ──────────────────────────────────────────────────────────
  server.registerTool(
    "ask",
    {
      title: "Ask Spec Center",
      description:
        "Ask a question about the project. Uses RAG (vector search + LLM) to answer based on specs, changes and review comments.",
      inputSchema: {
        question: z.string().describe("The question to ask"),
        project_id: z
          .string()
          .optional()
          .describe("Project ID. Uses the user's default project if omitted.")
      }
    },
    async ({ question, project_id }) => {
      const projectId = resolveProjectId(project_id, user);
      if (!projectId) {
        return {
          content: [{ type: "text", text: "Error: no project context available." }],
          isError: true
        };
      }
      try {
        const { answer, sources } = await queryRag(question, [projectId]);
        const sourcesText =
          sources.length > 0
            ? "\n\nSources:\n" +
              sources.map((s, i) => `[${i + 1}] ${s.title} (${s.type}) ${s.href}`).join("\n")
            : "";
        return { content: [{ type: "text", text: answer + sourcesText }] };
      } catch (err) {
        return {
          content: [
            { type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }
          ],
          isError: true
        };
      }
    }
  );

  // ── Tool: search ───────────────────────────────────────────────────────
  server.registerTool(
    "search",
    {
      title: "Search Spec Center",
      description:
        "Full-text search across changes, product specs and review sessions.",
      inputSchema: {
        query: z.string().describe("Search query"),
        project_id: z
          .string()
          .optional()
          .describe("Project ID. Uses the user's default project if omitted.")
      }
    },
    async ({ query, project_id }) => {
      const projectId = resolveProjectId(project_id, user);
      try {
        const results = await searchCenter(query, projectId);
        if (results.length === 0) {
          return { content: [{ type: "text", text: "No results found." }] };
        }
        const text = results
          .map(
            (r) =>
              `[${r.kind}] ${r.title}\n  ${r.subtitle}\n  ${r.href}${r.matchSnippet ? `\n  Snippet: ${r.matchSnippet}` : ""}`
          )
          .join("\n\n");
        return { content: [{ type: "text", text: text }] };
      } catch (err) {
        return {
          content: [
            { type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }
          ],
          isError: true
        };
      }
    }
  );

  // ── Tool: list_changes ─────────────────────────────────────────────────
  server.registerTool(
    "list_changes",
    {
      title: "List Changes",
      description: "List all changes in a project, ordered by last updated.",
      inputSchema: {
        project_id: z
          .string()
          .optional()
          .describe("Project ID. Uses the user's default project if omitted.")
      }
    },
    async ({ project_id }) => {
      const projectId = resolveProjectId(project_id, user);
      try {
        const changes = await listChanges(projectId);
        if (changes.length === 0) {
          return { content: [{ type: "text", text: "No changes found." }] };
        }
        const text = changes
          .map(
            (c) =>
              `- [${c.status}] ${c.title} (${c._id})\n  ${c.description.slice(0, 120)}${c.description.length > 120 ? "…" : ""}\n  Updated: ${c.updated_at}`
          )
          .join("\n\n");
        return { content: [{ type: "text", text: text }] };
      } catch (err) {
        return {
          content: [
            { type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }
          ],
          isError: true
        };
      }
    }
  );

  // ── Tool: create_change ──────────────────────────────────────────────────
  server.registerTool(
    "create_change",
    {
      title: "Create Change",
      description:
        "Create a new change (draft) in a project. Returns the created change with its generated ID.",
      inputSchema: {
        title: z.string().min(3).describe("Change title (min 3 chars)"),
        description: z
          .string()
          .min(3)
          .describe("Change description (min 3 chars)"),
        project_id: z
          .string()
          .optional()
          .describe("Project ID. Uses the user's default project if omitted."),
        prd_link: z
          .string()
          .url()
          .nullable()
          .optional()
          .describe("Optional link to a PRD document"),
        sprint: z
          .string()
          .nullable()
          .optional()
          .describe("Optional sprint identifier"),
        repo_changes: z
          .array(
            z.discriminatedUnion("type", [
              z.object({
                type: z.literal("repo"),
                repo: z.string().describe("Repository name"),
                branch: z.string().describe("Branch name"),
                change_name: z.string().describe("Change directory/folder name in the repo")
              }),
              z.object({
                type: z.literal("url"),
                url: z.string().url().describe("External URL"),
                label: z.string().optional().describe("Display label for the link")
              })
            ])
          )
          .optional()
          .describe("Optional list of linked assets (repo bindings or URL links)"),
        review_required: z
          .boolean()
          .optional()
          .describe("Whether the change requires review (defaults to true)")
      }
    },
    async ({ title, description, project_id, prd_link, sprint, repo_changes, review_required }) => {
      const projectId = resolveProjectId(project_id, user);
      if (!projectId) {
        return {
          content: [{ type: "text", text: "Error: no project context available." }],
          isError: true
        };
      }
      try {
        const change = await createChange({
          actor: user,
          project_id: projectId,
          title,
          description,
          prd_link: prd_link ?? null,
          sprint: sprint ?? null,
          created_by: user.email ?? user.username,
          repo_changes: repo_changes ?? [],
          review_required: review_required ?? true
        });
        const text = [
          `Change created successfully.`,
          ``,
          `ID: ${change._id}`,
          `Title: ${change.title}`,
          `Status: ${change.status}`,
          `Project: ${change.project_id}`,
          `Created by: ${change.created_by}`,
          `Review required: ${change.review_required}`,
          `Created at: ${change.created_at}`
        ].join("\n");
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return {
          content: [
            { type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }
          ],
          isError: true
        };
      }
    }
  );

  // ── Tool: get_change ───────────────────────────────────────────────────
  server.registerTool(
    "get_change",
    {
      title: "Get Change Details",
      description:
        "Get full details of a change including its associated spec units.",
      inputSchema: {
        change_id: z.string().describe("The change ID")
      }
    },
    async ({ change_id }) => {
      try {
        const change = await getChange(change_id);
        if (!change) {
          return {
            content: [{ type: "text", text: `Change ${change_id} not found.` }],
            isError: true
          };
        }
        const specs = await listSpecsForChange(change_id);
        const specsText =
          specs.length > 0
            ? "\n\nSpecs:\n" +
              specs
                .map(
                  (s) =>
                    `  - ${s.capability} (${s._id}) [${s.scope}] sync=${s.sync_status} review=${s.review_status ?? "n/a"}`
                )
                .join("\n")
            : "\n\nNo specs attached.";
        const text =
          `Title: ${change.title}\nID: ${change._id}\nStatus: ${change.status}\nDescription: ${change.description}\nCreated by: ${change.created_by}\nCreated: ${change.created_at}\nUpdated: ${change.updated_at}` +
          specsText;
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return {
          content: [
            { type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }
          ],
          isError: true
        };
      }
    }
  );

  // ── Tool: update_change ──────────────────────────────────────────────────
  server.registerTool(
    "update_change",
    {
      title: "Update Change",
      description:
        "Update fields of an existing change. Supports title, description, sprint, prd_link, and review_required.",
      inputSchema: {
        change_id: z.string().describe("The change ID to update"),
        title: z.string().min(3).optional().describe("New title (min 3 chars)"),
        description: z
          .string()
          .min(3)
          .optional()
          .describe("New description (min 3 chars)"),
        sprint: z
          .string()
          .nullable()
          .optional()
          .describe("Sprint identifier (null to clear)"),
        prd_link: z
          .string()
          .url()
          .nullable()
          .optional()
          .describe("PRD link URL (null to clear)"),
        review_required: z
          .boolean()
          .optional()
          .describe("Whether the change requires review")
      }
    },
    async ({ change_id, ...fields }) => {
      try {
        const patch: Record<string, unknown> = {};
        if (fields.title !== undefined) patch.title = fields.title;
        if (fields.description !== undefined) patch.description = fields.description;
        if (fields.sprint !== undefined) patch.sprint = fields.sprint;
        if (fields.prd_link !== undefined) patch.prd_link = fields.prd_link;
        if (fields.review_required !== undefined) patch.review_required = fields.review_required;

        const updated = await updateChange(change_id, patch, user);
        const text = [
          `Change updated successfully.`,
          ``,
          `ID: ${updated._id}`,
          `Title: ${updated.title}`,
          `Status: ${updated.status}`,
          `Version: ${updated.version}`,
          `Updated at: ${updated.updated_at}`
        ].join("\n");
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return {
          content: [
            { type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }
          ],
          isError: true
        };
      }
    }
  );

  // ── Tool: delete_change ──────────────────────────────────────────────────
  server.registerTool(
    "delete_change",
    {
      title: "Delete Change",
      description:
        "Delete a draft change (soft delete). Only changes in draft status can be deleted.",
      inputSchema: {
        change_id: z.string().describe("The change ID to delete")
      }
    },
    async ({ change_id }) => {
      try {
        await deleteChange(change_id, user);
        return {
          content: [{ type: "text", text: `Change ${change_id} deleted successfully.` }]
        };
      } catch (err) {
        return {
          content: [
            { type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }
          ],
          isError: true
        };
      }
    }
  );

  // ── Tool: delete_product_spec ─────────────────────────────────────────
  server.registerTool(
    "delete_product_spec",
    {
      title: "Delete Product Spec",
      description:
        "Delete a product spec and its associated snapshots permanently.",
      inputSchema: {
        spec_id: z.string().describe("The product spec ID to delete")
      }
    },
    async ({ spec_id }) => {
      try {
        await deleteProductSpec(spec_id, user);
        return {
          content: [{ type: "text", text: `Product spec ${spec_id} deleted successfully.` }]
        };
      } catch (err) {
        return {
          content: [
            { type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }
          ],
          isError: true
        };
      }
    }
  );

  // ── Tool: list_product_specs ───────────────────────────────────────────
  server.registerTool(
    "list_product_specs",
    {
      title: "List Product Specs",
      description: "List all product-scope spec units in a project.",
      inputSchema: {
        project_id: z
          .string()
          .optional()
          .describe("Project ID. Uses the user's default project if omitted.")
      }
    },
    async ({ project_id }) => {
      const projectId = resolveProjectId(project_id, user);
      try {
        const specs = await listProductSpecs(projectId);
        if (specs.length === 0) {
          return { content: [{ type: "text", text: "No product specs found." }] };
        }
        const text = specs
          .map(
            (s) =>
              `- ${s.capability} (${s._id})\n  Path: ${s.path}\n  Sync: ${s.sync_status}`
          )
          .join("\n\n");
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return {
          content: [
            { type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }
          ],
          isError: true
        };
      }
    }
  );

  // ── Tool: get_spec ─────────────────────────────────────────────────────
  server.registerTool(
    "get_spec",
    {
      title: "Get Spec Details",
      description:
        "Get a spec unit's details and its latest snapshot content.",
      inputSchema: {
        spec_id: z.string().describe("The spec unit ID")
      }
    },
    async ({ spec_id }) => {
      try {
        const spec = await getSpec(spec_id);
        if (!spec) {
          return {
            content: [{ type: "text", text: `Spec ${spec_id} not found.` }],
            isError: true
          };
        }
        const snapshots = await getSpecSnapshots(spec_id);
        const latest = snapshots[0];
        const header = [
          `ID: ${spec._id}`,
          `Capability: ${spec.capability}`,
          `Scope: ${spec.scope}`,
          `Project: ${spec.project_id}`,
          `Change: ${spec.change_id ?? "(none)"}`,
          `Change name: ${spec.change_name ?? "(none)"}`,
          `Repo: ${spec.repo}`,
          `Branch: ${spec.branch}`,
          `Path: ${spec.path}`,
          `Owner: ${spec.owner_role}`,
          `Sync: ${spec.sync_status}`,
          `Review: ${spec.review_status ?? "n/a"}`,
          `Last synced: ${spec.last_synced_at ?? "never"}`,
          `Snapshots: ${snapshots.length}`
        ].join("\n");
        const content = latest
          ? `\n\n--- Latest snapshot (${latest._id}, ${latest.type}) ---\n${latest.content}`
          : "\n\nNo snapshots available.";
        return { content: [{ type: "text", text: header + content }] };
      } catch (err) {
        return {
          content: [
            { type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }
          ],
          isError: true
        };
      }
    }
  );

  // ── Tool: update_spec ──────────────────────────────────────────────────
  server.registerTool(
    "update_spec",
    {
      title: "Update Spec",
      description:
        "Update a spec unit's metadata and/or content. Any combination of fields can be updated in a single call.",
      inputSchema: {
        spec_id: z.string().describe("The spec unit ID to update"),
        capability: z
          .string()
          .min(1)
          .optional()
          .describe("New capability name"),
        repo: z
          .string()
          .optional()
          .describe("New repository name"),
        branch: z
          .string()
          .optional()
          .describe("New branch name"),
        change_name: z
          .string()
          .nullable()
          .optional()
          .describe("New change directory name (null for product specs)"),
        path: z
          .string()
          .optional()
          .describe("New file path"),
        owner_role: z
          .string()
          .optional()
          .describe("New owner role (e.g. 'engineering', 'product')"),
        sync_status: z
          .enum(["pending", "synced", "outdated"])
          .optional()
          .describe("New sync status"),
        review_status: z
          .enum(["not_in_review", "in_review", "approved", "changes_requested"])
          .nullable()
          .optional()
          .describe("New review status (null for product specs)"),
        content: z
          .string()
          .min(1)
          .max(1024 * 1024)
          .optional()
          .describe("New spec markdown content. If provided, a new snapshot is created.")
      }
    },
    async ({ spec_id, content, ...fields }) => {
      try {
        const spec = await getSpec(spec_id);
        if (!spec) {
          return {
            content: [{ type: "text", text: `Error: Spec ${spec_id} not found.` }],
            isError: true
          };
        }

        const metaPatch: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(fields)) {
          if (value !== undefined) metaPatch[key] = value;
        }

        if (content !== undefined) {
          const result = await syncUpload({
            project_id: spec.project_id,
            scope: spec.scope,
            change_id: spec.change_id,
            capability: (fields.capability ?? spec.capability),
            repo: (fields.repo ?? spec.repo),
            branch: (fields.branch ?? spec.branch),
            change_name: (fields.change_name !== undefined ? fields.change_name : spec.change_name),
            path: (fields.path ?? spec.path),
            content,
            content_hash: sha256(content),
            commit_sha: "mcp-update",
            collected_at: new Date().toISOString()
          });

          if (Object.keys(metaPatch).length > 0) {
            await updateSpec(spec_id, metaPatch, user);
          }

          return {
            content: [
              {
                type: "text",
                text: `Spec updated.\n\nID: ${spec_id}\nContent: ${result.status}\nMetadata fields updated: ${Object.keys(metaPatch).join(", ") || "(none)"}`
              }
            ]
          };
        }

        if (Object.keys(metaPatch).length === 0) {
          return {
            content: [{ type: "text", text: "No fields to update. Provide at least one field to change." }],
            isError: true
          };
        }

        const updated = await updateSpec(spec_id, metaPatch, user);
        const text = [
          `Spec metadata updated.`,
          "",
          `ID: ${updated._id}`,
          `Capability: ${updated.capability}`,
          `Repo: ${updated.repo}`,
          `Branch: ${updated.branch}`,
          `Change name: ${updated.change_name ?? "(none)"}`,
          `Path: ${updated.path}`,
          `Owner: ${updated.owner_role}`,
          `Scope: ${updated.scope}`,
          `Sync: ${updated.sync_status}`,
          `Review: ${updated.review_status ?? "n/a"}`
        ].join("\n");
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return {
          content: [
            { type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }
          ],
          isError: true
        };
      }
    }
  );

  // ── Tool: get_snapshot ─────────────────────────────────────────────────
  server.registerTool(
    "get_snapshot",
    {
      title: "Get Snapshot Content",
      description: "Get the full content of a specific snapshot.",
      inputSchema: {
        snapshot_id: z.string().describe("The snapshot ID")
      }
    },
    async ({ snapshot_id }) => {
      try {
        const snapshot = await getSnapshot(snapshot_id);
        if (!snapshot) {
          return {
            content: [{ type: "text", text: `Snapshot ${snapshot_id} not found.` }],
            isError: true
          };
        }
        const header = `Snapshot ID: ${snapshot._id}\nSpec ID: ${snapshot.spec_id}\nType: ${snapshot.type}\nCreated: ${snapshot.created_at}`;
        return {
          content: [{ type: "text", text: `${header}\n\n${snapshot.content}` }]
        };
      } catch (err) {
        return {
          content: [
            { type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }
          ],
          isError: true
        };
      }
    }
  );

  // ── Tool: delete_change_spec ────────────────────────────────────────────
  server.registerTool(
    "delete_change_spec",
    {
      title: "Delete Change Spec",
      description:
        "Delete a change-scoped spec and its associated snapshots permanently.",
      inputSchema: {
        spec_id: z.string().describe("The spec unit ID to delete")
      }
    },
    async ({ spec_id }) => {
      try {
        await deleteChangeSpec(spec_id, user);
        return {
          content: [{ type: "text", text: `Change spec ${spec_id} deleted successfully.` }]
        };
      } catch (err) {
        return {
          content: [
            { type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }
          ],
          isError: true
        };
      }
    }
  );

  // ── Tool: upload_spec ──────────────────────────────────────────────────
  server.registerTool(
    "upload_spec",
    {
      title: "Upload Spec to Change",
      description:
        "Upload a spec file to a specific change. Creates or updates the spec unit and its snapshot content.",
      inputSchema: {
        change_id: z.string().describe("The change ID to upload the spec to"),
        capability: z
          .string()
          .min(1)
          .describe("Capability name (e.g. 'content-upload'). Used to derive the spec path."),
        content: z
          .string()
          .min(1)
          .max(1024 * 1024)
          .describe("The spec markdown content"),
        project_id: z
          .string()
          .optional()
          .describe("Project ID. Uses the user's default project if omitted."),
        repo: z
          .string()
          .optional()
          .describe("Repository name. Defaults to the change's repo binding or 'local'."),
        branch: z
          .string()
          .optional()
          .describe("Branch name. Defaults to the change's branch binding or 'main'.")
      }
    },
    async ({ change_id, capability, content, project_id, repo: repoOverride, branch: branchOverride }) => {
      const projectId = resolveProjectId(project_id, user);
      try {
        const change = await getChange(change_id);
        if (!change) {
          return {
            content: [{ type: "text", text: `Error: Change ${change_id} not found.` }],
            isError: true
          };
        }

        const binding = change.repo_changes.find((a): a is Extract<typeof a, { type: "repo" }> => a.type === "repo" || !("type" in a));
        const repo = repoOverride ?? binding?.repo ?? "local";
        const branch = branchOverride ?? binding?.branch ?? "main";
        const changeName = binding?.change_name ?? change_id;
        const path = `specs/changes/${changeName}/specs/${capability}/spec.md`;

        const result = await syncUpload({
          project_id: projectId,
          scope: "change",
          change_id,
          capability,
          repo,
          branch,
          change_name: changeName,
          path,
          content,
          content_hash: sha256(content),
          commit_sha: "mcp-upload",
          collected_at: new Date().toISOString()
        });

        return {
          content: [
            {
              type: "text",
              text: `Spec uploaded successfully.\n\nPath: ${path}\nCapability: ${capability}\nStatus: ${result.status}`
            }
          ]
        };
      } catch (err) {
        return {
          content: [
            { type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }
          ],
          isError: true
        };
      }
    }
  );

  // ── Tool: batch_upload_specs ──────────────────────────────────────────
  server.registerTool(
    "batch_upload_specs",
    {
      title: "Batch Upload Specs to Change",
      description:
        "Upload multiple spec files to a change at once.",
      inputSchema: {
        change_id: z.string().describe("The change ID to upload specs to"),
        specs: z
          .array(
            z.object({
              capability: z.string().min(1).describe("Capability name (e.g. 'user-auth')"),
              content: z.string().min(1).max(1024 * 1024).describe("Spec markdown content")
            })
          )
          .min(1)
          .describe("Array of specs to upload"),
        project_id: z
          .string()
          .optional()
          .describe("Project ID. Uses the user's default project if omitted."),
        repo: z
          .string()
          .optional()
          .describe("Repository name. Defaults to the change's repo binding or 'local'."),
        branch: z
          .string()
          .optional()
          .describe("Branch name. Defaults to the change's branch binding or 'main'.")
      }
    },
    async ({ change_id, specs, project_id, repo: repoOverride, branch: branchOverride }) => {
      const projectId = resolveProjectId(project_id, user);
      try {
        const change = await getChange(change_id);
        if (!change) {
          return {
            content: [{ type: "text", text: `Error: Change ${change_id} not found.` }],
            isError: true
          };
        }

        const binding = change.repo_changes.find((a): a is Extract<typeof a, { type: "repo" }> => a.type === "repo" || !("type" in a));
        const repo = repoOverride ?? binding?.repo ?? "local";
        const branch = branchOverride ?? binding?.branch ?? "main";
        const changeName = binding?.change_name ?? change_id;
        const now = new Date().toISOString();

        const items = specs.map((s) => ({
          project_id: projectId,
          scope: "change" as const,
          change_id,
          capability: s.capability,
          repo,
          branch,
          change_name: changeName,
          path: `specs/changes/${changeName}/specs/${s.capability}/spec.md`,
          content: s.content,
          content_hash: sha256(s.content),
          commit_sha: "mcp-batch-upload",
          collected_at: now
        }));

        const result = await syncBatch(items);
        const text = [
          `Batch upload complete: ${result.success_count} succeeded, ${result.failed_count} failed.`,
          "",
          ...result.results.map(
            (r) => `- ${r.path}: ${r.status}${"reason" in r ? ` (${r.reason})` : ""}`
          )
        ].join("\n");
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return {
          content: [
            { type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }
          ],
          isError: true
        };
      }
    }
  );

  // ── Tool: batch_upload_product_specs ─────────────────────────────────
  server.registerTool(
    "batch_upload_product_specs",
    {
      title: "Batch Upload Product Specs",
      description:
        "Upload multiple product-scope spec files at once.",
      inputSchema: {
        specs: z
          .array(
            z.object({
              capability: z.string().min(1).describe("Capability name (e.g. 'site-logo')"),
              content: z.string().min(1).max(1024 * 1024).describe("Spec markdown content")
            })
          )
          .min(1)
          .describe("Array of product specs to upload"),
        project_id: z
          .string()
          .optional()
          .describe("Project ID. Uses the user's default project if omitted."),
        repo: z
          .string()
          .optional()
          .describe("Repository name. Defaults to 'local'.")
      }
    },
    async ({ specs, project_id, repo: repoName }) => {
      const projectId = resolveProjectId(project_id, user);
      try {
        const repo = repoName ?? "local";
        const now = new Date().toISOString();

        const items = specs.map((s) => ({
          project_id: projectId,
          scope: "product" as const,
          change_id: null,
          capability: s.capability,
          repo,
          branch: "main",
          change_name: null,
          path: `specs/${s.capability}/spec.md`,
          content: s.content,
          content_hash: sha256(s.content),
          commit_sha: "mcp-batch-upload",
          collected_at: now
        }));

        const result = await syncBatch(items);
        const text = [
          `Product specs upload complete: ${result.success_count} succeeded, ${result.failed_count} failed.`,
          "",
          ...result.results.map(
            (r) => `- ${r.path}: ${r.status}${"reason" in r ? ` (${r.reason})` : ""}`
          )
        ].join("\n");
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return {
          content: [
            { type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }
          ],
          isError: true
        };
      }
    }
  );

  // ── Tool: import_changes ────────────────────────────────────────────
  server.registerTool(
    "import_changes",
    {
      title: "Import Changes",
      description:
        "Full import of a repository structure (changes + product specs). Uses upsert logic — existing data is updated, not duplicated.",
      inputSchema: {
        changes: z
          .array(
            z.object({
              dir_name: z.string().describe("Change directory name (kebab-case)"),
              status: z.enum(["draft", "archived"]).describe("Change status"),
              branch: z.string().describe("Git branch name"),
              proposal_content: z
                .string()
                .nullable()
                .describe("Content of proposal.md, or null"),
              spec_files: z
                .array(
                  z.object({
                    path: z.string().describe("Relative file path"),
                    content: z.string().describe("File content"),
                    timestamp: z.string().describe("ISO timestamp")
                  })
                )
                .describe("Spec files within this change")
            })
          )
          .describe("Array of change directories to import"),
        product_specs: z
          .array(
            z.object({
              path: z.string().describe("Relative file path"),
              content: z.string().describe("File content"),
              timestamp: z.string().describe("ISO timestamp")
            })
          )
          .optional()
          .describe("Array of product spec files to import"),
        repo: z
          .string()
          .optional()
          .describe("Repository name. Defaults to 'local'."),
        project_id: z
          .string()
          .optional()
          .describe("Project ID. Uses the user's default project if omitted.")
      }
    },
    async ({ changes, product_specs, repo, project_id }) => {
      try {
        const payload: ImportPayload = {
          repo: repo ?? "local",
          ...(project_id ? { project_id } : {}),
          changes,
          product_specs: product_specs ?? []
        };

        const result = await upsertChangesFromPayload(payload);
        const text = [
          `Import complete.`,
          "",
          `Changes: ${result.created_changes} created, ${result.updated_changes} updated, ${result.archived_changes} archived`,
          `Specs: ${result.created_specs} created, ${result.updated_specs} updated, ${result.skipped_specs} skipped`,
          `Snapshots: ${result.created_snapshots} created, ${result.updated_snapshots} updated`,
          "",
          `Change IDs: ${result.change_ids.join(", ") || "(none)"}`,
          `Product Spec IDs: ${result.product_spec_ids.join(", ") || "(none)"}`
        ].join("\n");
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return {
          content: [
            { type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }
          ],
          isError: true
        };
      }
    }
  );

  // ── Tool: get_sync_status ───────────────────────────────────────────
  server.registerTool(
    "get_sync_status",
    {
      title: "Get Sync Status",
      description:
        "Get the sync status of specs for a change.",
      inputSchema: {
        change_id: z.string().describe("The change ID to check sync status for")
      }
    },
    async ({ change_id }) => {
      try {
        const status = await getSyncStatus(change_id);
        const specsText =
          status.results.length > 0
            ? status.results
                .map(
                  (r) =>
                    `  - ${r.capability} (${r.spec_id}): ${r.status}, last synced: ${r.last_synced_at ?? "never"}`
                )
                .join("\n")
            : "  (no specs)";

        const text = [
          `Sync status for change ${change_id}:`,
          `  Change specs: ${status.spec_count}`,
          `  Product specs: ${status.product_spec_count}`,
          `  Last synced: ${status.last_synced_at ?? "never"}`,
          "",
          "Specs:",
          specsText
        ].join("\n");
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return {
          content: [
            { type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }
          ],
          isError: true
        };
      }
    }
  );

  // ── Resource: guide ──────────────────────────────────────────────────
  server.registerResource(
    "guide",
    "sc://guide",
    {
      title: "Spec Center Guide",
      description:
        "Usage guide for Spec Center MCP tools and resources. Read this to understand available capabilities and workflows.",
      mimeType: "text/markdown"
    },
    async (uri) => {
      return {
        contents: [
          {
            uri: uri.href,
            text: GUIDE_CONTENT
          }
        ]
      };
    }
  );

  // ── Resource: projects ─────────────────────────────────────────────────
  server.registerResource(
    "projects",
    "sc://projects",
    {
      title: "Project List",
      description: "All projects accessible to the current user.",
      mimeType: "application/json"
    },
    async (uri) => {
      const projects = await listProjectCatalog(user);
      return {
        contents: [
          {
            uri: uri.href,
            text: JSON.stringify(
              projects.map((p) => ({
                id: p._id,
                slug: p.slug,
                name: p.name,
                description: p.description,
                is_default: p.is_default
              })),
              null,
              2
            )
          }
        ]
      };
    }
  );

  // ── Resource template: project overview ────────────────────────────────
  server.registerResource(
    "project-overview",
    new ResourceTemplate("sc://project/{id}/overview", { list: undefined }),
    {
      title: "Project Overview",
      description: "Overview metrics for a project.",
      mimeType: "application/json"
    },
    async (uri, { id }) => {
      const projectId = id as string;
      const [metrics, project] = await Promise.all([
        getOverviewMetrics(projectId),
        getActiveProject(projectId)
      ]);
      return {
        contents: [
          {
            uri: uri.href,
            text: JSON.stringify(
              {
                project: project
                  ? { id: project._id, name: project.name, slug: project.slug }
                  : null,
                metrics
              },
              null,
              2
            )
          }
        ]
      };
    }
  );

  // ── Resource template: product specs list ──────────────────────────────
  server.registerResource(
    "project-product-specs",
    new ResourceTemplate("sc://project/{id}/product-specs", { list: undefined }),
    {
      title: "Product Specs",
      description: "Product spec units for a project.",
      mimeType: "application/json"
    },
    async (uri, { id }) => {
      const projectId = id as string;
      const specs = await listProductSpecs(projectId);
      return {
        contents: [
          {
            uri: uri.href,
            text: JSON.stringify(
              specs.map((s) => ({
                id: s._id,
                capability: s.capability,
                path: s.path,
                sync_status: s.sync_status,
                review_status: s.review_status
              })),
              null,
              2
            )
          }
        ]
      };
    }
  );

  return server;
}

const GUIDE_CONTENT = `# Spec Center 交互指南

通过 spec-center MCP server 与平台交互，支持多角色协作。

## MCP Tool 一览

### Change 管理

| Tool | 用途 |
|------|------|
| create_change | 创建需求 |
| list_changes | 列出项目所有 change |
| get_change | 获取 change 详情 + 关联 spec |
| update_change | 更新 change 元数据 |
| delete_change | 删除 draft change |

### Spec 查询与管理

| Tool | 用途 |
|------|------|
| list_product_specs | 列出所有 product spec |
| get_spec | 获取 spec 详情 + 最新内容 |
| get_snapshot | 获取指定 snapshot 版本内容 |
| update_spec | 更新 spec 元数据（capability/repo/branch/path/owner_role/sync_status/review_status）或内容 |
| delete_change_spec | 删除 change 下的 spec |
| delete_product_spec | 删除 product spec |

### Spec 同步上传

| Tool | 用途 |
|------|------|
| upload_spec | 上传单个 spec.md 到指定 change（可选 repo、branch） |
| batch_upload_specs | 批量上传 change 下的 spec.md（可选 repo、branch） |
| batch_upload_product_specs | 批量上传 product specs（可选 repo） |
| import_changes | 全量导入 specs 目录结构（changes + product specs） |
| get_sync_status | 查看 change 同步状态 |

> **关键约束：所有上传/导入操作只处理 spec.md 文件。** design.md、tasks.md、proposal.md 等其他文件不属于 spec 内容，禁止作为 spec 上传或导入。

### 知识库

| Tool | 用途 |
|------|------|
| ask | 知识库问答（RAG） |
| search | 全文搜索 |

### MCP Resource

| Resource URI | 用途 |
|-------------|------|
| sc://projects | 当前用户可访问的项目列表 |
| sc://project/{id}/overview | 项目概览指标 |
| sc://project/{id}/product-specs | 项目的 product spec 列表 |
| sc://guide | 本使用指南 |

---

## 产品经理

### 创建需求

用 create_change：
- 必填：title（≥3 字符）、description（≥3 字符）
- 建议填：sprint（如 "2026-S8"）、prd_link（PRD URL）
- 可选：repo_changes（[{type:"repo", repo, branch, change_name} 或 {type:"url", url, label?}]）、review_required（默认 true）

### 查看需求

用 list_changes 列出全部，按 sprint 筛选时从结果中过滤 sprint 字段。

---

## 开发者

### 拉取需求到本地

1. get_change（传 change_id）→ 获取详情，提取关联 spec ID
2. get_spec（传 spec_id）→ 获取 spec 完整 markdown 内容
3. 如果本地有 specs/ 目录，将内容写入 specs/<capability>/spec.md

### 同步本地 Spec 到 Spec Center

**重要：上传前必须先检查已有 spec，防止重复上传。**

同步流程（严格按顺序执行）：

1. 先查已有 spec：调用 get_change（传 change_id）获取该 change 下已关联的 spec 列表，记录每个 spec 的 capability 和 spec_id
2. 比对本地文件：将本地待上传的 spec 与已有 spec 按 capability 名称匹配
3. 决定操作：
   - capability 已存在且内容需要更新 → 用 update_spec（传 spec_id + content）
   - capability 不存在 → 用 upload_spec 或 batch_upload_specs 新增
   - capability 已存在且内容无变化 → 跳过，不上传

可用的上传 tool：

- upload_spec：单个 spec 上传，传入 change_id、capability、content（**只传 spec.md 的内容**），可选 repo、branch
- batch_upload_specs：批量上传 change specs，传入 change_id 和 specs[]（每项含 capability + content，**content 只取 spec.md**），可选 repo、branch
- batch_upload_product_specs：批量上传 product specs，传入 specs[]，可选 repo
- import_changes：全量导入 specs 目录结构，传入完整 payload。**spec_files 只包含 spec.md 文件，不要包含 design.md、tasks.md 等其他文件**。导入前先用 list_changes 检查已有 change，避免重复导入
- get_sync_status：查看指定 change 的同步状态

注意：capability 名称是 spec 的唯一标识（同一 change 下不可重复）。上传时确保 capability 使用一致的 kebab-case 命名。

**只上传 spec.md**：每个 capability 目录下可能包含 spec.md、design.md、tasks.md 等多个文件，但只有 spec.md 是 spec 内容。读取文件时只读取 specs/<capability>/spec.md，忽略同目录下的其他文件。

### 更新 Spec

用 update_spec（传 spec_id），支持更新：
- 元数据：capability、repo、branch、change_name、path、owner_role、sync_status、review_status
- 内容：传入 content 时自动创建新 snapshot
- 可同时更新元数据和内容

### 删除 Spec

- Change scope：用 delete_change_spec（传 spec_id）
- Product scope：用 delete_product_spec（传 spec_id）

---

## 通用

### 知识库问答

用 ask，传 question。基于 spec、change、review 评论回答。

### 全文搜索

用 search，传 query。跨 change、spec、review 搜索。

### Spec 版本对比

用 get_spec 获取当前内容，用 get_snapshot 获取历史版本进行对比。

### 项目信息

通过 MCP resource 获取（无需调用 tool）：
- sc://projects：项目列表
- sc://project/{id}/overview：项目概览
- sc://project/{id}/product-specs：product spec 列表

---

## 典型开发流程

产品 create_change → 开发 get_change + get_spec 拉取 → 本地理解、propose、apply → batch_upload_specs 同步 → 完成

## 原则

- 按需调用：用户需要时才调 MCP tool，不预加载
- 精简输出：返回数据可能较大，只展示关键字段
- 上传/导入前必查：任何上传/同步/导入操作前，必须先查看已有数据防止重复——upload_spec/batch_upload_specs 前用 get_change 查已有 spec，已存在的用 update_spec 更新；import_changes 前用 list_changes 查已有 change，只导入新增的 change
- capability 唯一：同一 change 下 capability 名称不可重复，始终使用 kebab-case，上传前与已有 spec 的 capability 做精确匹配
- 只上传 spec.md：所有上传/导入操作只处理 spec.md 文件内容，design.md、tasks.md、proposal.md 等文件不是 spec，禁止上传
`;
