ObjC.import("Foundation");

const PAYLOAD_PLACEHOLDER = "__OMNIFOCUS_MCP_PARENT_FACTS_PAYLOAD__";
const MAX_BASE64_LENGTH = 32 * 1024;

const INNER_SOURCE_TEMPLATE = `(() => {
  const CASES = new Set([
    "inbox_action",
    "project_action",
    "action_group",
    "project_root",
    "completed",
    "dropped",
    "folder_project",
    "stale_not_found",
  ]);
  const READ_FAILURES = new Set([
    "not_found",
    "schema_drift",
    "unknown_status",
    "malformed_id",
    "canonical_id_mismatch",
    "parent_chain_unreadable",
    "ancestor_state_unknown",
    "parent_chain_cycle",
    "orphan_parent",
    "capability_unavailable",
  ]);

  function reject(reason) {
    const error = new Error(reason);
    error.probeReason = reason;
    throw error;
  }

  function exactKeys(value, expected) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const keys = Object.keys(value).sort();
    const wanted = expected.slice().sort();
    return JSON.stringify(keys) === JSON.stringify(wanted);
  }

  function validatePayload(payload) {
    if (!exactKeys(payload, ["cases"]) || !Array.isArray(payload.cases)) {
      reject("input_schema_drift");
    }
    if (payload.cases.length < 1 || payload.cases.length > 8) {
      reject("input_schema_drift");
    }
    const labels = new Set();
    for (const entry of payload.cases) {
      if (
        !exactKeys(entry, ["case", "taskId"])
        || !CASES.has(entry.case)
        || typeof entry.taskId !== "string"
        || entry.taskId.length < 1
        || entry.taskId.length > 512
        || labels.has(entry.case)
      ) reject("input_schema_drift");
      labels.add(entry.case);
    }
  }

  function canonicalId(value) {
    try {
      const id = value.id.primaryKey;
      return typeof id === "string" && id.length > 0 ? id : null;
    } catch (_error) {
      return null;
    }
  }

  function optionalDatePresent(value) {
    if (value === null) return false;
    if (
      value
      && typeof value.getTime === "function"
      && Number.isFinite(value.getTime())
    ) return true;
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

  function taskChildren(task) {
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
    return taskChildren(task).length > 0 ? "action_group" : "action";
  }

  function readTaskState(task) {
    if (typeof task.name !== "string" || typeof task.completed !== "boolean") {
      reject("schema_drift");
    }
    const completionDate = optionalDatePresent(task.completionDate);
    const effectiveCompletedDate = optionalDatePresent(task.effectiveCompletedDate);
    const dropDate = optionalDatePresent(task.dropDate);
    const effectiveDropDate = optionalDatePresent(task.effectiveDropDate);
    return {
      taskStatus: taskStatus(task),
      directCompleted: task.completed || completionDate,
      effectiveCompleted: effectiveCompletedDate,
      directDropped: dropDate,
      effectiveDropped: effectiveDropDate,
    };
  }

  function readParent(task) {
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

  function readProjectFacts(task) {
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
    if (
      containingProject !== null
      && (!containingProject || typeof containingProject !== "object")
    ) reject("ancestor_state_unknown");

    const project = directProject || containingProject;
    if (!project) {
      return {
        project: null,
        projectRootId: null,
        projectStatus: null,
        folderDepth: 0,
        activeFolderCount: 0,
        droppedFolderCount: 0,
      };
    }

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

    let folder;
    try {
      folder = project.parentFolder;
    } catch (_error) {
      reject("ancestor_state_unknown");
    }
    if (folder !== null && (!folder || typeof folder !== "object")) {
      reject("ancestor_state_unknown");
    }

    const seenFolders = new Set();
    let folderDepth = 0;
    let activeFolderCount = 0;
    let droppedFolderCount = 0;
    while (folder) {
      if (folderDepth >= 128) reject("ancestor_state_unknown");
      const folderId = canonicalId(folder);
      if (!folderId) reject("malformed_id");
      if (seenFolders.has(folderId)) reject("parent_chain_cycle");
      seenFolders.add(folderId);

      const status = folderStatus(folder);
      if (status === "Active") activeFolderCount += 1;
      else droppedFolderCount += 1;

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
      folderDepth += 1;
    }

    return {
      project,
      projectRootId,
      projectStatus: projectStatus(project),
      folderDepth,
      activeFolderCount,
      droppedFolderCount,
    };
  }

  function readParentTaskFactsById(requestedId) {
    let task;
    try {
      task = Task.byIdentifier(requestedId);
    } catch (_error) {
      reject("capability_unavailable");
    }
    if (!task) reject("not_found");

    const resolvedId = canonicalId(task);
    if (!resolvedId) reject("malformed_id");
    if (resolvedId !== requestedId) reject("canonical_id_mismatch");

    const kind = taskKind(task);
    const state = readTaskState(task);
    const children = taskChildren(task);
    if (typeof task.inInbox !== "boolean") reject("schema_drift");
    const projectFacts = readProjectFacts(task);

    const seen = new Set([resolvedId]);
    let parent = readParent(task);
    const parentIdPresent = parent !== null;
    let parentDepth = 0;
    let projectRootSeen = kind === "project_root" ? resolvedId : null;
    let ancestorCompleted = false;
    let ancestorDropped = false;
    while (parent) {
      if (parentDepth >= 128) reject("parent_chain_unreadable");
      const parentId = canonicalId(parent);
      if (!parentId) reject("malformed_id");
      if (seen.has(parentId)) reject("parent_chain_cycle");
      seen.add(parentId);

      const parentKind = taskKind(parent);
      const parentState = readTaskState(parent);
      if (parentState.directCompleted || parentState.effectiveCompleted) {
        ancestorCompleted = true;
      }
      if (parentState.directDropped || parentState.effectiveDropped) {
        ancestorDropped = true;
      }
      if (parentKind === "project_root") {
        if (projectRootSeen !== null && projectRootSeen !== parentId) reject("orphan_parent");
        projectRootSeen = parentId;
      }

      parent = readParent(parent);
      parentDepth += 1;
    }

    if (projectFacts.projectRootId !== null) {
      if (projectRootSeen !== projectFacts.projectRootId) reject("orphan_parent");
    } else if (projectRootSeen !== null) {
      reject("orphan_parent");
    }

    return {
      idRoundtripMatched: true,
      kind,
      taskStatus: state.taskStatus,
      inInbox: task.inInbox,
      parentIdPresent,
      childCount: children.length,
      directCompleted: state.directCompleted,
      effectiveCompleted: state.effectiveCompleted,
      directDropped: state.directDropped,
      effectiveDropped: state.effectiveDropped,
      parentDepth,
      parentChainTerminus: projectFacts.project ? "project_root" : "inbox",
      ancestorCompleted,
      ancestorDropped,
      projectPresent: projectFacts.project !== null,
      projectStatus: projectFacts.projectStatus,
      projectChainConsistent: true,
      folderDepth: projectFacts.folderDepth,
      activeFolderCount: projectFacts.activeFolderCount,
      droppedFolderCount: projectFacts.droppedFolderCount,
    };
  }

  function summarize(evidence) {
    const facts = evidence.filter(entry => entry.outcome === "facts");
    return {
      requested: evidence.length,
      factsRead: facts.length,
      readFailures: evidence.length - facts.length,
      projectRoots: facts.filter(entry => entry.kind === "project_root").length,
      actionGroups: facts.filter(entry => entry.kind === "action_group").length,
      completedOrEffective: facts.filter(
        entry => entry.directCompleted || entry.effectiveCompleted,
      ).length,
      droppedOrEffective: facts.filter(
        entry => entry.directDropped || entry.effectiveDropped,
      ).length,
      projectBacked: facts.filter(entry => entry.projectPresent).length,
      folderBacked: facts.filter(entry => entry.folderDepth > 0).length,
    };
  }

  try {
    const payload = JSON.parse(Data.fromBase64("${PAYLOAD_PLACEHOLDER}").toString());
    validatePayload(payload);
    let evidence = [];
    for (const requested of payload.cases) {
      try {
        evidence = evidence.concat([{
          case: requested.case,
          outcome: "facts",
          ...readParentTaskFactsById(requested.taskId),
        }]);
      } catch (error) {
        const reason = error && READ_FAILURES.has(error.probeReason)
          ? error.probeReason
          : "capability_unavailable";
        evidence = evidence.concat([{
          case: requested.case,
          outcome: "read_failure",
          reason,
        }]);
      }
    }
    return JSON.stringify({ success: true, cases: evidence, summary: summarize(evidence) });
  } catch (error) {
    return JSON.stringify({
      success: false,
      reason: error && error.probeReason === "input_schema_drift"
        ? "input_schema_drift"
        : "process_failure",
    });
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
    if (!Array.isArray(argv) || argv.length !== 1) {
      return JSON.stringify({ success: false, reason: "input_schema_drift" });
    }
    const payload = readPayload(argv[0]);
    const source = buildInnerSource(encodePayload(payload));
    return Application("OmniFocus").evaluateJavascript(source);
  } catch (_error) {
    return JSON.stringify({ success: false, reason: "process_failure" });
  }
}
