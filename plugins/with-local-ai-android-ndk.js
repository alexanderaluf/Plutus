const { withProjectBuildGradle } = require("@expo/config-plugins");

module.exports = function withLocalAiAndroidNdk(config) {
  return withProjectBuildGradle(config, (project) => {
    if (project.modResults.language !== "groovy") return project;
    const marker = "// Plutus: use the Expo NDK for LiteRT-LM too.";
    if (project.modResults.contents.includes(marker)) return project;
    project.modResults.contents += `
${marker}
subprojects { subproject ->
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
