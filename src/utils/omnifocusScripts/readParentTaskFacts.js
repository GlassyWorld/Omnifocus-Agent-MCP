ObjC.import("Foundation");

const PAYLOAD_PLACEHOLDER = "__OMNIFOCUS_MCP_PARENT_FACTS_PAYLOAD__";
const MAX_BASE64_LENGTH = 16 * 1024;

const INNER_SOURCE_TEMPLATE = `(() => {
  const READ_FAILURES = new Set([
    "not_found",
    "query_failed",
    "schema_drift",
    "unknown_status",
    "malformed_id",
    "canonical_id_mismatch",
    "parent_chain_unreadable",
    "ancestor_state_unknown",
    "parent_chain_cycle",
    "orphan_parent",
  ]);

  function reject(reason) {
    const error = new Error(reason);
    error.parentFactsReason = reason;
    throw error;
  }

  function exactKeys(value, expected) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    return JSON.stringify(Object.keys(value).sort()) === JSON.stringify(expected.slice().sort());
  }

  function validatePayload(payload) {
    if (
      !exactKeys(payload, ["parentTaskId"])
      || typeof payload.parentTaskId !== "string"
      || payload.parentTaskId.length < 1
      || payload.parentTaskId.length > 512
    ) reject("schema_drift");
  }

  function canonicalId(value) {
    try {
      const id = value.id.primaryKey;
      return typeof id === "string" && id.length > 0 ? id : null;
    } catch (_error) {
      return null;
    }
  }

  function optionalDate(value) {
    if (value === null) return null;
    if (
      value
      && typeof value.getTime === "function"
      && Number.isFinite(value.getTime())
      && typeof value.toISOString === "function"
    ) return value.toISOString();
    reject("schema_drift");
  }

  function taskStatus(task) {
    if (task.taskStatus === Task.Status.Available) return "Available";
    if (task.taskStatus === Task.Status.Blocked) return "Blocked";
    if (task.taskStatus === Task.Status.Completed) return "Completed";
    if (task.taskStatus === Task.Status.Dropped) return "Dropped";
    if (task.taskStatus === Task.Status.DueSoon) return "DueSoon";
    if (task.taskStatus === Task.Status.Next) return "Next";
    if (task.taskStatus === Task.Status.Overdue) return "Overdue";
    reject("unknown_status");
  }

  function projectStatus(project) {
    if (project.status === Project.Status.Active) return "Active";
    if (project.status === Project.Status.OnHold) return "OnHold";
    if (project.status === Project.Status.Done) return "Done";
    if (project.status === Project.Status.Dropped) return "Dropped";
    reject("ancestor_state_unknown");
  }

  function folderStatus(folder) {
    if (folder.status === Folder.Status.Active) return "Active";
    if (folder.status === Folder.Status.Dropped) return "Dropped";
    reject("ancestor_state_unknown");
  }

  function childrenOf(task) {
    let children;
    try {
      children = task.children;
    } catch (_error) {
      reject("schema_drift");
    }
    if (
      !children
      || typeof children !== "object"
      || !Number.isInteger(children.length)
      || children.length < 0
      || typeof children.map !== "function"
    ) reject("schema_drift");
    return children;
  }

  function taskKind(task) {
    let project;
    try {
      project = task.project;
    } catch (_error) {
      reject("schema_drift");
    }
    if (project !== null) {
      if (!project || typeof project !== "object") reject("schema_drift");
      return "project_root";
    }
    return childrenOf(task).length > 0 ? "action_group" : "action";
  }

  function taskState(task) {
    if (typeof task.completed !== "boolean") reject("schema_drift");
    const completionDate = optionalDate(task.completionDate);
    const effectiveCompletionDate = optionalDate(task.effectiveCompletedDate);
    const dropDate = optionalDate(task.dropDate);
    const effectiveDropDate = optionalDate(task.effectiveDropDate);
    return {
      taskStatus: taskStatus(task),
      completion: {
        direct: task.completed || completionDate !== null,
        effectiveDate: effectiveCompletionDate,
      },
      drop: {
        direct: dropDate !== null,
        effectiveDate: effectiveDropDate,
      },
    };
  }

  function parentOf(task) {
    let parent;
    try {
      parent = task.parent;
    } catch (_error) {
      reject("parent_chain_unreadable");
    }
    if (parent !== null && (!parent || typeof parent !== "object")) {
      reject("parent_chain_unreadable");
    }
    return parent;
  }

  function readProjectAndFolders(task) {
    let directProject;
    let containingProject;
    try {
      directProject = task.project;
      containingProject = task.containingProject;
    } catch (_error) {
      reject("ancestor_state_unknown");
    }
    if (directProject !== null && (!directProject || typeof directProject !== "object")) {
      reject("ancestor_state_unknown");
    }
    if (containingProject !== null && (!containingProject || typeof containingProject !== "object")) {
      reject("ancestor_state_unknown");
    }
    const project = directProject || containingProject;
    if (!project) return { project: null, projectRootId: null, folderChain: [] };

    let rootTask;
    try {
      rootTask = project.task;
    } catch (_error) {
      reject("ancestor_state_unknown");
    }
    const projectRootId = canonicalId(rootTask);
    if (!projectRootId) reject("malformed_id");
    if (directProject && containingProject) {
      let containingRoot;
      try {
        containingRoot = containingProject.task;
      } catch (_error) {
        reject("ancestor_state_unknown");
      }
      if (canonicalId(containingRoot) !== projectRootId) reject("orphan_parent");
    }
    if (typeof project.name !== "string") reject("schema_drift");

    let folder;
    try {
      folder = project.parentFolder;
    } catch (_error) {
      reject("ancestor_state_unknown");
    }
    if (folder !== null && (!folder || typeof folder !== "object")) {
      reject("ancestor_state_unknown");
    }
    const folderChain = [];
    const seen = new Set();
    while (folder) {
      if (folderChain.length >= 128) reject("ancestor_state_unknown");
      const id = canonicalId(folder);
      if (!id) reject("malformed_id");
      if (seen.has(id)) reject("parent_chain_cycle");
      seen.add(id);
      if (typeof folder.name !== "string") reject("schema_drift");
      folderChain.push({ id, name: folder.name, status: folderStatus(folder) });
      let parent;
      try {
        parent = folder.parent;
      } catch (_error) {
        reject("ancestor_state_unknown");
      }
      if (parent !== null && (!parent || typeof parent !== "object")) {
        reject("ancestor_state_unknown");
      }
      folder = parent;
    }
    return {
      project: { id: projectRootId, name: project.name, status: projectStatus(project) },
      projectRootId,
      folderChain,
    };
  }

  function readFacts(requestedId) {
    let task;
    try {
      task = Task.byIdentifier(requestedId);
    } catch (_error) {
      reject("query_failed");
    }
    if (!task) reject("not_found");
    const id = canonicalId(task);
    if (!id) reject("malformed_id");
    if (id !== requestedId) reject("canonical_id_mismatch");
    if (typeof task.name !== "string") reject("schema_drift");

    const kind = taskKind(task);
    const state = taskState(task);
    const context = readProjectAndFolders(task);
    const parentChain = [];
    const seen = new Set([id]);
    let projectRootSeen = kind === "project_root" ? id : null;
    let parent = parentOf(task);
    while (parent) {
      if (parentChain.length >= 128) reject("parent_chain_unreadable");
      const ancestorId = canonicalId(parent);
      if (!ancestorId) reject("malformed_id");
      if (seen.has(ancestorId)) reject("parent_chain_cycle");
      seen.add(ancestorId);
      const ancestorKind = taskKind(parent);
      if (ancestorKind === "project_root") {
        if (projectRootSeen !== null && projectRootSeen !== ancestorId) reject("orphan_parent");
        projectRootSeen = ancestorId;
      }
      parentChain.push({ id: ancestorId, kind: ancestorKind, ...taskState(parent) });
      parent = parentOf(parent);
    }
    if (context.projectRootId !== null) {
      if (projectRootSeen !== context.projectRootId) reject("orphan_parent");
    } else if (projectRootSeen !== null) {
      reject("orphan_parent");
    }
    return {
      id,
      name: task.name,
      kind,
      ...state,
      project: context.project,
      folderChain: context.folderChain,
      parentChain,
    };
  }

  try {
    const payload = JSON.parse(Data.fromBase64("${PAYLOAD_PLACEHOLDER}").toString());
    validatePayload(payload);
    return JSON.stringify({ success: true, facts: readFacts(payload.parentTaskId) });
  } catch (error) {
    const reason = error && READ_FAILURES.has(error.parentFactsReason)
      ? error.parentFactsReason
      : "schema_drift";
    return JSON.stringify({ success: false, reason });
  }
})()`;

