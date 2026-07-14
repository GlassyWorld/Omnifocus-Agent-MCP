ObjC.import("Foundation");

const PAYLOAD_PLACEHOLDER = "__OMNIFOCUS_MCP_BASE64_PAYLOAD__";
const MAX_BASE64_LENGTH = 64 * 1024;

const INNER_SOURCE_TEMPLATE = `(() => {
  let writeStarted = false;
  let created = false;
  let taskId = null;
  let failureCategory = "tag_validation_failed";
  let failureReason = "schema_drift";

  function reject(category, reason) {
    failureCategory = category;
    failureReason = reason;
    throw new Error(category + ":" + reason);
  }

  function exactKeys(value, expected) {
    const keys = Object.keys(value).sort();
    const wanted = expected.slice().sort();
    return JSON.stringify(keys) === JSON.stringify(wanted);
  }

  function isFiniteNumberOrNull(value) {
    return value === null || (typeof value === "number" && Number.isFinite(value));
  }

  function validatePayload(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      reject("tag_validation_failed", "schema_drift");
    }
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
    ])) reject("tag_validation_failed", "schema_drift");
    if (typeof payload.name !== "string" || payload.name.length === 0) {
      reject("tag_validation_failed", "schema_drift");
    }
    if (typeof payload.note !== "string" || typeof payload.flagged !== "boolean") {
      reject("tag_validation_failed", "schema_drift");
    }
    if (
      !isFiniteNumberOrNull(payload.plannedDateEpochMs)
      || !isFiniteNumberOrNull(payload.dueDateEpochMs)
      || !isFiniteNumberOrNull(payload.deferDateEpochMs)
    ) reject("tag_validation_failed", "schema_drift");
    if (
      payload.estimatedMinutes !== null
      && (!Number.isInteger(payload.estimatedMinutes) || payload.estimatedMinutes <= 0)
    ) reject("tag_validation_failed", "schema_drift");
    if (
      !Array.isArray(payload.tagIds)
      || payload.tagIds.length < 1
      || payload.tagIds.length > 5
      || payload.tagIds.some(id => typeof id !== "string" || id.length === 0)
    ) reject("tag_validation_failed", "schema_drift");
    if (new Set(payload.tagIds).size !== payload.tagIds.length) {
      reject("tag_validation_failed", "duplicate_requested_id");
    }
    if (!payload.destination || typeof payload.destination !== "object") {
      reject("tag_validation_failed", "schema_drift");
    }
    if (payload.destination.kind === "inbox") {
      if (!exactKeys(payload.destination, ["kind"])) {
        reject("tag_validation_failed", "schema_drift");
      }
    } else if (payload.destination.kind === "project") {
      if (
        !exactKeys(payload.destination, ["kind", "projectId"])
        || typeof payload.destination.projectId !== "string"
        || payload.destination.projectId.length === 0
      ) reject("project_validation_failed", "schema_drift");
    } else {
      reject("tag_validation_failed", "schema_drift");
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

        let parent;
        try {
          parent = cursor.parent;
        } catch (_error) {
          reject("tag_validation_failed", "parent_unreadable");
        }
        if (parent !== null && typeof parent !== "object") {
          reject("tag_validation_failed", "parent_unreadable");
        }
        if (depth === 0 && parent) {
          const parentId = canonicalId(parent);
          if (!parentId) reject("tag_validation_failed", "malformed_id");
          if (typeof parent.childrenAreMutuallyExclusive !== "boolean") {
            reject("tag_validation_failed", "property_unreadable");
          }
          if (parent.childrenAreMutuallyExclusive) exclusiveGroupId = parentId;
        }
        cursor = parent;
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

  function resolveProject(projectId) {
    failureCategory = "project_validation_failed";
    failureReason = "schema_drift";

    let rootTask;
    try {
      rootTask = Task.byIdentifier(projectId);
    } catch (_error) {
      reject("project_validation_failed", "schema_drift");
    }
    if (!rootTask) reject("project_not_found", "not_found");
    if (canonicalId(rootTask) !== projectId) {
      reject("project_validation_failed", "canonical_id_mismatch");
    }

    const project = rootTask.project;
    if (!project || !project.task || canonicalId(project.task) !== projectId) {
      reject("project_validation_failed", "canonical_id_mismatch");
    }
    if (project.status !== Project.Status.Active) {
      if (project.status === Project.Status.OnHold) reject("project_not_active", "on_hold");
      if (project.status === Project.Status.Done) reject("project_not_active", "done");
      if (project.status === Project.Status.Dropped) reject("project_not_active", "dropped");
      reject("project_validation_failed", "ancestor_state_unknown");
    }

    let folder;
    try {
      folder = project.parentFolder;
    } catch (_error) {
      reject("project_validation_failed", "schema_drift");
    }
    const seenFolderIds = new Set();
    while (folder) {
      const folderId = canonicalId(folder);
      if (!folderId || seenFolderIds.has(folderId)) {
        reject("project_validation_failed", "schema_drift");
      }
      seenFolderIds.add(folderId);
      if (folder.status === Folder.Status.Dropped) {
        reject("project_not_active", "dropped_ancestor");
      }
      if (folder.status !== Folder.Status.Active) {
        reject("project_validation_failed", "ancestor_state_unknown");
      }
      let parent;
      try {
        parent = folder.parent;
      } catch (_error) {
        reject("project_validation_failed", "schema_drift");
      }
      if (parent !== null && typeof parent !== "object") {
        reject("project_validation_failed", "schema_drift");
      }
      folder = parent;
    }
    return project;
  }

  try {
    const payload = JSON.parse(Data.fromBase64("${PAYLOAD_PLACEHOLDER}").toString());
    validatePayload(payload);
    const tags = resolveTags(payload.tagIds);
    const project = payload.destination.kind === "project"
      ? resolveProject(payload.destination.projectId)
      : null;

    writeStarted = true;
    const task = project ? new Task(payload.name, project) : new Task(payload.name);
    created = true;
    taskId = canonicalId(task);
    if (!taskId) throw new Error("missing_task_id");

    task.note = payload.note;
    task.flagged = payload.flagged;
    if (payload.estimatedMinutes !== null) task.estimatedMinutes = payload.estimatedMinutes;
    if (payload.plannedDateEpochMs !== null) task.plannedDate = new Date(payload.plannedDateEpochMs);
    if (payload.dueDateEpochMs !== null) task.dueDate = new Date(payload.dueDateEpochMs);
    if (payload.deferDateEpochMs !== null) task.deferDate = new Date(payload.deferDateEpochMs);
    task.addTags(tags);

    const actualTagIds = task.tags.map(tag => canonicalId(tag));
    if (actualTagIds.some(id => id === null)) throw new Error("malformed_actual_tag_id");

    return JSON.stringify({
      success: true,
      taskId,
      destination: project
        ? { kind: "project", projectId: canonicalId(project.task) }
        : { kind: "inbox" },
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
      errorCategory: evaluationStarted ? "unknown" : "tag_validation_failed",
      reason: evaluationStarted ? null : "schema_drift",
    });
  }
}
