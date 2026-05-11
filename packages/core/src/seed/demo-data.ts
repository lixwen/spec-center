import type { CenterStore } from "../domain/models";
import { hashPassword } from "../utils/auth";
import { sha256 } from "../utils/hash";

const paymentDelta = `# Payment Gateway Delta Spec

## ADDED Requirements

### Requirement: Unified payment gateway
The system MUST route checkout payments through a shared orchestration layer.

### Requirement: Status propagation
The system MUST sync payment status updates back to order-service within 30 seconds.
`;

const paymentBaseline = `# Payment Gateway Product Spec

## Existing Requirements

### Requirement: Single channel payments
The platform supports one payment channel with confirmed settlement callbacks.
`;

const paymentBaselineV0 = `# Payment Gateway Product Spec

## Existing Requirements

### Requirement: Manual settlement review
The platform records payment confirmations for manual settlement review.
`;

const orderDelta = `# Checkout Delta Spec

## ADDED Requirements

### Requirement: Checkout payment state
Checkout MUST render pending, success, and failed payment states.
`;

const taskSpec = `# Review Tasks

- Verify gateway timeout handling
- Confirm checkout state copy with PM
- Validate reviewer assignments
`;

export function createDemoStore(): CenterStore {
  const seededPassword = hashPassword("password123");
  return {
    projects: [
      {
        _id: "project-default",
        slug: "project-alpha",
        name: "Project Alpha",
        description: "Default OpenSpec Center workspace project.",
        repo_bindings: [{ repo: "spec-center", default_branch: "main" }],
        default_reviewers: [
          { user: "qa", role: "QA" },
          { user: "eng", role: "Engineer" }
        ],
        is_default: true,
        deleted_at: null,
        created_at: "2026-02-01T00:00:00Z",
        updated_at: "2026-03-29T09:00:00Z"
      },
      {
        _id: "project-orbit",
        slug: "project-orbit",
        name: "Project Orbit",
        description: "Secondary project used to verify multi-project isolation.",
        repo_bindings: [{ repo: "orbit-payments", default_branch: "main" }],
        default_reviewers: [
          { user: "qa", role: "QA" }
        ],
        is_default: false,
        deleted_at: null,
        created_at: "2026-03-01T00:00:00Z",
        updated_at: "2026-03-30T08:00:00Z"
      }
    ],
    users: [
      {
        _id: "user-platform-admin",
        username: "admin",
        email: "admin@example.com",
        display_name: "Platform Admin",
        password_hash: seededPassword,
        global_roles: ["platform_admin"],
        memberships: [
          { project_id: "project-default", project_role: "project_admin" },
          { project_id: "project-orbit", project_role: "project_admin" }
        ],
        status: "active",
        token_version: 1,
        created_at: "2026-02-01T00:00:00Z",
        updated_at: "2026-03-30T08:00:00Z"
      },
      {
        _id: "user-qa",
        username: "qa",
        email: "qa@example.com",
        display_name: "QA Reviewer",
        password_hash: seededPassword,
        global_roles: [],
        memberships: [
          { project_id: "project-default", project_role: "reviewer" },
          { project_id: "project-orbit", project_role: "reviewer" }
        ],
        status: "active",
        token_version: 1,
        created_at: "2026-02-01T00:00:00Z",
        updated_at: "2026-03-30T08:00:00Z"
      },
      {
        _id: "user-eng",
        username: "eng",
        email: "eng@example.com",
        display_name: "Engineering Reviewer",
        password_hash: seededPassword,
        global_roles: [],
        memberships: [{ project_id: "project-default", project_role: "reviewer" }],
        status: "active",
        token_version: 1,
        created_at: "2026-02-01T00:00:00Z",
        updated_at: "2026-03-30T08:00:00Z"
      },
      {
        _id: "user-pm",
        username: "pm",
        email: "pm@example.com",
        display_name: "Product Manager",
        password_hash: seededPassword,
        global_roles: [],
        memberships: [
          { project_id: "project-default", project_role: "pm" },
          { project_id: "project-orbit", project_role: "pm" }
        ],
        status: "active",
        token_version: 1,
        created_at: "2026-02-01T00:00:00Z",
        updated_at: "2026-03-30T08:00:00Z"
      }
    ],
    changes: [
      {
        _id: "CHG-2026-00123",
        project_id: "project-default",
        title: "OpenSpec Center Phase 1 Core Loop",
        description:
          "Bootstrap the web platform, review workspace, and product baseline browser for the Phase 1 workflow.",
        status: "in_review",
        prd_link: "https://example.com/prd/spec-center",
        repo_changes: [
          {
            type: "repo",
            repo: "spec-center",
            branch: "main",
            change_name: "phase-1-core-loop"
          }
        ],
        current_review_session_id: "review_session_1",
        review_required: true,
        sprint: "Sprint 25",
        created_by: "pm",
        version: 3,
        created_at: "2026-03-20T10:00:00Z",
        updated_at: "2026-03-26T10:00:00Z"
      },
      {
        _id: "CHG-2026-00124",
        project_id: "project-default",
        title: "Reviewer task list refinements",
        description: "Tune reviewer task visibility and sync summaries.",
        status: "draft",
        prd_link: "https://example.com/prd/tasks",
        repo_changes: [
          {
            type: "repo",
            repo: "spec-center",
            branch: "feature/task-list",
            change_name: "task-list-refine"
          }
        ],
        current_review_session_id: null,
        review_required: true,
        sprint: "Sprint 25",
        created_by: "pm",
        version: 1,
        created_at: "2026-03-29T09:00:00Z",
        updated_at: "2026-03-29T09:00:00Z"
      },
      {
        _id: "CHG-2026-00098",
        project_id: "project-default",
        title: "Payment gateway baseline unification",
        description: "Archived capability change that moved payment handling toward a shared gateway baseline.",
        status: "archived",
        prd_link: "https://example.com/prd/payment-history",
        repo_changes: [
          {
            type: "repo",
            repo: "spec-center",
            branch: "main",
            change_name: "payment-baseline-unification"
          }
        ],
        current_review_session_id: null,
        review_required: true,
        sprint: "Sprint 24",
        created_by: "pm",
        version: 7,
        created_at: "2026-02-10T09:00:00Z",
        updated_at: "2026-02-18T18:00:00Z"
      },
      {
        _id: "CHG-2026-00901",
        project_id: "project-orbit",
        title: "Orbit payment spec refresh",
        description: "Parallel payment update in a separate project to validate scoped queries.",
        status: "draft",
        prd_link: "https://example.com/prd/orbit-payment",
        repo_changes: [
          {
            type: "repo",
            repo: "orbit-payments",
            branch: "main",
            change_name: "orbit-payment-refresh"
          },
          {
            type: "url",
            url: "https://example.com/design/orbit-payment",
            label: "Figma Design"
          }
        ],
        current_review_session_id: null,
        review_required: false,
        sprint: null,
        created_by: "pm",
        version: 1,
        created_at: "2026-03-30T08:00:00Z",
        updated_at: "2026-03-30T08:00:00Z"
      }
    ],
    specUnits: [
      {
        _id: "spec_change_payment",
        project_id: "project-default",
        scope: "change",
        change_id: "CHG-2026-00123",
        capability: "payment-gateway",
        repo: "spec-center",
        branch: "main",
        change_name: "phase-1-core-loop",
        path: "openspec/changes/phase-1-core-loop/specs/payment-gateway/spec.md",
        owner_role: "backend",
        working_snapshot_id: "snap_change_payment_working",
        sync_status: "synced",
        review_status: "pending",
        last_synced_at: "2026-03-25T14:30:00Z"
      },
      {
        _id: "spec_change_checkout",
        project_id: "project-default",
        scope: "change",
        change_id: "CHG-2026-00123",
        capability: "checkout-review",
        repo: "spec-center",
        branch: "main",
        change_name: "phase-1-core-loop",
        path: "openspec/changes/phase-1-core-loop/specs/checkout-review/spec.md",
        owner_role: "frontend",
        working_snapshot_id: "snap_change_checkout_working",
        sync_status: "synced",
        review_status: "pending",
        last_synced_at: "2026-03-25T14:32:00Z"
      },
      {
        _id: "spec_change_tasks",
        project_id: "project-default",
        scope: "change",
        change_id: "CHG-2026-00123",
        capability: "phase-1-tasks",
        repo: "spec-center",
        branch: "main",
        change_name: "phase-1-core-loop",
        path: "openspec/changes/phase-1-core-loop/tasks.md",
        owner_role: "pm",
        working_snapshot_id: "snap_change_tasks_working",
        sync_status: "synced",
        review_status: "pending",
        last_synced_at: "2026-03-25T14:40:00Z"
      },
      {
        _id: "spec_product_payment",
        project_id: "project-default",
        scope: "product",
        change_id: null,
        capability: "payment-gateway",
        repo: "spec-center",
        branch: "main",
        change_name: null,
        path: "openspec/specs/payment-gateway/spec.md",
        owner_role: "backend",
        working_snapshot_id: "snap_product_payment_working",
        sync_status: "synced",
        review_status: null,
        last_synced_at: "2026-03-24T10:00:00Z"
      },
      {
        _id: "spec_orbit_payment",
        project_id: "project-orbit",
        scope: "change",
        change_id: "CHG-2026-00901",
        capability: "payment-gateway",
        repo: "orbit-payments",
        branch: "main",
        change_name: "orbit-payment-refresh",
        path: "openspec/changes/orbit-payment-refresh/specs/payment-gateway/spec.md",
        owner_role: "backend",
        working_snapshot_id: "snap_orbit_payment_working",
        sync_status: "synced",
        review_status: "not_in_review",
        last_synced_at: "2026-03-30T08:10:00Z"
      },
      {
        _id: "spec_product_payment_orbit",
        project_id: "project-orbit",
        scope: "product",
        change_id: null,
        capability: "payment-gateway",
        repo: "orbit-payments",
        branch: "main",
        change_name: null,
        path: "openspec/specs/payment-gateway/spec.md",
        owner_role: "backend",
        working_snapshot_id: "snap_product_payment_orbit_working",
        sync_status: "synced",
        review_status: null,
        last_synced_at: "2026-03-30T08:05:00Z"
      }
    ],
    snapshots: [
      {
        _id: "snap_change_payment_working",
        spec_id: "spec_change_payment",
        content: paymentDelta,
        content_hash: sha256(paymentDelta),
        type: "working",
        source: {
          repo: "spec-center",
          branch: "main",
          commit_sha: "a1b2c3d",
          collected_at: "2026-03-25T14:30:00Z"
        },
        created_at: "2026-03-25T14:30:00Z"
      },
      {
        _id: "snap_change_checkout_working",
        spec_id: "spec_change_checkout",
        content: orderDelta,
        content_hash: sha256(orderDelta),
        type: "working",
        source: {
          repo: "spec-center",
          branch: "main",
          commit_sha: "a1b2c3d",
          collected_at: "2026-03-25T14:32:00Z"
        },
        created_at: "2026-03-25T14:32:00Z"
      },
      {
        _id: "snap_change_tasks_working",
        spec_id: "spec_change_tasks",
        content: taskSpec,
        content_hash: sha256(taskSpec),
        type: "working",
        source: {
          repo: "spec-center",
          branch: "main",
          commit_sha: "a1b2c3d",
          collected_at: "2026-03-25T14:40:00Z"
        },
        created_at: "2026-03-25T14:40:00Z"
      },
      {
        _id: "snap_product_payment_working",
        spec_id: "spec_product_payment",
        content: paymentBaseline,
        content_hash: sha256(paymentBaseline),
        type: "working",
        source: {
          repo: "spec-center",
          branch: "main",
          commit_sha: "z9y8x7w",
          collected_at: "2026-03-24T10:00:00Z"
        },
        created_at: "2026-03-24T10:00:00Z"
      },
      {
        _id: "snap_orbit_payment_working",
        spec_id: "spec_orbit_payment",
        content: `${paymentDelta}\n### Requirement: Orbit-specific settlement audit\nThe system MUST attach an orbit-specific settlement audit trail.\n`,
        content_hash: sha256(
          `${paymentDelta}\n### Requirement: Orbit-specific settlement audit\nThe system MUST attach an orbit-specific settlement audit trail.\n`
        ),
        type: "working",
        source: {
          repo: "orbit-payments",
          branch: "main",
          commit_sha: "orbit123",
          collected_at: "2026-03-30T08:10:00Z"
        },
        created_at: "2026-03-30T08:10:00Z"
      },
      {
        _id: "snap_product_payment_orbit_working",
        spec_id: "spec_product_payment_orbit",
        content: `${paymentBaseline}\n### Requirement: Orbit ledger export\nThe platform exports orbit settlement ledgers nightly.\n`,
        content_hash: sha256(
          `${paymentBaseline}\n### Requirement: Orbit ledger export\nThe platform exports orbit settlement ledgers nightly.\n`
        ),
        type: "working",
        source: {
          repo: "orbit-payments",
          branch: "main",
          commit_sha: "orbit122",
          collected_at: "2026-03-30T08:05:00Z"
        },
        created_at: "2026-03-30T08:05:00Z"
      },
      {
        _id: "snap_product_payment_history_1",
        spec_id: "spec_product_payment",
        content: paymentBaselineV0,
        content_hash: sha256(paymentBaselineV0),
        type: "working",
        source: {
          repo: "spec-center",
          branch: "main",
          commit_sha: "p0q9r8s",
          collected_at: "2026-02-18T18:00:00Z"
        },
        created_at: "2026-02-18T18:00:00Z"
      },
      {
        _id: "snap_change_payment_baseline",
        spec_id: "spec_change_payment",
        content: paymentDelta,
        content_hash: sha256(paymentDelta),
        type: "baseline",
        source: {
          repo: "spec-center",
          branch: "main",
          commit_sha: "a1b2c3d",
          collected_at: "2026-03-26T10:00:00Z"
        },
        created_at: "2026-03-26T10:00:00Z"
      },
      {
        _id: "snap_change_checkout_baseline",
        spec_id: "spec_change_checkout",
        content: orderDelta,
        content_hash: sha256(orderDelta),
        type: "baseline",
        source: {
          repo: "spec-center",
          branch: "main",
          commit_sha: "a1b2c3d",
          collected_at: "2026-03-26T10:00:00Z"
        },
        created_at: "2026-03-26T10:00:00Z"
      },
      {
        _id: "snap_change_tasks_baseline",
        spec_id: "spec_change_tasks",
        content: taskSpec,
        content_hash: sha256(taskSpec),
        type: "baseline",
        source: {
          repo: "spec-center",
          branch: "main",
          commit_sha: "a1b2c3d",
          collected_at: "2026-03-26T10:00:00Z"
        },
        created_at: "2026-03-26T10:00:00Z"
      }
    ],
    reviewSessions: [
      {
        _id: "review_session_1",
        project_id: "project-default",
        change_id: "CHG-2026-00123",
        status: "active",
        baselines: [
          {
            spec_id: "spec_change_payment",
            snapshot_id: "snap_change_payment_baseline",
            product_spec_id: "spec_product_payment",
            product_spec_snapshot_id: "snap_product_payment_working"
          },
          {
            spec_id: "spec_change_checkout",
            snapshot_id: "snap_change_checkout_baseline",
            product_spec_id: null,
            product_spec_snapshot_id: null
          },
          {
            spec_id: "spec_change_tasks",
            snapshot_id: "snap_change_tasks_baseline",
            product_spec_id: null,
            product_spec_snapshot_id: null
          }
        ],
        reviewers: [
          {
            user: "qa",
            role: "QA",
            assigned_specs: ["spec_change_payment", "spec_change_checkout"],
            status: "pending"
          },
          {
            user: "eng",
            role: "Engineer",
            assigned_specs: ["spec_change_tasks"],
            status: "pending"
          }
        ],
        spec_reviews: [
          { spec_id: "spec_change_payment", reviewer: "qa", status: "pending", reviewed_at: null },
          { spec_id: "spec_change_checkout", reviewer: "qa", status: "pending", reviewed_at: null },
          { spec_id: "spec_change_tasks", reviewer: "eng", status: "pending", reviewed_at: null }
        ],
        approval_rule: "all_required",
        created_at: "2026-03-26T10:00:00Z",
        completed_at: null
      }
    ],
    comments: [
      {
        _id: "c1",
        review_session_id: "review_session_1",
        spec_id: "spec_change_payment",
        snapshot_id: "snap_change_payment_baseline",
        anchor: {
          type: "heading",
          heading_path:
            "## ADDED Requirements > ### Requirement: Unified payment gateway",
          line_hint: 5
        },
        author: "qa",
        content: "Timeout handling is still missing from the delta spec.",
        status: "open",
        thread_id: "c1",
        created_at: "2026-03-26T11:00:00Z"
      }
    ]
  };
}
