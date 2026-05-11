import type {
  AuthenticatedUser,
  Change,
  ChangeDashboardEntry,
  ChangeDashboardSummary,
  CenterStore,
  Comment,
  LinkedAsset,
  OverviewMetrics,
  ProductKnowledgeEntry,
  Project,
  RepoBinding,
  ReviewSession,
  ReviewerRecommendation,
  SearchResult,
  Snapshot,
  SpecUnit,
  SyncUploadPayload
} from "../domain/models";
import { getMongoCollections } from "../data/mongo";
import { getDefaultProject, getProject, listProjects, resolveProject } from "../data/mongo";
import { createId } from "../utils/id";
import { nowIso } from "../utils/hash";
import {
  detectCrossSpecIssues,
  detectSingleSpecIssues,
  generateReviewBrief,
  recommendReviewers
} from "./ai-service";
import { enqueueEmbeddingTask, deleteVectorsByDocIds, deleteVectorsByChangeId } from "./rag-service";
import {
  assertCanAdvanceChange,
  assertCanComment,
  assertCanCreateProject,
  assertCanManageProject,
  assertCanManageReviewers,
  assertProjectReadable,
  assertCanReviewAs
} from "./auth-service";

function repoBindings(assets: LinkedAsset[]): RepoBinding[] {
  return assets.filter((a): a is RepoBinding => a.type === "repo" || !("type" in a));
}

async function getStore(): Promise<CenterStore> {
  const collections = await getMongoCollections();
  const [projects, users, changes, specUnits, snapshots, reviewSessions, comments] = await Promise.all([
    collections.projects.find().toArray(),
    collections.users.find().toArray(),
    collections.changes.find({ $or: [{ deleted_at: null }, { deleted_at: { $exists: false } }] }).toArray(),
    collections.specUnits.find().toArray(),
    collections.snapshots.find().toArray(),
    collections.reviewSessions.find().toArray(),
    collections.comments.find().toArray()
  ]);

  return {
    projects,
    users,
    changes,
    specUnits,
    snapshots,
    reviewSessions,
    comments
  };
}

function sortByUpdatedAtDesc<T extends { updated_at: string }>(items: T[]) {
  return [...items].sort((left, right) => right.updated_at.localeCompare(left.updated_at));
}

function sortByCreatedAtDesc<T extends { created_at: string }>(items: T[]) {
  return [...items].sort((left, right) => right.created_at.localeCompare(left.created_at));
}

export async function getOverviewMetrics(projectId?: string): Promise<OverviewMetrics> {
  const store = await getStore();
  const activeProjectId = await resolveProjectId(projectId);
  const changes = store.changes.filter((change) => change.project_id === activeProjectId);
  const specs = store.specUnits.filter((spec) => spec.project_id === activeProjectId);
  const sessions = store.reviewSessions.filter((session) => session.project_id === activeProjectId);
  const sessionIds = new Set(sessions.map((session) => session._id));
  const comments = store.comments.filter((comment) => sessionIds.has(comment.review_session_id));

  return {
    totalChanges: changes.length,
    reviewQueue: changes.filter((change) => change.status === "in_review").length,
    productSpecs: specs.filter((spec) => spec.scope === "product").length,
    openComments: comments.filter((comment) => comment.status === "open").length,
    readyToArchive: changes.filter((change) => change.status === "approved").length
  };
}

export async function getChangeDashboardSummary(projectId?: string): Promise<ChangeDashboardSummary> {
  const entries = await getChangeDashboardEntries(projectId);
  return {
    active_change_count: entries.filter((entry) => entry.change.status !== "archived").length,
    blocked_change_count: entries.filter((entry) => entry.blocker_count > 0).length,
    in_review_count: entries.filter((entry) => entry.change.status === "in_review").length,
    approved_change_count: entries.filter((entry) => entry.change.status === "approved").length,
    total_open_comments: entries.reduce((sum, entry) => sum + entry.open_comment_count, 0)
  };
}

export async function getChangeDashboardEntries(projectId?: string): Promise<ChangeDashboardEntry[]> {
  const store = await getStore();
  const activeProjectId = await resolveProjectId(projectId);
  const changes = sortByUpdatedAtDesc(
    store.changes.filter((change) => change.project_id === activeProjectId)
  );

  return changes.map((change) => {
    const specs = store.specUnits.filter(
      (spec) => spec.project_id === activeProjectId && spec.change_id === change._id
    );
    const crossSpecIssues = detectCrossSpecIssues(specs);
    const recommendations = recommendReviewers(specs);
    const review = change.current_review_session_id
      ? store.reviewSessions.find((session) => session._id === change.current_review_session_id)
      : undefined;
    const approvedReviewers =
      review?.reviewers.filter((reviewer) => reviewer.status === "approved").length ?? 0;
    const totalReviewers = review?.reviewers.length ?? 0;
    const pendingReviewers = Math.max(totalReviewers - approvedReviewers, 0);
    const openCommentCount = review
      ? store.comments.filter(
          (comment) =>
            comment.review_session_id === review._id && comment.status === "open"
        ).length
      : 0;
    const newVersionCount = specs.filter((spec) => spec.new_version_available).length;
    const blockerLabels = [
      ...(openCommentCount > 0 ? [`${openCommentCount} open comments`] : []),
      ...(pendingReviewers > 0 ? [`${pendingReviewers} pending reviewers`] : []),
      ...(newVersionCount > 0 ? [`${newVersionCount} new snapshots`] : []),
      ...(crossSpecIssues.length > 0 ? [`${crossSpecIssues.length} cross-spec findings`] : [])
    ];

    return {
      change,
      spec_count: specs.length,
      repos: Array.from(new Set(repoBindings(change.repo_changes).map((b) => b.repo))),
      reviewer_users: review?.reviewers.map((reviewer) => reviewer.user) ?? [],
      review_progress: {
        approved: approvedReviewers,
        total: totalReviewers,
        pending: pendingReviewers
      },
      open_comment_count: openCommentCount,
      new_version_count: newVersionCount,
      blocker_count: blockerLabels.length,
      blocker_labels: blockerLabels,
      last_synced_at:
        specs
          .map((spec) => spec.last_synced_at)
          .filter((value): value is string => Boolean(value))
          .sort()
          .at(-1) ?? null,
      cross_spec_issue_count: crossSpecIssues.length,
      recommendation_count: recommendations.length
    };
  });
}

export async function listChanges(projectId?: string): Promise<Change[]> {
  const collections = await getMongoCollections();
  const activeProjectId = await resolveProjectId(projectId);
  return collections.changes
    .find({ project_id: activeProjectId, $or: [{ deleted_at: null }, { deleted_at: { $exists: false } }] })
    .sort({ updated_at: -1 })
    .toArray();
}

export async function getChange(id: string): Promise<Change | undefined> {
  const collections = await getMongoCollections();
  return (await collections.changes.findOne({
    _id: id,
    $or: [{ deleted_at: null }, { deleted_at: { $exists: false } }]
  })) ?? undefined;
}

