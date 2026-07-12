export type ServerProfile =
  | "personal-readonly"
  | "upstream-full";

export const SERVER_PROFILES: readonly ServerProfile[] = [
  "personal-readonly",
  "upstream-full",
];

export function resolveServerProfile(value: string | undefined): ServerProfile {
  const normalized = value?.trim();

  if (!normalized) {
    return "upstream-full";
  }

  if (normalized === "personal-readonly" || normalized === "upstream-full") {
    return normalized;
  }

  throw new Error(
    `Invalid OMNIFOCUS_MCP_PROFILE value "${normalized}". Allowed values: ${SERVER_PROFILES.join(", ")}.`
  );
}
