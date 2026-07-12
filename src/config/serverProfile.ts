export type ServerProfile =
  | "personal-production"
  | "upstream-full";

export const SERVER_PROFILES: readonly ServerProfile[] = [
  "personal-production",
  "upstream-full",
];

export function resolveServerProfile(value: string | undefined): ServerProfile {
  const normalized = value?.trim();

  if (!normalized) {
    return "personal-production";
  }

  if (normalized === "personal-production" || normalized === "upstream-full") {
    return normalized;
  }

  throw new Error(
    `Invalid OMNIFOCUS_MCP_PROFILE value "${normalized}". Allowed values: ${SERVER_PROFILES.join(", ")}.`
  );
}