export async function createChange(input: {
  actor?: AuthenticatedUser;
  project_id?: string;
  title: string;
  description: string;
  prd_link?: string | null;
  sprint?: string | null;
  created_by: string;
  repo_changes: Change["repo_changes"];
  review_required?: boolean;
}): Promise<Change> {
  const collections = await getMongoCollections();
  const timestamp = nowIso();
  const firstRepo = repoBindings(input.repo_changes)[0];
  const project = await resolveProject({ projectId: input.project_id, repo: firstRepo?.repo });
  if (input.actor) {
    assertCanAdvanceChange(input.actor, project._id);
  }
  const changes = await collections.changes.find().project({ _id: 1 }).toArray();
  const highestSequence = changes.reduce((max, change) => {
    const match = /CHG-\d{4}-(\d+)$/.exec(change._id);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 122);

  const change: Change = {
    _id: `CHG-${new Date().getUTCFullYear()}-${String(highestSequence + 1).padStart(5, "0")}`,
    project_id: project._id,
    title: input.title,
    description: input.description,
    status: "draft",
    prd_link: input.prd_link ?? null,
    repo_changes: input.repo_changes,
    current_review_session_id: null,
    review_required: input.review_required ?? true,
    sprint: input.sprint ?? null,
    created_by: input.created_by,
    version: 1,
    created_at: timestamp,
    updated_at: timestamp,
    deleted_at: null
  };

  await collections.changes.insertOne(change);
  enqueueEmbeddingTask("change", change._id, change.project_id).catch(() => {});
  return change;
}

export async function updateChange(
  id: string,
  patch: Partial<Omit<Change, "_id" | "created_at">>,
  actor?: AuthenticatedUser
): Promise<Change> {
  const collections = await getMongoCollections();
  const change = await requireChange(id);
  if (actor) {
    assertCanAdvanceChange(actor, change.project_id);
  }
  const nextChange: Change = {
    ...change,
    ...patch,
    version: change.version + 1,
    updated_at: nowIso()
  };

  await collections.changes.replaceOne({ _id: id }, nextChange);
  enqueueEmbeddingTask("change", nextChange._id, nextChange.project_id).catch(() => {});
  return nextChange;
}

export async function deleteChange(id: string, actor?: AuthenticatedUser): Promise<void> {
  const collections = await getMongoCollections();
  const change = await requireChange(id);
  if (actor) {
    assertCanAdvanceChange(actor, change.project_id);
  }

  if (change.status !== "draft" && change.status !== "archived") {
    throw new Error("Only draft or archived changes can be deleted.");
  }

  const nextChange: Change = {
    ...change,
    deleted_at: nowIso(),
    version: change.version + 1,
    updated_at: nowIso()
  };
  await collections.changes.replaceOne({ _id: id }, nextChange);

  deleteVectorsByChangeId(id).catch(() => {});
}

export async function listSpecsForChange(changeId: string): Promise<SpecUnit[]> {
  const collections = await getMongoCollections();
  const change = await requireChange(changeId);
  return collections.specUnits.find({ project_id: change.project_id, change_id: changeId }).toArray();
}

export async function listProductSpecs(projectId?: string): Promise<SpecUnit[]> {
  const collections = await getMongoCollections();
  const activeProjectId = await resolveProjectId(projectId);
  return collections.specUnits.find({ project_id: activeProjectId, scope: "product" }).toArray();
}

export async function getSpec(specId: string): Promise<SpecUnit | undefined> {
  const collections = await getMongoCollections();
  return (await collections.specUnits.findOne({ _id: specId })) ?? undefined;
}

export async function getProductSpec(productSpecId: string): Promise<SpecUnit | undefined> {
  const collections = await getMongoCollections();
  return (
    (await collections.specUnits.findOne({
      _id: productSpecId,
      scope: "product"
    })) ?? undefined
  );
}

export async function updateSpec(
  specId: string,
  patch: Partial<Omit<SpecUnit, "_id" | "scope" | "project_id">>,
  actor?: AuthenticatedUser
): Promise<SpecUnit> {
  const collections = await getMongoCollections();
  const spec = await getSpec(specId);

  if (!spec) {
    throw new Error("Spec not found.");
  }

  if (actor) {
    assertCanAdvanceChange(actor, spec.project_id);
  }

  const nextSpec: SpecUnit = {
    ...spec,
    ...patch,
    _id: spec._id,
    scope: spec.scope,
    project_id: spec.project_id
  };

  await collections.specUnits.replaceOne({ _id: specId }, nextSpec);
  return nextSpec;
}

export async function updateProductSpec(
  productSpecId: string,
  patch: Partial<Omit<SpecUnit, "_id" | "scope">>,
  actor?: AuthenticatedUser
): Promise<SpecUnit> {
  const collections = await getMongoCollections();
  const spec = await getProductSpec(productSpecId);

  if (!spec) {
    throw new Error("Product spec not found.");
  }

  if (actor) {
    assertCanAdvanceChange(actor, spec.project_id);
  }

  const nextSpec: SpecUnit = {
    ...spec,
    ...patch,
    _id: spec._id,
    scope: "product"
  };

  await collections.specUnits.replaceOne({ _id: productSpecId }, nextSpec);
  return nextSpec;
}

export async function deleteProductSpec(id: string, actor?: AuthenticatedUser): Promise<void> {
  const collections = await getMongoCollections();
  const spec = await getProductSpec(id);

  if (!spec) {
    throw new Error("Product spec not found.");
  }

  if (actor) {
    assertCanAdvanceChange(actor, spec.project_id);
  }

  const snapshots = await collections.snapshots.find({ spec_id: id }).project({ _id: 1 }).toArray();
  const docIds = snapshots.map((s) => s._id);

  await collections.snapshots.deleteMany({ spec_id: id });
  await collections.specUnits.deleteOne({ _id: id });

  if (docIds.length > 0) {
    deleteVectorsByDocIds(docIds).catch(() => {});
  }
}

export async function deleteChangeSpec(id: string, actor?: AuthenticatedUser): Promise<void> {
  const collections = await getMongoCollections();
  const spec = await getSpec(id);

  if (!spec) {
    throw new Error("Spec not found.");
  }

  if (spec.scope !== "change") {
    throw new Error("Only change-scoped specs can be deleted with this method.");
  }

  if (actor) {
    assertCanAdvanceChange(actor, spec.project_id);
  }

  const snapshots = await collections.snapshots.find({ spec_id: id }).project({ _id: 1 }).toArray();
  const docIds = snapshots.map((s) => s._id);

  await collections.snapshots.deleteMany({ spec_id: id });
  await collections.specUnits.deleteOne({ _id: id });

  if (docIds.length > 0) {
    deleteVectorsByDocIds(docIds).catch(() => {});
  }
}

export async function getSpecSnapshots(specId: string): Promise<Snapshot[]> {
  const collections = await getMongoCollections();
  return collections.snapshots.find({ spec_id: specId }).sort({ created_at: -1 }).toArray();
}

export async function getSnapshot(snapshotId: string): Promise<Snapshot | undefined> {
  const collections = await getMongoCollections();
  return (await collections.snapshots.findOne({ _id: snapshotId })) ?? undefined;
}

export async function getReviewSession(
  sessionId: string,
  actor?: AuthenticatedUser
): Promise<ReviewSession | undefined> {
  const collections = await getMongoCollections();
  const session = (await collections.reviewSessions.findOne({ _id: sessionId })) ?? undefined;
  if (session && actor) {
    assertProjectReadable(actor, session.project_id);
  }
  return session;
}

export async function listReviewSessions(): Promise<ReviewSession[]> {
  return listReviewSessionsForProject();
}

export async function getCurrentReviewSessionForChange(
  changeId: string
): Promise<ReviewSession | undefined> {
  const change = await getChange(changeId);
  if (!change?.current_review_session_id) {
    return undefined;
  }
  return getReviewSession(change.current_review_session_id);
}

export async function getComments(sessionId: string, specId: string): Promise<Comment[]> {
  const collections = await getMongoCollections();
  return collections.comments.find({ review_session_id: sessionId, spec_id: specId }).toArray();
}

export async function createComment(input: {
  actor?: AuthenticatedUser;
  sessionId: string;
  specId: string;
  author: string;
  content: string;
  anchor: Comment["anchor"];
}): Promise<Comment> {
  const collections = await getMongoCollections();
  const session = await requireReviewSession(input.sessionId);
  if (input.actor) {
    assertCanComment(input.actor, session.project_id);
    if (input.actor.username !== input.author && !input.actor.global_roles.includes("platform_admin")) {
      throw new Error("Comment author must match the authenticated user.");
    }
  }
  const baseline = session.baselines.find((item) => item.spec_id === input.specId);

  if (!baseline) {
    throw new Error("Spec is not part of the review session.");
  }

  const comment: Comment = {
    _id: createId("comment"),
    review_session_id: input.sessionId,
    spec_id: input.specId,
    snapshot_id: baseline.snapshot_id,
    author: input.author,
    content: input.content,
    anchor: input.anchor,
    status: "open",
    thread_id: createId("thread"),
    created_at: nowIso()
  };

  await collections.comments.insertOne(comment);
  enqueueEmbeddingTask("comment", comment._id, session.project_id).catch(() => {});
  return comment;
}

export async function updateComment(
  id: string,
  status: Comment["status"],
  actor?: AuthenticatedUser
): Promise<Comment> {
  const collections = await getMongoCollections();
  const comment = await collections.comments.findOne({ _id: id });

  if (!comment) {
    throw new Error("Comment not found.");
  }

  if (actor) {
    const session = await collections.reviewSessions.findOne({ _id: comment.review_session_id });
    if (session) {
      const isAuthor = actor.email === comment.author;
      if (!isAuthor) {
        assertCanComment(actor, session.project_id);
      }
    }
  }

  const nextComment: Comment = {
    ...comment,
    status
  };
  await collections.comments.replaceOne({ _id: id }, nextComment);
  return nextComment;
}

export async function startReview(
  changeId: string,
  reviewers: Array<Pick<ReviewSession["reviewers"][number], "user" | "role" | "assigned_specs">>,
  actor?: AuthenticatedUser
): Promise<ReviewSession> {
  const collections = await getMongoCollections();
  const store = await getStore();
  const change = requireFromStore(store.changes, changeId, "Change not found.");
  if (actor) {
    assertCanAdvanceChange(actor, change.project_id);
  }

  const resolvedReviewers = reviewers.length > 0
    ? reviewers
    : await defaultReviewersForChange(changeId);

  const specs = store.specUnits.filter(
    (spec) => spec.project_id === change.project_id && spec.change_id === changeId
  );

  if (specs.length === 0 || specs.some((spec) => !spec.working_snapshot_id)) {
    throw new Error("Review readiness failed because one or more specs have no working snapshot.");
  }

  if (change.current_review_session_id) {
    const current = store.reviewSessions.find(
      (session) => session._id === change.current_review_session_id
    );
    if (current?.status === "active") {
      throw new Error("Change already has an active review session. Cancel or restart the existing review first.");
    }
  }

  const createdAt = nowIso();
  const baselineSnapshots: Snapshot[] = [];
  const baselines = specs.map((spec) => {
    const working = requireFromStore(
      store.snapshots,
      spec.working_snapshot_id!,
      "Working snapshot missing."
    );

    const baselineSnapshot: Snapshot = {
      ...working,
      _id: createId("snap"),
      type: "baseline",
      created_at: createdAt
    };
    baselineSnapshots.push(baselineSnapshot);

    const productSpec = store.specUnits.find(
      (item) =>
        item.project_id === change.project_id &&
        item.scope === "product" &&
        item.repo === spec.repo &&
        item.capability === spec.capability
    );

    return {
      spec_id: spec._id,
      snapshot_id: baselineSnapshot._id,
      product_spec_id: productSpec?._id ?? null,
      product_spec_snapshot_id: productSpec?.working_snapshot_id ?? null
    };
  });

  const session: ReviewSession = {
    _id: createId("review_session"),
    project_id: change.project_id,
    change_id: changeId,
    status: "active",
    baselines,
    reviewers: resolvedReviewers.map((reviewer) => ({
      ...reviewer,
      status: "pending" as const
    })),
    spec_reviews: resolvedReviewers.flatMap((reviewer) =>
      reviewer.assigned_specs.map((specId) => ({
        spec_id: specId,
        reviewer: reviewer.user,
        status: "pending" as const,
        reviewed_at: null
      }))
    ),
    approval_rule: "all_required",
    created_at: createdAt,
    completed_at: null
  };

  if (baselineSnapshots.length > 0) {
    await collections.snapshots.insertMany(baselineSnapshots);
  }
  await collections.reviewSessions.insertOne(session);

  const nextChange: Change = {
    ...change,
    current_review_session_id: session._id,
    status: "in_review",
    version: change.version + 1,
    updated_at: nowIso()
  };
  await collections.changes.replaceOne({ _id: change._id }, nextChange);

  await Promise.all(
    specs.map((spec) =>
      collections.specUnits.updateOne(
        { _id: spec._id },
        {
          $set: {
            review_status: "pending",
            new_version_available: false
          }
        }
      )
    )
  );

  return session;
}

export async function restartReview(changeId: string, actor?: AuthenticatedUser): Promise<ReviewSession> {
  const change = await requireChange(changeId);
  if (actor) {
    assertCanAdvanceChange(actor, change.project_id);
  }

  const specs = await listSpecsForChange(changeId);
  const hasNewContent = specs.some((s) => s.new_version_available);
  if (change.status !== "changes_requested" && !hasNewContent) {
    throw new Error("No content changes detected. Restart is only allowed when specs have new versions or review changes were requested.");
  }

  const current = await getCurrentReviewSessionForChange(changeId);
  const fallbackReviewers =
    current?.reviewers.map((reviewer) => ({
      user: reviewer.user,
      role: reviewer.role,
      assigned_specs: reviewer.assigned_specs
    })) ?? (await defaultReviewersForChange(changeId));

  if (current) {
    const collections = await getMongoCollections();
    const superseded: ReviewSession = {
      ...current,
      status: "superseded",
      completed_at: nowIso()
    };
    await collections.reviewSessions.replaceOne({ _id: current._id }, superseded);
  }

  return startReview(changeId, fallbackReviewers, actor);
}

export async function reviewerApprove(
  sessionId: string,
  user: string,
  actor?: AuthenticatedUser
): Promise<ReviewSession> {
  const collections = await getMongoCollections();
  const session = await requireReviewSession(sessionId);
  if (actor) {
    assertCanReviewAs(actor, session.project_id, user);
  }
  const reviewer = session.reviewers.find((item) => item.user === user);

  if (!reviewer) {
    throw new Error("Reviewer not assigned to this session.");
  }

  const nextSession: ReviewSession = {
    ...session,
    reviewers: session.reviewers.map((item) =>
      item.user === user ? { ...item, status: "approved" } : item
    )
  };
  await collections.reviewSessions.replaceOne({ _id: sessionId }, nextSession);
  return nextSession;
}

export async function reviewerRequestChanges(
  sessionId: string,
  user: string,
  actor?: AuthenticatedUser
): Promise<ReviewSession> {
  const collections = await getMongoCollections();
  const session = await requireReviewSession(sessionId);
  if (actor) {
    assertCanReviewAs(actor, session.project_id, user);
  }
  const reviewer = session.reviewers.find((item) => item.user === user);
  const change = await requireChange(session.change_id);

  if (!reviewer) {
    throw new Error("Reviewer not assigned to this session.");
  }

  const nextSession: ReviewSession = {
    ...session,
    reviewers: session.reviewers.map((item) =>
      item.user === user ? { ...item, status: "changes_requested" } : item
    )
  };
  const nextChange: Change = {
    ...change,
    status: "changes_requested",
    updated_at: nowIso()
  };

  await collections.reviewSessions.replaceOne({ _id: sessionId }, nextSession);
  await collections.changes.replaceOne({ _id: change._id }, nextChange);
  await collections.specUnits.updateMany(
    { change_id: change._id },
    { $set: { review_status: "changes_requested" } }
  );

  return nextSession;
}

function aggregateReviewerStatus(
  specReviews: ReviewSession["spec_reviews"],
  reviewerUser: string
): "pending" | "approved" | "changes_requested" {
  const records = specReviews.filter((r) => r.reviewer === reviewerUser);
  if (records.length === 0) return "pending";
  if (records.some((r) => r.status === "changes_requested")) return "changes_requested";
  if (records.every((r) => r.status === "approved")) return "approved";
  return "pending";
}

function aggregateSpecReviewStatus(
  specReviews: ReviewSession["spec_reviews"],
  specId: string
): "pending" | "approved" | "changes_requested" {
  const records = specReviews.filter((r) => r.spec_id === specId);
  if (records.length === 0) return "pending";
  if (records.some((r) => r.status === "changes_requested")) return "changes_requested";
  if (records.every((r) => r.status === "approved")) return "approved";
  return "pending";
}

export async function reviewerApproveSpec(
  sessionId: string,
  specId: string,
  user: string,
  actor?: AuthenticatedUser
): Promise<ReviewSession> {
  const collections = await getMongoCollections();
  const session = await requireReviewSession(sessionId);
  if (actor) {
    assertCanReviewAs(actor, session.project_id, user);
  }

  const reviewer = session.reviewers.find((item) => item.user === user);
  if (!reviewer) {
    throw new Error("Reviewer not assigned to this session.");
  }
  if (!reviewer.assigned_specs.includes(specId)) {
    throw new Error("Reviewer is not assigned to this spec.");
  }

  const specReviews = (session.spec_reviews ?? []).map((r) =>
    r.spec_id === specId && r.reviewer === user
      ? { ...r, status: "approved" as const, reviewed_at: nowIso() }
      : r
  );

  const nextSession: ReviewSession = {
    ...session,
    spec_reviews: specReviews,
    reviewers: session.reviewers.map((item) => ({
      ...item,
      status: aggregateReviewerStatus(specReviews, item.user)
    }))
  };
  await collections.reviewSessions.replaceOne({ _id: sessionId }, nextSession);

  const specStatus = aggregateSpecReviewStatus(specReviews, specId);
  await collections.specUnits.updateOne(
    { _id: specId },
    { $set: { review_status: specStatus } }
  );

  return nextSession;
}

export async function reviewerRequestChangesForSpec(
  sessionId: string,
  specId: string,
  user: string,
  actor?: AuthenticatedUser
): Promise<ReviewSession> {
  const collections = await getMongoCollections();
  const session = await requireReviewSession(sessionId);
  if (actor) {
    assertCanReviewAs(actor, session.project_id, user);
  }

  const reviewer = session.reviewers.find((item) => item.user === user);
  if (!reviewer) {
    throw new Error("Reviewer not assigned to this session.");
  }
  if (!reviewer.assigned_specs.includes(specId)) {
    throw new Error("Reviewer is not assigned to this spec.");
  }

  const change = await requireChange(session.change_id);
  const specReviews = (session.spec_reviews ?? []).map((r) =>
    r.spec_id === specId && r.reviewer === user
      ? { ...r, status: "changes_requested" as const, reviewed_at: nowIso() }
      : r
  );

  const nextSession: ReviewSession = {
    ...session,
    spec_reviews: specReviews,
    reviewers: session.reviewers.map((item) => ({
      ...item,
      status: aggregateReviewerStatus(specReviews, item.user)
    }))
  };

  const nextChange: Change = {
    ...change,
    status: "changes_requested",
    updated_at: nowIso()
  };

  await collections.reviewSessions.replaceOne({ _id: sessionId }, nextSession);
  await collections.changes.replaceOne({ _id: change._id }, nextChange);

  const specStatus = aggregateSpecReviewStatus(specReviews, specId);
  await collections.specUnits.updateOne(
    { _id: specId },
    { $set: { review_status: specStatus } }
  );

  return nextSession;
}

export async function approveChange(changeId: string, actor?: AuthenticatedUser): Promise<Change> {
  const collections = await getMongoCollections();
  const change = await requireChange(changeId);
  if (actor) {
    assertCanAdvanceChange(actor, change.project_id);
  }
  const session = await getCurrentReviewSessionForChange(changeId);

  if (!session) {
    throw new Error("Change has no active review session.");
  }

  const hasOpenComments =
    (await collections.comments.countDocuments({
      review_session_id: session._id,
      status: "open"
    })) > 0;

  if (hasOpenComments) {
    throw new Error("Resolve all open comments before approving the change.");
  }

  const specs = await listSpecsForChange(changeId);
  const changeSpecs = specs.filter((s) => s.scope === "change");
  const specReviews = session.spec_reviews ?? [];

  if (specReviews.length > 0) {
    const hasUnapprovedSpec = changeSpecs.some((spec) => {
      const records = specReviews.filter((r) => r.spec_id === spec._id);
      return records.length === 0 || records.some((r) => r.status !== "approved");
    });
    if (hasUnapprovedSpec) {
      throw new Error("All specs must be approved by all assigned reviewers before the PM can approve the change.");
    }
  } else if (session.reviewers.some((reviewer) => reviewer.status !== "approved")) {
    throw new Error("All reviewers must approve before the PM can approve the change.");
  }

  const completedAt = nowIso();
  const nextChange: Change = {
    ...change,
    status: "approved",
    updated_at: completedAt,
    version: change.version + 1
  };
  const nextSession: ReviewSession = {
    ...session,
    status: "completed",
    completed_at: completedAt
  };

  await collections.changes.replaceOne({ _id: changeId }, nextChange);
  await collections.reviewSessions.replaceOne({ _id: session._id }, nextSession);
  await collections.specUnits.updateMany(
    { change_id: changeId },
    { $set: { review_status: "approved" } }
  );

  return nextChange;
}

export async function skipReview(changeId: string, actor?: AuthenticatedUser): Promise<Change> {
  const collections = await getMongoCollections();
  const change = await requireChange(changeId);
  if (actor) {
    assertCanAdvanceChange(actor, change.project_id);
  }

  if ((change.review_required ?? true)) {
    throw new Error("Cannot skip review for a change that requires review.");
  }

  if (change.status !== "draft") {
    throw new Error("Only draft changes can skip review.");
  }

  const nextChange: Change = {
    ...change,
    status: "approved",
    version: change.version + 1,
    updated_at: nowIso()
  };
  await collections.changes.replaceOne({ _id: changeId }, nextChange);
  return nextChange;
}

export async function cancelReview(changeId: string, actor?: AuthenticatedUser): Promise<Change> {
  const collections = await getMongoCollections();
  const change = await requireChange(changeId);
  if (actor) {
    assertCanAdvanceChange(actor, change.project_id);
  }

  if (change.status !== "in_review" && change.status !== "changes_requested") {
    throw new Error("Only in-review or changes-requested changes can have their review cancelled.");
  }

  if (change.current_review_session_id) {
    const session = await getReviewSession(change.current_review_session_id);
    if (session?.status === "active") {
      const superseded: ReviewSession = {
        ...session,
        status: "superseded",
        completed_at: nowIso()
      };
      await collections.reviewSessions.replaceOne({ _id: session._id }, superseded);
    }
  }

  const nextChange: Change = {
    ...change,
    status: "draft",
    current_review_session_id: null,
    version: change.version + 1,
    updated_at: nowIso()
  };
  await collections.changes.replaceOne({ _id: changeId }, nextChange);

  await collections.specUnits.updateMany(
    { change_id: changeId },
    { $set: { review_status: "not_in_review" } }
  );

  return nextChange;
}

export async function archiveChange(changeId: string, actor?: AuthenticatedUser): Promise<Change> {
  const collections = await getMongoCollections();
  const change = await requireChange(changeId);
  if (actor) {
    assertCanAdvanceChange(actor, change.project_id);
  }

  if (change.status !== "approved") {
    throw new Error("Only approved changes can be archived.");
  }

  const nextChange: Change = {
    ...change,
    status: "archived",
    updated_at: nowIso(),
    version: change.version + 1
  };
  await collections.changes.replaceOne({ _id: changeId }, nextChange);
  return nextChange;
}

export async function bindRepoChange(input: {
  project_id?: string;
  change_id: string;
  repo: string;
  branch: string;
  change_name: string;
}): Promise<{
  project_id: string;
  change_id: string;
  repo: string;
  branch: string;
  change_name: string;
  status: "bound";
}> {
  const collections = await getMongoCollections();
  const change = await requireChange(input.change_id);
  const resolvedProject = await resolveProject({
    projectId: input.project_id ?? undefined,
    repo: input.repo
  });
  const inferredRepoProject = await inferUniqueProjectForRepo(input.repo);

  if (resolvedProject._id !== change.project_id) {
    throw new Error(
      `Change ${input.change_id} belongs to project ${change.project_id}, not ${resolvedProject._id}.`
    );
  }

  if (inferredRepoProject && inferredRepoProject._id !== change.project_id) {
    throw new Error(
      `Repo ${input.repo} is bound to project ${inferredRepoProject._id}, which conflicts with change ${input.change_id}.`
    );
  }

  await ensureRepoBinding(change.project_id, input.repo, input.branch);

  const exists = repoBindings(change.repo_changes).some(
    (b) =>
      b.repo === input.repo &&
      b.branch === input.branch &&
      b.change_name === input.change_name
  );

  if (!exists) {
    const nextChange: Change = {
      ...change,
      repo_changes: [
        ...change.repo_changes,
        {
          type: "repo" as const,
          repo: input.repo,
          branch: input.branch,
          change_name: input.change_name
        }
      ],
      version: change.version + 1,
      updated_at: nowIso()
    };
    await collections.changes.replaceOne({ _id: change._id }, nextChange);
  }

  return {
    project_id: change.project_id,
    change_id: change._id,
    repo: input.repo,
    branch: input.branch,
    change_name: input.change_name,
    status: "bound"
  };
}

export async function syncUpload(payload: SyncUploadPayload) {
  const collections = await getMongoCollections();
  const inferredRepoProject = await inferUniqueProjectForRepo(payload.repo);
  const project = await resolveProject({
    projectId: payload.project_id ?? undefined,
    repo: payload.repo
  });
  const change =
    payload.scope === "change" && payload.change_id ? await requireChange(payload.change_id) : undefined;

  if (change && change.project_id !== project._id) {
    throw new Error(`Change ${payload.change_id} belongs to project ${change.project_id}, not ${project._id}.`);
  }

  if (payload.project_id && inferredRepoProject && inferredRepoProject._id !== payload.project_id) {
    throw new Error(
      `Repo ${payload.repo} resolves to project ${inferredRepoProject._id}, which conflicts with explicit project ${payload.project_id}.`
    );
  }

  await ensureRepoBinding(project._id, payload.repo, payload.branch);

  const existing = await collections.specUnits.findOne(
    payload.scope === "change"
      ? {
          scope: "change",
          project_id: project._id,
          change_id: payload.change_id,
          repo: payload.repo,
          path: payload.path
        }
      : {
          scope: "product",
          project_id: project._id,
          repo: payload.repo,
          capability: payload.capability
        }
  );

  const spec: SpecUnit =
    existing ??
    ({
      _id: createId("spec"),
      project_id: project._id,
      scope: payload.scope,
      change_id: payload.change_id,
      capability: payload.capability,
      repo: payload.repo,
      branch: payload.branch,
      change_name: payload.change_name,
      path: payload.path,
      owner_role: "engineering",
      working_snapshot_id: null,
      sync_status: "pending",
      review_status: payload.scope === "change" ? "not_in_review" : null,
      last_synced_at: null,
      new_version_available: false
    } satisfies SpecUnit);

  const currentSnapshot = spec.working_snapshot_id
    ? await getSnapshot(spec.working_snapshot_id)
    : undefined;

  if (currentSnapshot?.content_hash === payload.content_hash) {
    const nextSpec: SpecUnit = {
      ...spec,
      branch: payload.branch,
      path: payload.path,
      change_name: payload.change_name,
      last_synced_at: payload.collected_at,
      sync_status: "synced"
    };
    await collections.specUnits.replaceOne({ _id: spec._id }, nextSpec, { upsert: true });
    return { status: "unchanged" as const, spec: nextSpec };
  }

  const snapshot: Snapshot = {
    _id: createId("snap"),
    spec_id: spec._id,
    content: payload.content,
    content_hash: payload.content_hash,
    type: "working",
    source: {
      repo: payload.repo,
      branch: payload.branch,
      commit_sha: payload.commit_sha,
      collected_at: payload.collected_at
    },
    created_at: payload.collected_at
  };
  await collections.snapshots.insertOne(snapshot);

  let newVersionAvailable = false;
  if (payload.scope === "change" && payload.change_id) {
    if (change?.status === "in_review") {
      newVersionAvailable = true;
    }
  }

  const nextSpec: SpecUnit = {
    ...spec,
    project_id: project._id,
    scope: payload.scope,
    change_id: payload.change_id,
    capability: payload.capability,
    repo: payload.repo,
    branch: payload.branch,
    change_name: payload.change_name,
    path: payload.path,
    working_snapshot_id: snapshot._id,
    sync_status: "synced",
    last_synced_at: payload.collected_at,
    new_version_available: newVersionAvailable
  };

  await collections.specUnits.replaceOne({ _id: spec._id }, nextSpec, { upsert: true });
  enqueueEmbeddingTask("snapshot", snapshot._id, project._id).catch(() => {});
  return { status: "synced" as const, spec: nextSpec, snapshot };
}

export async function syncBatch(items: SyncUploadPayload[]) {
  const results = await Promise.all(
    items.map(async (item) => {
      try {
        const result = await syncUpload(item);
        return {
          path: item.path,
          status: result.status
        };
      } catch (error) {
        return {
          path: item.path,
          status: "failed" as const,
          reason: error instanceof Error ? error.message : "Unknown error"
        };
      }
    })
  );

  return {
    success_count: results.filter((result) => result.status !== "failed").length,
    failed_count: results.filter((result) => result.status === "failed").length,
    results
  };
}

export async function getSyncStatus(changeId: string) {
  const change = await requireChange(changeId);
  const specs = await listSpecsForChange(changeId);
  const productSpecs = await listProductSpecs(change.project_id);

  return {
    change_id: changeId,
    spec_count: specs.length,
    product_spec_count: productSpecs.length,
    last_synced_at:
      specs
        .map((spec) => spec.last_synced_at)
        .filter((value): value is string => Boolean(value))
        .sort()
        .at(-1) ?? null,
    results: specs.map((spec) => ({
      spec_id: spec._id,
      capability: spec.capability,
      status: spec.sync_status,
      last_synced_at: spec.last_synced_at
    }))
  };
}

export async function getBaselineContext(
  sessionId: string,
  specId: string,
  actor?: AuthenticatedUser
) {
  const session = await requireReviewSession(sessionId);
  if (actor) {
    assertProjectReadable(actor, session.project_id);
  }
  const baseline = session.baselines.find((item) => item.spec_id === specId);

  if (!baseline) {
    throw new Error("Spec baseline not found.");
  }

  return {
    delta: (await getSnapshot(baseline.snapshot_id)) ?? null,
    productBaseline: baseline.product_spec_snapshot_id
      ? await getSnapshot(baseline.product_spec_snapshot_id)
      : null,
    spec: (await getSpec(specId)) ?? null
  };
}

export async function getReviewBrief(specId: string, sessionId?: string, actor?: AuthenticatedUser) {
  const spec = await getSpec(specId);

  if (!spec || !spec.working_snapshot_id) {
    throw new Error("Spec not found.");
  }

  const delta = await getSnapshot(spec.working_snapshot_id);
  const baseline = sessionId
    ? (await getBaselineContext(sessionId, specId, actor)).productBaseline
    : null;

  if (!delta) {
    throw new Error("Working snapshot missing.");
  }

  return generateReviewBrief(spec, delta.content, baseline?.content);
}

export async function getSpecIssues(specId: string, sessionId?: string, actor?: AuthenticatedUser) {
  const spec = await getSpec(specId);

  if (!spec || !spec.working_snapshot_id) {
    throw new Error("Spec not found.");
  }

  if (actor) {
    assertProjectReadable(actor, spec.project_id);
  }

  const delta = await getSnapshot(spec.working_snapshot_id);
  const baseline = sessionId
    ? (await getBaselineContext(sessionId, specId, actor)).productBaseline
    : null;

  if (!delta) {
    throw new Error("Working snapshot missing.");
  }

  return detectSingleSpecIssues(delta.content, baseline?.content);
}

export async function getCrossSpecIssues(changeId: string, actor?: AuthenticatedUser) {
  const change = await requireChange(changeId);
  if (actor) {
    assertProjectReadable(actor, change.project_id);
  }
  return detectCrossSpecIssues(await listSpecsForChange(changeId));
}

export async function getCrossSpecIssuesForSpec(
  specId: string,
  changeId?: string,
  actor?: AuthenticatedUser
) {
  const spec = await getSpec(specId);
  if (!spec) {
    throw new Error("Spec not found.");
  }
  if (actor) {
    assertProjectReadable(actor, spec.project_id);
  }

  const siblingSpecs = (await listSpecsForChange(changeId ?? spec.change_id ?? "")).filter(
    (item) => item._id !== specId
  );

  return {
    activeSpec: spec,
    siblingSpecs,
    findings: detectCrossSpecIssues([spec, ...siblingSpecs]),
    scope:
      siblingSpecs.length > 0
        ? "Findings are derived from sibling specs in the same Change."
        : "No sibling specs are available for cross-spec analysis."
  };
}

export async function getReviewerRecommendations(
  changeId: string,
  actor?: AuthenticatedUser
): Promise<ReviewerRecommendation[]> {
  const change = await requireChange(changeId);
  if (actor) {
    assertProjectReadable(actor, change.project_id);
  }
  return recommendReviewers(await listSpecsForChange(changeId));
}

export async function getProductKnowledge(productSpecId: string, actor?: AuthenticatedUser): Promise<{
  spec: SpecUnit;
  history: ProductKnowledgeEntry[];
  snapshots: Snapshot[];
}> {
  const store = await getStore();
  const spec = store.specUnits.find(
    (item) => item._id === productSpecId && item.scope === "product"
  );

  if (!spec) {
    throw new Error("Product spec not found.");
  }
  if (actor) {
    assertProjectReadable(actor, spec.project_id);
  }

  const relatedChangeIds = new Set(
    store.specUnits
      .filter(
        (item) =>
          item.project_id === spec.project_id &&
          item.scope === "change" &&
          item.capability === spec.capability &&
          item.change_id
      )
      .map((item) => item.change_id as string)
  );

  const history = sortByUpdatedAtDesc(
    store.changes.filter((change) => relatedChangeIds.has(change._id))
  ).map((change) => ({
    change_id: change._id,
    title: change.title,
    status: change.status,
    updated_at: change.updated_at,
    note:
      change.status === "archived"
        ? "Archived change contributes to the historical capability record."
        : "Active change may still reshape the capability surface."
  }));

  return {
    spec,
    history,
    snapshots: sortByCreatedAtDesc(
      store.snapshots.filter((snapshot) => snapshot.spec_id === productSpecId)
    )
  };
}

export async function getReviewerTasks(
  user: string,
  projectId?: string,
  actor?: AuthenticatedUser
) {
  const store = await getStore();
  const activeProjectId = await resolveProjectId(projectId);
  if (actor) {
    assertProjectReadable(actor, activeProjectId);
    if (actor.username !== user && !actor.global_roles.includes("platform_admin")) {
      throw new Error("Task list can only be loaded for the authenticated user.");
    }
  }
  const sessions = store.reviewSessions.filter((session) =>
    session.project_id === activeProjectId &&
    session.reviewers.some((reviewer) => reviewer.user === user)
  );

  return Promise.all(
    sessions.map(async (session) => {
      const reviewer = session.reviewers.find((item) => item.user === user)!;
      const changeSpecs = store.specUnits.filter(
        (spec) => spec.project_id === activeProjectId && spec.change_id === session.change_id
      );
      return {
        sessionId: session._id,
        change: store.changes.find((change) => change._id === session.change_id),
        reviewer,
        specs: reviewer.assigned_specs
          .map((specId) => store.specUnits.find((spec) => spec._id === specId))
          .filter((value): value is SpecUnit => Boolean(value)),
        openComments: store.comments.filter(
          (comment) =>
            comment.review_session_id === session._id &&
            reviewer.assigned_specs.includes(comment.spec_id) &&
            comment.status === "open"
        ).length,
        recommendations: recommendReviewers(changeSpecs)
      };
    })
  );
}

function generateMatchSnippet(content: string, query: string): string | undefined {
  const lowerContent = content.toLowerCase();
  const lowerQuery = query.toLowerCase().trim();
  const tokens = lowerQuery.split(/\s+/).filter(Boolean);
  const searchTerm = tokens[0];
  if (!searchTerm) return undefined;

  const idx = lowerContent.indexOf(searchTerm);
  if (idx === -1) return undefined;

  const radius = 50;
  const start = Math.max(0, idx - radius);
  const end = Math.min(content.length, idx + searchTerm.length + radius);
  const snippet = content.slice(start, end).replace(/\n/g, " ");
  const prefix = start > 0 ? "..." : "";
  const suffix = end < content.length ? "..." : "";
  return `${prefix}${snippet}${suffix}`;
}

async function textSearchChanges(query: string, projectId: string): Promise<SearchResult[]> {
  const collections = await getMongoCollections();
  const docs = await collections.changes
    .find(
      { $text: { $search: query }, project_id: projectId },
      { projection: { score: { $meta: "textScore" } } }
    )
    .sort({ score: { $meta: "textScore" } } as any)
    .toArray();

  return docs.map((doc) => ({
    kind: "change" as const,
    id: doc._id,
    title: doc.title,
    subtitle: `${doc._id} · ${doc.status}`,
    href: `/changes/${doc._id}`,
    matchSnippet: generateMatchSnippet(doc.description || "", query),
    score: (doc as any).score
  }));
}

async function textSearchSpecs(query: string, projectId: string): Promise<SearchResult[]> {
  const collections = await getMongoCollections();
  const snapshots = await collections.snapshots
    .find(
      { $text: { $search: query } },
      { projection: { score: { $meta: "textScore" } } }
    )
    .sort({ score: { $meta: "textScore" } } as any)
    .toArray();

  if (snapshots.length === 0) return [];

  const specIds = [...new Set(snapshots.map((s) => s.spec_id))];
  const specUnits = await collections.specUnits
    .find({ _id: { $in: specIds }, project_id: projectId })
    .toArray();
  const specMap = new Map(specUnits.map((s) => [s._id, s]));

  const seen = new Map<string, SearchResult>();
  for (const snap of snapshots) {
    const spec = specMap.get(snap.spec_id);
    if (!spec) continue;

    if (seen.has(spec._id)) continue;

    const kind = spec.scope === "product" ? ("product_spec" as const) : ("change" as const);
    const href =
      spec.scope === "product"
        ? `/product-specs/${spec._id}`
        : `/changes/${spec.change_id}`;

    seen.set(spec._id, {
      kind,
      id: spec._id,
      title: spec.capability,
      subtitle: `${spec.repo} · ${spec.path}`,
      href,
      matchSnippet: generateMatchSnippet(snap.content || "", query),
      score: (snap as any).score
    });
  }

  return [...seen.values()];
}

async function textSearchComments(query: string, projectId: string): Promise<SearchResult[]> {
  const collections = await getMongoCollections();
  const comments = await collections.comments
    .find(
      { $text: { $search: query } },
      { projection: { score: { $meta: "textScore" } } }
    )
    .sort({ score: { $meta: "textScore" } } as any)
    .toArray();

  if (comments.length === 0) return [];

  const sessionIds = [...new Set(comments.map((c) => c.review_session_id))];
  const sessions = await collections.reviewSessions
    .find({ _id: { $in: sessionIds }, project_id: projectId })
    .toArray();
  const sessionMap = new Map(sessions.map((s) => [s._id, s]));

  const seen = new Map<string, SearchResult>();
  for (const comment of comments) {
    const session = sessionMap.get(comment.review_session_id);
    if (!session) continue;

    if (seen.has(session._id)) continue;

    seen.set(session._id, {
      kind: "review_session" as const,
      id: session._id,
      title: session._id,
      subtitle: `${session.change_id} · ${session.status}`,
      href: `/reviews/${session._id}`,
      matchSnippet: generateMatchSnippet(comment.content || "", query),
      score: (comment as any).score
    });
  }

  return [...seen.values()];
}

export async function searchCenter(query: string, projectId?: string): Promise<SearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  const activeProjectId = await resolveProjectId(projectId);
  const [changeResults, specResults, commentResults] = await Promise.all([
    textSearchChanges(trimmed, activeProjectId),
    textSearchSpecs(trimmed, activeProjectId),
    textSearchComments(trimmed, activeProjectId)
  ]);

  const mergedMap = new Map<string, SearchResult>();
  for (const result of [...changeResults, ...specResults, ...commentResults]) {
    const existing = mergedMap.get(result.id);
    if (!existing || (result.score ?? 0) > (existing.score ?? 0)) {
      mergedMap.set(result.id, result);
    }
  }

  const allResults = [...mergedMap.values()];
  allResults.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  const changes = allResults.filter((r) => r.kind === "change");
  const specs = allResults.filter((r) => r.kind === "product_spec");
  const reviews = allResults.filter((r) => r.kind === "review_session");

  return [...changes, ...specs, ...reviews];
}

