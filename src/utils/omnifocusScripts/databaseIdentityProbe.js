function safeValue(read) {
  try {
    const value = read();
    if (value === undefined || value === null) return null;
    return String(value);
  } catch (_error) {
    return null;
  }
}

function documentIdentity(document) {
  if (!document) return null;
  return {
    name: safeValue(function () { return document.name(); }),
    id: safeValue(function () { return document.id(); }),
    fileUrl: safeValue(function () { return document.file(); }),
  };
}

function run(_argv) {
  try {
    const app = Application("OmniFocus");
    const defaultDocument = app.defaultDocument();
    const documents = app.documents();
    const frontDocument = documents.length > 0 ? documents[0] : null;
    const defaultIdentity = documentIdentity(defaultDocument);
    const frontIdentity = documentIdentity(frontDocument);
    return JSON.stringify({
      success: true,
      defaultDocument: defaultIdentity,
      frontDocument: frontIdentity,
      sameDocument: defaultIdentity !== null
        && frontIdentity !== null
        && defaultIdentity.id !== null
        && defaultIdentity.id === frontIdentity.id,
    });
  } catch (_error) {
    return JSON.stringify({ success: false, errorCategory: "identity_probe_failed" });
  }
}