function readPayload(path) {
  const data = $.NSData.dataWithContentsOfFile(path);
  if (!data) throw new Error("payload_unavailable");
  const text = $.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding);
  return JSON.parse(ObjC.unwrap(text));
}

function encodePayload(payload) {
  const json = JSON.stringify(payload);
  const text = $.NSString.alloc.initWithUTF8String(json);
  const data = text.dataUsingEncoding($.NSUTF8StringEncoding);
  const encoded = ObjC.unwrap(data.base64EncodedStringWithOptions(0));
  if (
    typeof encoded !== "string"
    || encoded.length === 0
    || encoded.length > MAX_BASE64_LENGTH
    || !/^[A-Za-z0-9+/=]+$/.test(encoded)
  ) throw new Error("invalid_base64_payload");
  return encoded;
}

function buildInnerSource(encoded) {
  const parts = INNER_SOURCE_TEMPLATE.split(PAYLOAD_PLACEHOLDER);
  if (parts.length !== 2) throw new Error("invalid_payload_placeholder");
  return parts[0] + encoded + parts[1];
}

function run(argv) {
  try {
    if (!Array.isArray(argv) || argv.length !== 1) throw new Error("invalid_arguments");
    const payload = readPayload(argv[0]);
    const source = buildInnerSource(encodePayload(payload));
    return Application("OmniFocus").evaluateJavascript(source);
  } catch (_error) {
    return JSON.stringify({ success: false, reason: "query_failed" });
  }
}