export async function getProjectReviewers(projectId: string, actor?: AuthenticatedUser) {
  if (actor) {
    assertProjectReadable(actor, projectId);
  }
  const project = await getProject(projectId);
  if (!project) {
    throw new Error("Project not found.");
  }
  return project.default_reviewers ?? [];
}

export async function updateProjectReviewers(
  projectId: string,
  reviewers: Project["default_reviewers"],
  actor?: AuthenticatedUser
): Promise<Project> {
  const collections = await getMongoCollections();
  const project = await getProject(projectId);
  if (!project) {
    throw new Error("Project not found.");
  }
  if (actor) {
    assertCanManageReviewers(actor, projectId);
  }

  const nextProject: Project = {
    ...project,
    default_reviewers: reviewers,
    updated_at: nowIso()
  };
  await collections.projects.replaceOne({ _id: projectId }, nextProject);
  return nextProject;
}

async function defaultReviewersForChange(changeId: string) {
  const change = await requireChange(changeId);
  const project = await getProject(change.project_id);
  const specs = await listSpecsForChange(changeId);
  const projectReviewers = project?.default_reviewers ?? [];

  if (projectReviewers.length === 0) {
    throw new Error("No default reviewers configured for this project. Please configure project reviewers or specify reviewers explicitly.");
  }

  return projectReviewers.map((config) => ({
    user: config.user,
    role: config.role,
    assigned_specs: specs.map((spec) => spec._id)
  }));
}

