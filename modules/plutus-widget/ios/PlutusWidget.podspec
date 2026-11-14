Pod::Spec.new do |s|
  s.name           = 'PlutusWidget'
  s.version        = '1.0.0'
  s.summary        = 'Home screen widget bridge for Plutus'
  s.description    = 'Synchronizes read-only financial overview snapshots and profile selection with WidgetKit.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '16.4',
    :tvos => '16.4'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end

