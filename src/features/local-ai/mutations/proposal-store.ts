import type { BackupDocument } from "@/data/model/backup-document";

import type {
  ChangeFields,
  ChangeProposal,
  MutationResult,
  PrepareChangeArgs,
  PrepareChangeResult,
  ProposalStatus,
} from "./change-types";
import { describeRecord, prepareChange, type ChangePlan } from "./prepare-change";

type Entry = {
  proposal: ChangeProposal;
  plan: ChangePlan;
  status: ProposalStatus;
  result?: MutationResult;
};

export class StaleProposalError extends Error {
  constructor() {
    super("The record changed after this proposal was prepared.");
  }
}

export type UpdateDocument = (
  updater: (current: BackupDocument) => BackupDocument,
) => Promise<void>;

/**
 * In-memory registry of proposals awaiting the user's decision. Only the
 * app's review UI calls `execute`; the model can only ever reach `prepare`.
 * Proposals are single-use, expire, and vanish when the app restarts.
 */
export class ProposalStore {
  private readonly entries = new Map<string, Entry>();

  constructor(
    private readonly newId: () => string,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  prepare(document: BackupDocument, request: PrepareChangeArgs): PrepareChangeResult {
    const { result, plan } = prepareChange(document, request, {
      now: this.clock(),
      newId: this.newId,
    });
    if (result.ok && plan)
      this.entries.set(result.proposal.proposalId, {
        proposal: result.proposal,
        plan,
        status: "pending",
      });
    return result;
  }

  /**
   * In-card edits re-run the full validation with the merged fields and
   * replace the old proposal, which can no longer be confirmed.
   */
  revise(document: BackupDocument, proposalId: string, patch: ChangeFields): PrepareChangeResult {
    const entry = this.entries.get(proposalId);
    if (!entry || entry.status !== "pending")
      return { ok: false, code: "MUTATION_VALIDATION_FAILED", message: "This proposal is no longer open." };
    const request: PrepareChangeArgs = {
      ...entry.proposal.request,
      // Created records keep their id; edits target the same record.
      entityId: entry.proposal.operation === "create" ? entry.proposal.request.entityId : entry.proposal.entityId,
      userProvidedFields: { ...entry.proposal.request.userProvidedFields, ...patch },
    };
    const result = this.prepare(document, request);
    if (result.ok) {
      entry.status = "cancelled";
      entry.result = { status: "cancelled", proposalId, message: "superseded" };
    }
    return result;
  }

  get(proposalId: string) {
    return this.entries.get(proposalId)?.proposal ?? null;
  }

  status(proposalId: string): ProposalStatus | null {
    const entry = this.entries.get(proposalId);
    if (!entry) return null;
    if (entry.status === "pending" && this.expired(entry)) entry.status = "expired";
    return entry.status;
  }

  private expired(entry: Entry) {
    return this.clock().getTime() > Date.parse(entry.proposal.expiresAt);
  }

  cancel(proposalId: string): MutationResult {
    const entry = this.entries.get(proposalId);
    if (!entry) return { status: "unknown", proposalId };
    if (entry.status !== "pending") return entry.result ?? { status: "unknown", proposalId };
    entry.status = "cancelled";
    entry.result = {
      status: "cancelled",
      proposalId,
      operation: entry.proposal.operation,
      entityType: entry.proposal.entityType,
      entityName: entry.proposal.entityName,
    };
    return entry.result;
  }

  /**
   * Runs the confirmed proposal through the provider's serialized write. The
   * fingerprint is re-checked against the freshly read document inside the
   * same write, so a concurrent edit makes the proposal stale instead of
   * being overwritten. Repeated confirmation returns the first result.
   */
  async execute(proposalId: string, updateDocument: UpdateDocument): Promise<MutationResult> {
    const entry = this.entries.get(proposalId);
    // A proposal id the app never issued (e.g. invented by the model) does nothing.
    if (!entry) return { status: "unknown", proposalId, message: "Unknown proposal." };
    if (entry.status !== "pending")
      return entry.result ?? { status: "unknown", proposalId, message: `Proposal is ${entry.status}.` };
    const { proposal, plan } = entry;
    const base = {
      proposalId,
      operation: proposal.operation,
      entityType: proposal.entityType,
      entityId: proposal.entityId,
      entityName: proposal.entityName,
    };
    if (this.expired(entry)) {
      entry.status = "expired";
      entry.result = { ...base, status: "expired", message: "This proposal expired. Ask again to review a fresh one." };
      return entry.result;
    }
    entry.status = "executing";
    const saved: { document: BackupDocument | null } = { document: null };
    const now = this.clock();
    try {
      await updateDocument((current) => {
        if (current._local.selectedProfileId !== proposal.profileId) throw new StaleProposalError();
        if (plan.fingerprint(current) !== proposal.currentStateFingerprint) throw new StaleProposalError();
        saved.document = plan.apply(current, now.toISOString());
        return saved.document;
      });
    } catch (error) {
      const stale = error instanceof StaleProposalError;
      entry.status = stale ? "stale" : "failed";
      entry.result = {
        ...base,
        status: stale ? "stale" : "failed",
        message: error instanceof Error ? error.message : "The change could not be saved.",
      };
      return entry.result;
    }
    entry.status = "completed";
    entry.result = {
      ...base,
      status: "completed",
      final:
        proposal.operation === "delete" || !saved.document
          ? null
          : describeRecord(saved.document, proposal.entityType, plan.collection, plan.targetId, now),
    };
    return entry.result;
  }

  /** Drops everything, e.g. when the chat is closed. */
  clear() {
    this.entries.clear();
  }
}
