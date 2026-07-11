import type { ProjectDateSemantics, ProjectTaskStatusCounts } from '../project/projectTypes.js';
import type { DateSemantics, StatusSource } from '../task/taskTypes.js';

export type ActiveTaskStatus =
  | "Available"
  | "Blocked"
  | "DueSoon"
  | "Next"
  | "Overdue";

export type RawLeanTask = {
  id: string;
  name: string;
  hasNote: boolean;
  taskStatus: ActiveTaskStatus;
  flagged: boolean;
  effectiveFlagged: boolean;
  dueDate: string | null;
  effectiveDueDate: string | null;
  deferDate: string | null;
  effectiveDeferDate: string | null;
  plannedDate: string | null;
  effectivePlannedDate: string | null;
  tagNames: string[];
  projectName: string | null;
  projectId: string | null;
  inInbox: boolean;
  isProjectRoot: boolean;
  hasChildren: boolean;
  creationDate: string | null;
};

export type RawLeanProject = {
  id: string;
  name: string;
  hasNote: boolean;
  status: "Active" | "OnHold" | "Done" | "Dropped";
  sequential: boolean;
  flagged: boolean;
  containsSingletonActions: boolean;
  folderId: string | null;
  folderName: string | null;
  totalTaskCount: number;
  taskStatusCounts: ProjectTaskStatusCounts;
  dueDate: string | null;
  effectiveDueDate: string | null;
  deferDate: string | null;
  effectiveDeferDate: string | null;
};

export type LeanTaskSummary = {
  id: string;
  name: string;
  hasNote: boolean;
  kind: "action" | "action_group";
  project: {
    id: string;
    name: string;
  } | null;
  location: {
    inInbox: boolean;
  };
  status: {
    taskStatus: ActiveTaskStatus;
  };
  dates: {
    due: DateSemantics;
    planned: DateSemantics;
    defer: DateSemantics;
  };
  flagged: {
    direct: boolean;
    effective: boolean;
    source: StatusSource;
  };
  tags: string[];
};

export type LeanProjectSummary = {
  id: string;
  name: string;
  hasNote: boolean;
  kind: "standard" | "single_actions";
  status: "Active";
  folder: {
    id: string;
    name: string;
  } | null;
  sequential: boolean;
  flagged: boolean;
  dates: {
    due: ProjectDateSemantics;
    planned: DateSemantics;
    defer: ProjectDateSemantics;
  };
  tasks: {
    total: number;
    byStatus: ProjectTaskStatusCounts;
  };
};

export type ProjectDeadlineState = "overdue" | "dueSoon";

export type LeanProjectDeadlineItem = {
  project: LeanProjectSummary;
  state: ProjectDeadlineState;
};

export type ProjectRootSemantics = {
  planned: DateSemantics;
  due: DateSemantics;
  taskStatus: ActiveTaskStatus;
};

export type SnapshotList<T> = {
  total: number;
  returned: number;
  truncated: boolean;
  items: T[];
};

export type AttentionReason = "overdue" | "dueSoon" | "planned" | "flagged";

export type LeanAttentionItem = {
  task: LeanTaskSummary;
  reasons: AttentionReason[];
};

export type LeanSnapshotView = {
  generatedAt: string;
  scope: "all";
  projects: {
    active: SnapshotList<LeanProjectSummary>;
    planned: SnapshotList<LeanProjectSummary>;
    deadline: SnapshotList<LeanProjectDeadlineItem>;
  };
  attention: {
    total: number;
    returned: number;
    truncated: boolean;
    byReason: Record<AttentionReason, number>;
    items: LeanAttentionItem[];
  };
  inbox: SnapshotList<LeanTaskSummary>;
};
