// Requirements from the upstream Gemma 4 E2B LiteRT-LM Android listing.
// This policy only evaluates hardware. It does not assert runtime availability.
export const LOCAL_AI_MODEL = {
  name: "Gemma 4 E2B",
  sizeBytes: 2_588_147_712,
  minMemoryBytes: 8_000_000_000,
  minFreeStorageBytes: 2 * 2_588_147_712 + 1_000_000_000,
} as const;

export type CompatibilityReason =
  | "platform"
  | "simulator"
  | "architecture"
  | "memory-unknown"
  | "memory-low"
  | "storage-unknown"
  | "storage-low";

export type LocalAICompatibility = {
  hardwareSupported: boolean;
  reasons: CompatibilityReason[];
  totalMemoryBytes: number | null;
  freeStorageBytes: number | null;
  architecture: string | null;
  isExpoGo: boolean;
};

export function evaluateLocalAICompatibility(input: {
  platform: string;
  isDevice: boolean;
  architectures: string[] | null;
  totalMemoryBytes: number | null;
  freeStorageBytes: number | null;
  isExpoGo: boolean;
}): LocalAICompatibility {
  const reasons: CompatibilityReason[] = [];
  if (input.platform !== "ios" && input.platform !== "android")
    reasons.push("platform");
  if (!input.isDevice) reasons.push("simulator");
  const architecture = input.architectures?.find((value) =>
    /arm64|aarch64|x86[-_]?64/i.test(value),
  );
  if (!architecture) reasons.push("architecture");
  if (input.totalMemoryBytes === null || input.totalMemoryBytes <= 0)
    reasons.push("memory-unknown");
  else if (input.totalMemoryBytes < LOCAL_AI_MODEL.minMemoryBytes)
    reasons.push("memory-low");
  if (input.freeStorageBytes === null || input.freeStorageBytes < 0)
    reasons.push("storage-unknown");
  else if (input.freeStorageBytes < LOCAL_AI_MODEL.minFreeStorageBytes)
    reasons.push("storage-low");
  return {
    hardwareSupported: reasons.length === 0,
    reasons,
    totalMemoryBytes: input.totalMemoryBytes,
    freeStorageBytes: input.freeStorageBytes,
    architecture: architecture ?? null,
    isExpoGo: input.isExpoGo,
  };
}
