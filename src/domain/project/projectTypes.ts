export type ProjectKind = "standard" | "single_actions";

export type ProjectDateSemantics = {
  direct: string | null;
  effective: string | null;
  source: "direct" | "inherited" | "none";
};

export type ProjectTaskStatusCounts = {
  available: number;
  next: number;
  blocked: number;
  dueSoon: number;
  overdue: number;
  completed: number;
  dropped: number;
};

export type ProjectStatusSemantics = {
  raw: string;
  active: boolean;
  onHold: boolean;
  completed: boolean;
  dropped: boolean;
};

export type QueryProjectItem = Record<string, unknown>;

export type RawProject = {
  id: string;
  name: string;
  note: string;
  status: string;
  sequential: boolean;
  flagged: boolean;
  containsSingletonActions: boolean;
  completedByChildren: boolean;
  folderId: string | null;
  folderName: string | null;
  directTaskIds: string[];
  taskIds: string[];
  taskStatusCounts: ProjectTaskStatusCounts;
  dueDate: string | null;
  effectiveDueDate: string | null;
  deferDate: string | null;
  effectiveDeferDate: string | null;
  creationDate: string | null;
  modificationDate: string | null;
};

export type ProjectView = {
  id: string;
  name: string;
  note: string;
  kind: ProjectKind;
  status: ProjectStatusSemantics;
  sequential: boolean;
  flagged: boolean;
  completedByChildren: boolean;
  folder: {
    id: string;
    name: string;
  } | null;
  dates: {
    due: ProjectDateSemantics;
    defer: ProjectDateSemantics;
  };
  tasks: {
    directIds: string[];
    allIds: string[];
    total: number;
    byStatus: ProjectTaskStatusCounts;
  };
  timestamps: {
    created: string | null;
    modified: string | null;
  };
};
