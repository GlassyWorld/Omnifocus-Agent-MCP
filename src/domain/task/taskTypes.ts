export type StatusSource = "direct" | "inherited" | "none";

export type DateSemantics = {
  direct: string | null;
  effective: string | null;
  source: StatusSource;
};

export type TaskKind = "action" | "action_group" | "project_root";

export type QueryTaskItem = Record<string, unknown>;

export type RawTask = {
  id: string;
  name: string;
  note: string;
  taskStatus: string;
  flagged: boolean;
  effectiveFlagged: boolean;
  completed: boolean;
  completionDate: string | null;
  effectiveCompletedDate: string | null;
  dropDate: string | null;
  effectiveDropDate: string | null;
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
  parentId: string | null;
  childIds: string[];
  hasChildren: boolean;
  sequential: boolean;
  completedByChildren: boolean;
  isRepeating: boolean;
  repetitionRule: string | null;
  estimatedMinutes: number | null;
  creationDate: string | null;
  modificationDate: string | null;
};

export type TaskView = {
  id: string;
  name: string;
  note: string;
  kind: TaskKind;
  status: {
    taskStatus: string;
    completion: {
      direct: boolean;
      directDate: string | null;
      effectiveDate: string | null;
      source: StatusSource;
    };
    drop: {
      direct: boolean;
      directDate: string | null;
      effectiveDate: string | null;
      source: StatusSource;
    };
    flagged: {
      direct: boolean;
      effective: boolean;
      source: StatusSource;
    };
  };
  dates: {
    due: DateSemantics;
    planned: DateSemantics;
    defer: DateSemantics;
  };
  project: {
    id: string;
    name: string;
  } | null;
  location: {
    inInbox: boolean;
  };
  hierarchy: {
    parentId: string | null;
    childIds: string[];
    hasChildren: boolean;
    sequential: boolean;
    completedByChildren: boolean;
  };
  tags: string[];
  repeat: {
    isRepeating: boolean;
    rule: string | null;
  };
  estimate: {
    minutes: number | null;
  };
  timestamps: {
    created: string | null;
    modified: string | null;
  };
};
