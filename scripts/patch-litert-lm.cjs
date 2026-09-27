const fs = require("node:fs");
const path = require("node:path");

// react-native-litert-lm 0.7.0 (LiteRT-LM 0.15.0) always asks for a GPU vision
// executor when a multimodal model loads on Android, even on the CPU path.
// Devices without OpenCL then fail the whole multimodal engine and voice input
// loses its audio backend. Use a CPU vision executor when the main backend is
// CPU; GPU requests keep the library's GPU → CPU fallback chain.
const engine = path.join(
  __dirname,
  "../node_modules/react-native-litert-lm/android/src/main/java/com/margelo/nitro/dev/litert/litertlm/HybridLiteRTLM.kt",
);
if (fs.existsSync(engine)) {
  const before = fs.readFileSync(engine, "utf8");
  const after = before.replace(
    "val lmVisionBackend = if (isMultimodal) com.google.ai.edge.litertlm.Backend.GPU() else null",
    "val lmVisionBackend = if (isMultimodal) (if (backend == Backend.CPU) com.google.ai.edge.litertlm.Backend.CPU() else com.google.ai.edge.litertlm.Backend.GPU()) else null",
  );
  if (after !== before) fs.writeFileSync(engine, after);
}