export async function listReviewSessionsForProject(projectId?: string): Promise<ReviewSession[]> {
  const collections = await getMongoCollections();
  const activeProjectId = await resolveProjectId(projectId);
  return collections.reviewSessions
    .find({ project_id: activeProjectId })
    .sort({ created_at: -1 })
    .toArray();
}

async function resolveProjectId(projectId?: string) {
  return (await resolveProject({ projectId }))._id;
}

export async function getActiveProject(projectId?: string): Promise<Project> {
  const activeProjectId = await resolveProjectId(projectId);
  return (await getProject(activeProjectId)) ?? (await getDefaultProject());
}

export async function listProjectCatalog(actor?: AuthenticatedUser): Promise<Project[]> {
  const projects = await listProjects();
  if (!actor) {
    return projects;
  }
  return projects.filter(
    (project) =>
      actor.global_roles.includes("platform_admin") ||
      actor.memberships.some((membership) => membership.project_id === project._id)
  );
}

export async function createProject(input: {
  actor?: AuthenticatedUser;
  slug: string;
  name: string;
  description?: string | null;
  default_reviewers?: Project["default_reviewers"];
  is_default?: boolean;
}): Promise<Project> {
  const collections = await getMongoCollections();
  if (input.actor) {
    assertCanCreateProject(input.actor);
  }
  const slug = normalizeProjectSlug(input.slug);
  await assertProjectSlugAvailable(slug);
  const timestamp = nowIso();
  const project: Project = {
    _id: `project-${slug}`,
    slug,
    name: input.name.trim(),
    description: normalizeOptionalText(input.description),
    repo_bindings: [],
    default_reviewers: input.default_reviewers ?? [],
    is_default: input.is_default ?? false,
    deleted_at: null,
    created_at: timestamp,
    updated_at: timestamp
  };

  if (project.is_default) {
    await collections.projects.updateMany(
      { is_default: true },
      { $set: { is_default: false, updated_at: timestamp } }
    );
  }

  await collections.projects.insertOne(project);
  return project;
}

