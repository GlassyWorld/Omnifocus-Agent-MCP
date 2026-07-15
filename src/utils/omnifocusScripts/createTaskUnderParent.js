ObjC.import("Foundation");

const PAYLOAD_PLACEHOLDER = "__OMNIFOCUS_MCP_PARENT_CREATE_PAYLOAD__";
const MAX_BASE64_LENGTH = 128 * 1024;

const INNER_SOURCE_TEMPLATE = `(() => {
  let writeStarted = false;
  let created = false;
  let taskId = null;
  let failureCategory = "parent_validation_failed";
  let failureReason = "schema_drift";

  function reject(category, reason) {
    failureCategory = category;
    failureReason = reason;
    throw new Error(category + "." + reason);
  }

  function exactKeys(value, expected) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    return JSON.stringify(Object.keys(value).sort()) === JSON.stringify(expected.slice().sort());
  }

  function validEpoch(value) {
    return value === null || (Number.isInteger(value) && Number.isFinite(value));
  }

  function validatePayload(payload) {
    if (!exactKeys(payload, [
      "destination",
      "name",
      "note",
      "plannedDateEpochMs",
      "dueDateEpochMs",
      "deferDateEpochMs",
      "flagged",
      "estimatedMinutes",
      "tagIds",
    ])) reject("parent_validation_failed", "schema_drift");
    if (
      typeof payload.name !== "string"
      || payload.name.length < 1
      || payload.name.length > 500
      || typeof payload.note !== "string"
      || payload.note.length > 20000
      || typeof payload.flagged !== "boolean"
      || !validEpoch(payload.plannedDateEpochMs)
      || !validEpoch(payload.dueDateEpochMs)
      || !validEpoch(payload.deferDateEpochMs)
      || (
        payload.estimatedMinutes !== null
        && (!Number.isInteger(payload.estimatedMinutes) || payload.estimatedMinutes < 1)
      )
    ) reject("parent_validation_failed", "schema_drift");
    if (
      !exactKeys(payload.destination, ["kind", "parentTaskId"])
      || payload.destination.kind !== "parentTask"
      || typeof payload.destination.parentTaskId !== "string"
      || payload.destination.parentTaskId.length < 1
      || payload.destination.parentTaskId.length > 512
    ) reject("parent_validation_failed", "schema_drift");
    if (
      !Array.isArray(payload.tagIds)
      || payload.tagIds.length > 5
      || payload.tagIds.some(id => typeof id !== "string" || id.length < 1)
    ) reject("tag_validation_failed", "schema_drift");
    if (new Set(payload.tagIds).size !== payload.tagIds.length) {
      reject("tag_validation_failed", "duplicate_requested_id");
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

  function optionalDatePresent(value, category, reason) {
    if (value === null) return false;
    if (value && typeof value.getTime === "function" && Number.isFinite(value.getTime())) {
      return true;
    }
    reject(category, reason);
  }

  function knownTaskStatus(task) {
    if (
      task.taskStatus === Task.Status.Available
      || task.taskStatus === Task.Status.Blocked
      || task.taskStatus === Task.Status.Completed
      || task.taskStatus === Task.Status.Dropped
      || task.taskStatus === Task.Status.DueSoon
      || task.taskStatus === Task.Status.Next
      || task.taskStatus === Task.Status.Overdue
    ) return task.taskStatus;
    reject("parent_validation_failed", "unknown_status");
  }

  function taskState(task) {
    if (typeof task.completed !== "boolean") {
      reject("parent_validation_failed", "schema_drift");
    }
    const completionDate = optionalDatePresent(
      task.completionDate,
      "parent_validation_failed",
      "schema_drift",
    );
    const effectiveCompletionDate = optionalDatePresent(
      task.effectiveCompletedDate,
      "parent_validation_failed",
      "schema_drift",
    );
    const dropDate = optionalDatePresent(
      task.dropDate,
      "parent_validation_failed",
      "schema_drift",
    );
    const effectiveDropDate = optionalDatePresent(
      task.effectiveDropDate,
      "parent_validation_failed",
      "schema_drift",
    );
    const status = knownTaskStatus(task);
    return {
      completed: task.completed || completionDate || effectiveCompletionDate
        || status === Task.Status.Completed,
      dropped: dropDate || effectiveDropDate || status === Task.Status.Dropped,
    };
  }

  function childrenOf(task) {
    let children;
    try {
      children = task.children;
    } catch (_error) {
      reject("parent_validation_failed", "schema_drift");
    }
    if (
      !children
      || typeof children !== "object"
      || !Number.isInteger(children.length)
      || children.length < 0
      || typeof children.map !== "function"
    ) reject("parent_validation_failed", "schema_drift");
    return children;
  }

  function taskKind(task) {
    let project;
    try {
      project = task.project;
    } catch (_error) {
      reject("parent_validation_failed", "schema_drift");
    }
    if (project !== null) {
      if (!project || typeof project !== "object") {
        reject("parent_validation_failed", "schema_drift");
      }
      return "project_root";
    }
    return childrenOf(task).length > 0 ? "action_group" : "action";
  }

  function parentOf(task) {
    let parent;
    try {
      parent = task.parent;
    } catch (_error) {
      reject("parent_validation_failed", "parent_chain_unreadable");
    }
    if (parent !== null && (!parent || typeof parent !== "object")) {
      reject("parent_validation_failed", "parent_chain_unreadable");
    }
    return parent;
  }

  function validateProjectContext(task, projectRootSeen) {
    let directProject;
    let containingProject;
    try {
      directProject = task.project;
      containingProject = task.containingProject;
    } catch (_error) {
      reject("parent_validation_failed", "ancestor_state_unknown");
    }
    if (directProject !== null && (!directProject || typeof directProject !== "object")) {
      reject("parent_validation_failed", "ancestor_state_unknown");
    }
    if (containingProject !== null && (!containingProject || typeof containingProject !== "object")) {
      reject("parent_validation_failed", "ancestor_state_unknown");
    }
    const project = directProject || containingProject;
    if (!project) {
      if (projectRootSeen !== null) reject("parent_validation_failed", "orphan_parent");
      return null;
    }

    let rootTask;
    try {
      rootTask = project.task;
    } catch (_error) {
      reject("parent_validation_failed", "ancestor_state_unknown");
    }
    const projectId = canonicalId(rootTask);
    if (!projectId) reject("parent_validation_failed", "malformed_id");
    if (projectRootSeen !== projectId) reject("parent_validation_failed", "orphan_parent");
    if (directProject && containingProject) {
      let containingRoot;
      try {
        containingRoot = containingProject.task;
      } catch (_error) {
        reject("parent_validation_failed", "ancestor_state_unknown");
      }
      if (canonicalId(containingRoot) !== projectId) {
        reject("parent_validation_failed", "orphan_parent");
      }
    }
    if (project.status !== Project.Status.Active) {
      if (
        project.status === Project.Status.OnHold
        || project.status === Project.Status.Done
        || project.status === Project.Status.Dropped
      ) reject("parent_not_active", "project_not_active");
      reject("parent_validation_failed", "ancestor_state_unknown");
    }

    let folder;
    try {
      folder = project.parentFolder;
    } catch (_error) {
      reject("parent_validation_failed", "ancestor_state_unknown");
    }
    if (folder !== null && (!folder || typeof folder !== "object")) {
      reject("parent_validation_failed", "ancestor_state_unknown");
    }
    const seenFolders = new Set();
    let depth = 0;
    while (folder) {
      if (depth >= 128) reject("parent_validation_failed", "ancestor_state_unknown");
      const folderId = canonicalId(folder);
      if (!folderId) reject("parent_validation_failed", "malformed_id");
      if (seenFolders.has(folderId)) reject("parent_validation_failed", "parent_chain_cycle");
      seenFolders.add(folderId);
      if (folder.status === Folder.Status.Dropped) {
        reject("parent_not_active", "dropped_folder_ancestor");
      }
      if (folder.status !== Folder.Status.Active) {
        reject("parent_validation_failed", "ancestor_state_unknown");
      }
      let next;
      try {
        next = folder.parent;
      } catch (_error) {
        reject("parent_validation_failed", "ancestor_state_unknown");
      }
      if (next !== null && (!next || typeof next !== "object")) {
        reject("parent_validation_failed", "ancestor_state_unknown");
      }
      folder = next;
      depth += 1;
    }
    return projectId;
  }

  function resolveParent(parentTaskId) {
    failureCategory = "parent_validation_failed";
    failureReason = "schema_drift";
    let parent;
    try {
      parent = Task.byIdentifier(parentTaskId);
    } catch (_error) {
      reject("parent_validation_failed", "query_failed");
    }
    if (!parent) reject("parent_not_found", "not_found");
    const resolvedId = canonicalId(parent);
    if (!resolvedId) reject("parent_validation_failed", "malformed_id");
    if (resolvedId !== parentTaskId) {
      reject("parent_validation_failed", "canonical_id_mismatch");
    }

    const kind = taskKind(parent);
    if (kind === "project_root") reject("parent_not_allowed", "project_root_not_allowed");
    if (kind !== "action_group") reject("parent_not_allowed", "unsupported_parent_kind");
    const selfState = taskState(parent);
    if (selfState.completed) reject("parent_not_active", "self_completed");
    if (selfState.dropped) reject("parent_not_active", "self_dropped");

    const seen = new Set([resolvedId]);
    let ancestor = parentOf(parent);
    let projectRootSeen = null;
    let depth = 0;
    while (ancestor) {
      if (depth >= 128) reject("parent_validation_failed", "parent_chain_unreadable");
      const ancestorId = canonicalId(ancestor);
      if (!ancestorId) reject("parent_validation_failed", "malformed_id");
      if (seen.has(ancestorId)) reject("parent_validation_failed", "parent_chain_cycle");
      seen.add(ancestorId);
      const ancestorKind = taskKind(ancestor);
      if (ancestorKind === "project_root") {
        if (projectRootSeen !== null && projectRootSeen !== ancestorId) {
          reject("parent_validation_failed", "orphan_parent");
        }
        projectRootSeen = ancestorId;
      }
      const ancestorState = taskState(ancestor);
      if (ancestorState.completed) reject("parent_not_active", "ancestor_completed");
      if (ancestorState.dropped) reject("parent_not_active", "ancestor_dropped");
      ancestor = parentOf(ancestor);
      depth += 1;
    }
    return {
      parent,
      parentTaskId: resolvedId,
      projectId: validateProjectContext(parent, projectRootSeen),
    };
  }

  function nativeTagStatus(tag) {
    if (tag.status === Tag.Status.Active) return "Active";
    if (tag.status === Tag.Status.OnHold) return "OnHold";
    if (tag.status === Tag.Status.Dropped) return "Dropped";
    return null;
  }

  function resolveTags(requestedIds) {
    const resolvedTags = [];
    const exclusiveGroups = new Set();
    for (const requestedId of requestedIds) {
      let resolved;
      try {
        resolved = Tag.byIdentifier(requestedId);
      } catch (_error) {
        reject("tag_validation_failed", "lookup_failed");
      }
      if (!resolved) reject("tag_not_found", "not_found");
      const resolvedId = canonicalId(resolved);
      if (!resolvedId) reject("tag_validation_failed", "malformed_id");
      if (resolvedId !== requestedId) {
        reject("tag_validation_failed", "canonical_id_mismatch");
      }

      const seen = new Set();
      let cursor = resolved;
      let depth = 0;
      let exclusiveGroupId = null;
      while (cursor) {
        const id = canonicalId(cursor);
        if (!id) reject("tag_validation_failed", "malformed_id");
        if (seen.has(id)) reject("tag_validation_failed", "parent_cycle");
        seen.add(id);
        const status = nativeTagStatus(cursor);
        if (!status) reject("tag_validation_failed", "unknown_status");
        if (status !== "Active") {
          const prefix = depth === 0 ? "self_" : "ancestor_";
          reject("tag_not_allowed", prefix + (status === "OnHold" ? "on_hold" : "dropped"));
        }
        let next;
        try {
          next = cursor.parent;
        } catch (_error) {
          reject("tag_validation_failed", "parent_unreadable");
        }
        if (next !== null && (!next || typeof next !== "object")) {
          reject("tag_validation_failed", "parent_unreadable");
        }
        if (depth === 0 && next) {
          const groupId = canonicalId(next);
          if (!groupId) reject("tag_validation_failed", "malformed_id");
          if (typeof next.childrenAreMutuallyExclusive !== "boolean") {
            reject("tag_validation_failed", "property_unreadable");
          }
          if (next.childrenAreMutuallyExclusive) exclusiveGroupId = groupId;
        }
        cursor = next;
        depth += 1;
      }
      if (exclusiveGroupId !== null) {
        if (exclusiveGroups.has(exclusiveGroupId)) {
          reject("mutually_exclusive_tags", "mutually_exclusive");
        }
        exclusiveGroups.add(exclusiveGroupId);
      }
      resolvedTags.push(resolved);
    }
    return resolvedTags;
  }

  try {
    const payload = JSON.parse(Data.fromBase64("${PAYLOAD_PLACEHOLDER}").toString());
    validatePayload(payload);
    const resolvedParent = resolveParent(payload.destination.parentTaskId);
    const tags = resolveTags(payload.tagIds);

    writeStarted = true;
    const parent = resolvedParent.parent;
    const task = new Task(payload.name, parent);
    created = true;
    taskId = canonicalId(task);
    if (!taskId) throw new Error("missing_task_id");

    task.note = payload.note;
    task.flagged = payload.flagged;
    if (payload.estimatedMinutes !== null) task.estimatedMinutes = payload.estimatedMinutes;
    if (payload.plannedDateEpochMs !== null) task.plannedDate = new Date(payload.plannedDateEpochMs);
    if (payload.dueDateEpochMs !== null) task.dueDate = new Date(payload.dueDateEpochMs);
    if (payload.deferDateEpochMs !== null) task.deferDate = new Date(payload.deferDateEpochMs);
    if (tags.length > 0) task.addTags(tags);

    const actualTagIds = task.tags.map(tag => canonicalId(tag));
    if (actualTagIds.some(id => id === null)) throw new Error("malformed_actual_tag_id");
    return JSON.stringify({
      success: true,
      taskId,
      destination: {
        kind: "parentTask",
        parentTaskId: resolvedParent.parentTaskId,
        projectId: resolvedParent.projectId,
      },
      tagIds: actualTagIds,
    });
  } catch (_error) {
    const phase = created ? "postcreate" : (writeStarted ? "unknown" : "prewrite");
    return JSON.stringify({
      success: false,
      phase,
      taskId,
      errorCategory: phase === "postcreate"
        ? "postcreate_failure"
        : (phase === "unknown" ? "unknown" : failureCategory),
      reason: phase === "prewrite" ? failureReason : null,
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
  const text = $.NSString.alloc.initWithUTF8String(JSON.stringify(payload));
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
  let evaluationStarted = false;
  try {
    if (!Array.isArray(argv) || argv.length !== 1) throw new Error("invalid_arguments");
    const payload = readPayload(argv[0]);
    const source = buildInnerSource(encodePayload(payload));
    const app = Application("OmniFocus");
    evaluationStarted = true;
    return app.evaluateJavascript(source);
  } catch (_error) {
    return JSON.stringify({
      success: false,
      phase: evaluationStarted ? "unknown" : "prewrite",
      taskId: null,
      errorCategory: evaluationStarted ? "unknown" : "parent_validation_failed",
      reason: evaluationStarted ? null : "schema_drift",
    });
  }
}
