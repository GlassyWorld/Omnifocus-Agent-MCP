ObjC.import("Foundation");

function readPayload(path) {
  const data = $.NSData.dataWithContentsOfFile(path);
  if (!data) throw new Error("payload_unavailable");
  const text = $.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding);
  return JSON.parse(ObjC.unwrap(text));
}

function optionalDate(epochMilliseconds) {
  return epochMilliseconds === null ? null : new Date(epochMilliseconds);
}

function normalizedStatus(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[\s_-]/g, "")
    .replace(/status$/, "");
}

function statusReason(value) {
  const normalized = normalizedStatus(value);
  if (normalized === "active") return null;
  if (normalized === "onhold") return "on_hold";
  if (normalized === "done") return "done";
  if (normalized === "dropped") return "dropped";
  return "ancestor_state_unknown";
}

function hasDroppedFolder(project) {
  let folder = project.properties().folder;
  while (folder) {
    const properties = folder.properties();
    if (normalizedStatus(properties.pcls) !== "folder") {
      throw new Error("ancestor_state_unknown");
    }
    if (typeof properties.hidden !== "boolean") {
      throw new Error("ancestor_state_unknown");
    }
    if (properties.hidden) return true;
    const container = properties.container;
    if (!container) return false;
    const containerProperties = container.properties();
    if (normalizedStatus(containerProperties.pcls) !== "folder") return false;
    folder = container;
  }
  return false;
}

function run(argv) {
  let created = false;
  let writeStarted = false;
  let taskId = null;
  let failureCategory = "project_validation_failed";
  let failureReason = "ancestor_state_unknown";
  try {
    if (!Array.isArray(argv) || argv.length !== 1) throw new Error("invalid_arguments");
    const payload = readPayload(argv[0]);
    const app = Application("OmniFocus");
    const document = app.defaultDocument();
    if (!document) throw new Error("document_unavailable");

    const matches = document.flattenedProjects().filter(project =>
      String(project.id()) === payload.projectId
    );
    if (matches.length === 0) {
      failureCategory = "project_not_found";
      failureReason = "not_found";
      throw new Error("project_not_found");
    }
    if (matches.length !== 1) {
      failureReason = "ambiguous_canonical_id";
      throw new Error("ambiguous_canonical_id");
    }

    const project = matches[0];
    if (String(project.id()) !== payload.projectId) {
      failureReason = "canonical_id_mismatch";
      throw new Error("canonical_id_mismatch");
    }
    const projectStatusReason = statusReason(project.status());
    if (projectStatusReason !== null) {
      if (projectStatusReason === "ancestor_state_unknown") {
        failureReason = projectStatusReason;
      } else {
        failureCategory = "project_not_active";
        failureReason = projectStatusReason;
      }
      throw new Error("project_not_allowed");
    }
    if (hasDroppedFolder(project)) {
      failureCategory = "project_not_active";
      failureReason = "dropped_ancestor";
      throw new Error("dropped_ancestor");
    }

    const properties = {
      name: payload.name,
      note: payload.note,
      flagged: payload.flagged,
    };
    if (payload.estimatedMinutes !== null) properties.estimatedMinutes = payload.estimatedMinutes;
    if (payload.plannedDateEpochMs !== null) properties.plannedDate = optionalDate(payload.plannedDateEpochMs);
    if (payload.dueDateEpochMs !== null) properties.dueDate = optionalDate(payload.dueDateEpochMs);
    if (payload.deferDateEpochMs !== null) properties.deferDate = optionalDate(payload.deferDateEpochMs);

    writeStarted = true;
    const task = app.Task(properties);
    project.tasks.push(task);
    created = true;
    taskId = String(task.id());

    return JSON.stringify({
      success: true,
      taskId: taskId,
      projectId: String(project.id()),
    });
  } catch (_error) {
    const phase = created ? "postcreate" : (writeStarted ? "unknown" : "prewrite");
    return JSON.stringify({
      success: false,
      phase: phase,
      taskId: taskId,
      errorCategory: phase === "postcreate"
        ? "postcreate_failure"
        : (phase === "unknown" ? "unknown" : failureCategory),
      reason: phase === "prewrite" ? failureReason : null,
    });
  }
}
