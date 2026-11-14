Pod::Spec.new do |s|
  s.name           = 'PlutusFastStore'
  s.version        = '1.0.0'
  s.summary        = 'High-speed per-month SQLite and partition index engine for Plutus'
  s.description    = 'Direct native SQLite C-API reader, bounded LRU per-month index file store, and cross-month indexed query accelerator.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '16.4',
    :tvos => '16.4'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.library = 'sqlite3'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
