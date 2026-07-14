function run() {
  try {
    const app = Application("OmniFocus");
    const result = app.evaluateJavascript(`(() => {
      try {
        const snapshot = flattenedTags.slice();
        const tags = snapshot.map((tag) => {
          const parent = tag.parent;
          let status = "Unknown";
          if (tag.status === Tag.Status.Active) status = "Active";
          if (tag.status === Tag.Status.OnHold) status = "OnHold";
          if (tag.status === Tag.Status.Dropped) status = "Dropped";

          return {
            id: tag.id.primaryKey,
            name: tag.name,
            status,
            parentId: parent ? parent.id.primaryKey : null,
            childrenAreMutuallyExclusive: tag.childrenAreMutuallyExclusive,
          };
        });

        return JSON.stringify({ success: true, tags });
      } catch (_error) {
        return JSON.stringify({ success: false, reason: "raw_schema_drift" });
      }
    })()`);
    return result;
  } catch (_error) {
    return JSON.stringify({ success: false, reason: "process_failure" });
  }
}