export async function updateProject(
  projectId: string,
  patch: Partial<Pick<Project, "slug" | "name" | "description" | "is_default">>,
  actor?: AuthenticatedUser
): Promise<Project> {
  const collections = await getMongoCollections();
  const current = await getProject(projectId);

  if (!current) {
    throw new Error("Project not found.");
  }
  if (actor) {
    assertCanManageProject(actor, current._id);
  }

  const nextSlug = patch.slug ? normalizeProjectSlug(patch.slug) : current.slug;
  if (nextSlug !== current.slug) {
    await assertProjectSlugAvailable(nextSlug, current._id);
  }

  const nextProject: Project = {
    ...current,
    slug: nextSlug,
    name: patch.name ? patch.name.trim() : current.name,
    description:
      patch.description === undefined
        ? current.description
        : normalizeOptionalText(patch.description),
    is_default: patch.is_default ?? current.is_default,
    updated_at: nowIso()
  };

  if (nextProject.is_default) {
    await collections.projects.updateMany(
      { _id: { $ne: current._id }, is_default: true },
      { $set: { is_default: false, updated_at: nextProject.updated_at } }
    );
  } else if (current.is_default && patch.is_default === false) {
    throw new Error("A default project is required. Set another project as default first.");
  }

  await collections.projects.replaceOne({ _id: current._id }, nextProject);
  return nextProject;
}

