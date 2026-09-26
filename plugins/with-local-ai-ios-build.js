const { withPodfile } = require("@expo/config-plugins");

module.exports = function withLocalAiIosBuild(config) {
  return withPodfile(config, (project) => {
    const marker =
      "# Plutus: Xcode 26.2 builds ExpoModulesJSI in Swift 5 mode.";
    if (project.modResults.contents.includes(marker)) return project;
    project.modResults.contents = project.modResults.contents.replace(
      /    \)\n  end\nend\s*$/,
      `    )
    ${marker}
    installer.pods_project.targets.each do |target|
      next unless target.name == 'ExpoModulesJSI'
      target.build_configurations.each do |build_config|
        build_config.build_settings['SWIFT_VERSION'] = '5.9'
        build_config.build_settings['SWIFT_STRICT_CONCURRENCY'] = 'minimal'
      end
    end
  end
end
`,
    );
    return project;
  });
};
