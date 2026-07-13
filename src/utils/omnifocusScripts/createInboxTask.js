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

function run(argv) {
  let created = false;
  let taskId = null;
  try {
    if (!Array.isArray(argv) || argv.length !== 1) throw new Error("invalid_arguments");
    const payload = readPayload(argv[0]);
    const app = Application("OmniFocus");
    const document = app.defaultDocument();
    if (!document) throw new Error("document_unavailable");

    const properties = {
      name: payload.name,
      note: payload.note,
      flagged: payload.flagged,
    };
    if (payload.estimatedMinutes !== null) properties.estimatedMinutes = payload.estimatedMinutes;
    if (payload.plannedDateEpochMs !== null) properties.plannedDate = optionalDate(payload.plannedDateEpochMs);
    if (payload.dueDateEpochMs !== null) properties.dueDate = optionalDate(payload.dueDateEpochMs);
    if (payload.deferDateEpochMs !== null) properties.deferDate = optionalDate(payload.deferDateEpochMs);

    const task = app.InboxTask(properties);
    document.inboxTasks.push(task);
    created = true;
    taskId = String(task.id());

    return JSON.stringify({ success: true, taskId: taskId });
  } catch (_error) {
    return JSON.stringify({
      success: false,
      phase: created ? "postcreate" : "prewrite",
      taskId: taskId,
      errorCategory: created ? "postcreate_failure" : "prewrite_failure",
    });
  }
}