export async function deleteProject(
  projectId: string,
  actor?: AuthenticatedUser
): Promise<Project> {
  const collections = await getMongoCollections();
  const current = await getProject(projectId);

  if (!current) {
    throw new Error("Project not found.");
  }
  if (actor) {
    assertCanManageProject(actor, current._id);
  }
  if (current.is_default) {
    throw new Error("Cannot delete the default project. Set another project as default first.");
  }
  if (current.deleted_at) {
    throw new Error("Project is already deleted.");
  }

  const nextProject: Project = {
    ...current,
    deleted_at: nowIso(),
    updated_at: nowIso()
  };

  await collections.projects.replaceOne({ _id: current._id }, nextProject);
  return nextProject;
}

async function ensureRepoBinding(projectId: string, repo: string, defaultBranch: string) {
  const collections = await getMongoCollections();
  await collections.projects.updateOne(
    { _id: projectId, "repo_bindings.repo": { $ne: repo } },
    {
      $addToSet: {
        repo_bindings: { repo: repo.trim(), default_branch: defaultBranch.trim() || "main" }
      }
    }
  );
}

async function inferUniqueProjectForRepo(repo: string) {
  const matches = (await listProjects()).filter((project) =>
    project.repo_bindings.some((binding) => binding.repo === repo)
  );

  return matches.length === 1 ? matches[0] : undefined;
}

