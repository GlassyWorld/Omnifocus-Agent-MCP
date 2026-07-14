export type CreateTaskErrorCode =
  | "invalid_arguments"
  | "write_disabled"
  | "safety_guard_failed"
  | "test_environment_mismatch"
  | "duplicate_request"
  | "idempotency_conflict"
  | "write_failed"
  | "project_not_found"
  | "project_not_active"
  | "project_validation_failed"
  | "verification_failed"
  | "partial_success"
  | "replay_target_unavailable"
  | "internal_error";

export interface CreateTaskErrorDetail {
  code: CreateTaskErrorCode;
  message: string;
  mayHaveWritten: boolean;
  retrySafe: boolean;
  taskId?: string;
  idempotencyKey?: string;
  reason?: string;
  verificationDiff?: Record<string, unknown>;
}

export interface CreateTaskErrorResponse {
  success: false;
  error: CreateTaskErrorDetail;
}

export class CreateTaskOperationError extends Error {
  constructor(readonly detail: CreateTaskErrorDetail) {
    super(detail.message);
    this.name = "CreateTaskOperationError";
  }
}
