export type QueryCompletedTaskItem = Record<string, unknown>;

export type RawCompletedTask = {
  id: string;
  name: string;
  note: string;
  completionDate: string;
  projectId: string | null;
  projectName: string | null;
  inInbox: boolean;
  tagNames: string[];
  isProjectRoot: boolean;
  hasChildren: boolean;
  creationDate: string | null;
  modificationDate: string | null;
};

export type CompletedTaskKind = "action" | "action_group";

export type CompletedTaskView = {
  id: string;
  name: string;
  note: string;
  kind: CompletedTaskKind;
  completedDate: string;
  project: {
    id: string;
    name: string;
  } | null;
  location: {
    inInbox: boolean;
  };
  tags: string[];
  timestamps: {
    created: string | null;
    modified: string | null;
  };
};