function normalizeProjectSlug(slug: string) {
  const normalized = slug
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!normalized) {
    throw new Error("Project slug is required.");
  }

  return normalized;
}

function normalizeOptionalText(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

async function assertProjectSlugAvailable(slug: string, excludeProjectId?: string) {
  const projects = await listProjects();
  const conflict = projects.find(
    (project) => project.slug === slug && project._id !== excludeProjectId
  );

  if (conflict) {
    throw new Error(`Project slug already exists: ${slug}`);
  }
}

async function requireChange(id: string): Promise<Change> {
  const change = await getChange(id);
  if (!change) {
    throw new Error("Change not found.");
  }
  return change;
}

async function requireReviewSession(sessionId: string): Promise<ReviewSession> {
  const session = await getReviewSession(sessionId);
  if (!session) {
    throw new Error("Review session not found.");
  }
  return session;
}

function requireFromStore<T extends { _id: string }>(
  items: T[],
  id: string,
  message: string
): T {
  const item = items.find((entry) => entry._id === id);
  if (!item) {
    throw new Error(message);
  }
  return item;
}

// ---------------------------------------------------------------------------
// Embedding Task management
// ---------------------------------------------------------------------------

export interface EmbeddingTaskStats {
  pending: number;
  processing: number;
  done: number;
  failed: number;
}

export async function getEmbeddingTaskStats(
  projectId: string
): Promise<EmbeddingTaskStats> {
  const collections = await getMongoCollections();
  const pipeline = [
    { $match: { project_id: projectId } },
    { $group: { _id: "$status", count: { $sum: 1 } } }
  ];
  const results = await collections.embeddingTasks.aggregate(pipeline).toArray();
  const stats: EmbeddingTaskStats = { pending: 0, processing: 0, done: 0, failed: 0 };
  for (const row of results) {
    const status = row._id as keyof EmbeddingTaskStats;
    if (status in stats) {
      stats[status] = row.count as number;
    }
  }
  return stats;
}

export async function listEmbeddingTasks(
  projectId: string,
  options: { status?: string; page: number; pageSize: number }
): Promise<{ items: import("../domain/models").EmbeddingTask[]; total: number }> {
  const collections = await getMongoCollections();
  const filter: Record<string, unknown> = { project_id: projectId };
  if (options.status) {
    filter.status = options.status;
  }
  const total = await collections.embeddingTasks.countDocuments(filter);
  const items = await collections.embeddingTasks
    .find(filter)
    .sort({ created_at: -1 })
    .skip((options.page - 1) * options.pageSize)
    .limit(options.pageSize)
    .toArray();
  return { items, total };
}

export async function retryEmbeddingTask(taskId: string): Promise<void> {
  const collections = await getMongoCollections();
  const result = await collections.embeddingTasks.findOneAndUpdate(
    { _id: taskId, status: "failed" },
    { $set: { status: "pending", updated_at: nowIso() }, $unset: { error: "" } }
  );
  if (!result) {
    throw new Error("Task not found or not in failed status");
  }
}

export async function resetEmbeddingTask(taskId: string): Promise<void> {
  const collections = await getMongoCollections();
  const task = await collections.embeddingTasks.findOne({ _id: taskId });
  if (!task) {
    throw new Error("Task not found");
  }
  await deleteVectorsByDocIds([task.doc_id]);
  await collections.embeddingTasks.updateOne(
    { _id: taskId },
    { $set: { status: "pending", retry_count: 0, updated_at: nowIso() }, $unset: { error: "" } }
  );
}
