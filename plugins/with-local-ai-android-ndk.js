const { withAndroidManifest, withProjectBuildGradle } = require("@expo/config-plugins");

module.exports = function withLocalAiAndroidNdk(config) {
  const withSpeechQuery = withAndroidManifest(config, (manifest) => {
    const queries = manifest.modResults.manifest.queries ?? [{}];
    const query = queries[0];
    query.intent = query.intent ?? [];
    const action = "android.speech.RecognitionService";
    if (!query.intent.some((item) => item.action?.some((entry) => entry.$?.["android:name"] === action))) {
      query.intent.push({ action: [{ $: { "android:name": action } }] });
    }
    manifest.modResults.manifest.queries = queries;
    return manifest;
  });
  return withProjectBuildGradle(withSpeechQuery, (project) => {
    if (project.modResults.language !== "groovy") return project;
    const marker = "// Plutus: use the Expo NDK for LiteRT-LM too.";
    if (project.modResults.contents.includes(marker)) return project;
    project.modResults.contents += `
${marker}
subprojects { subproject ->
  // On Windows, CMake's generated Ninja manifests can keep rebuilding when
  // Prefab inputs live under a long node_modules path. Gradle reconfigures
  // CMake when the build inputs change, so Ninja need not do it again.
  if (System.getProperty("os.name").toLowerCase().contains("windows") &&
      subproject.name in ["app", "expo-modules-core", "react-native-litert-lm", "react-native-nitro-modules", "react-native-reanimated", "react-native-screens", "react-native-worklets"]) {
    ["com.android.application", "com.android.library"].each { pluginId ->
      subproject.plugins.withId(pluginId) {
        subproject.android.defaultConfig.externalNativeBuild.cmake.arguments "-DCMAKE_SUPPRESS_REGENERATION=ON"
      }
    }
  }
  if (subproject.name == "react-native-litert-lm") {
    subproject.plugins.withId("com.android.library") {
      subproject.android.ndkVersion = rootProject.ext.ndkVersion
    }
  }
}
`;
    return project;
  });
};
