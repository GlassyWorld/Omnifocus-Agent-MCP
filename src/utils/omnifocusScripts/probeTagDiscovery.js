function run() {
  try {
    const app = Application("OmniFocus");
    const result = app.evaluateJavascript(`(() => {
      try {
        const snapshot = flattenedTags.slice();
        let active = 0;
        let onHold = 0;
        let dropped = 0;
        let roots = 0;
        let nested = 0;
        let mutuallyExclusiveParents = 0;
        let roundtripMismatches = 0;

        for (const tag of snapshot) {
          const id = tag.id.primaryKey;
          if (typeof id !== "string" || id.length === 0) {
            return JSON.stringify({ success: false, reason: "raw_schema_drift" });
          }

          const resolved = Tag.byIdentifier(id);
          if (!resolved || resolved.id.primaryKey !== id) roundtripMismatches += 1;

          if (tag.status === Tag.Status.Active) active += 1;
          else if (tag.status === Tag.Status.OnHold) onHold += 1;
          else if (tag.status === Tag.Status.Dropped) dropped += 1;
          else return JSON.stringify({ success: false, reason: "unknown_status" });

          const parent = tag.parent;
          if (parent) {
            const parentId = parent.id.primaryKey;
            if (typeof parentId !== "string" || parentId.length === 0) {
              return JSON.stringify({ success: false, reason: "raw_schema_drift" });
            }
            nested += 1;
          } else {
            roots += 1;
          }

          if (typeof tag.childrenAreMutuallyExclusive !== "boolean") {
            return JSON.stringify({ success: false, reason: "raw_schema_drift" });
          }
          if (tag.childrenAreMutuallyExclusive) mutuallyExclusiveParents += 1;
        }

        if (roundtripMismatches !== 0) {
          return JSON.stringify({ success: false, reason: "id_roundtrip_mismatch" });
        }

        return JSON.stringify({
          success: true,
          summary: {
            snapshotCount: snapshot.length,
            roundtripChecked: snapshot.length,
            active,
            onHold,
            dropped,
            roots,
            nested,
            mutuallyExclusiveParents,
          },
        });
      } catch (_error) {
        return JSON.stringify({ success: false, reason: "capability_unavailable" });
      }
    })()`);
    return result;
  } catch (_error) {
    return JSON.stringify({ success: false, reason: "process_failure" });
  }
}
