// Requirements from the upstream Gemma 4 E2B LiteRT-LM Android listing.
// This policy only evaluates hardware. It does not assert runtime availability.
export interface ModelManifest {
  modelId: string;
  name: string;
  fileName: string;
  sizeBytes: number;
  /** Verified natively after download (LocalAIModelStore). */
  sha256: string;
  minMemoryBytes: number;
  minFreeStorageBytes: number;
  contextLimit: number;
  supportsAudio: boolean;
  supportsVision: boolean;
  runtimeVersion: string;
}

/** Versioned so a future model update changes one record, not scattered constants. */
export const LOCAL_AI_MODEL = {
  modelId: "litert-community/gemma-4-E2B-it-litert-lm@6e5c4f1",
  name: "Gemma 4 E2B",
  fileName: "gemma-4-E2B-it.litertlm",
  sizeBytes: 2_588_147_712,
  sha256: "181938105e0eefd105961417e8da75903eacda102c4fce9ce90f50b97139a63c",
  minMemoryBytes: 8_000_000_000,
  minFreeStorageBytes: 2 * 2_588_147_712 + 1_000_000_000,
  contextLimit: 32_768,
  supportsAudio: true,
  supportsVision: true,
  runtimeVersion: "LiteRT-LM 0.15.0 (react-native-litert-lm 0.7.0)",
} as const satisfies ModelManifest;

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
