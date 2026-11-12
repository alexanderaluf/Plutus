const fs = require("node:fs");
const path = require("node:path");
const {
  withEntitlementsPlist,
  withDangerousMod,
  withXcodeProject,
} = require("@expo/config-plugins");

const APP_GROUP_ID = "group.com.plutus.budgettracker";
const EXTENSION_NAME = "PlutusWidgetExtension";
const EXTENSION_BUNDLE_SUFFIX = ".widget";

const WIDGET_SWIFT_SOURCE = `import SwiftUI
import WidgetKit
#if canImport(AppIntents)
import AppIntents
#endif

private let appGroupIdentifier = "${APP_GROUP_ID}"
private let snapshotStorageKey = "plutus.widget.snapshot.v1"
private let pendingProfileStorageKey = "plutus.widget.pendingProfileId.v1"

struct WidgetAccountItem: Codable, Hashable {
  let id: String
  let name: String
  let balanceFormatted: String
  let color: String
  let isPositive: Bool
}

struct WidgetProfileSnapshot: Codable, Hashable {
  let id: String
  let name: String
  let initials: String
  let color: String
  let currencyCode: String
  let accountCount: Int
  let accountCountLabel: String
  let monthLabel: String
  let balanceFormatted: String
  let assetsFormatted: String
  let debtFormatted: String
  let monthlyIncomeFormatted: String
  let monthlyExpenseFormatted: String
  let monthlyNetFormatted: String
  let assetsRatio: Int
  let cashflowRatio: Int
  let accountsSummary: String
  let topAccounts: [WidgetAccountItem]
}

struct WidgetLabels: Codable, Hashable {
  let appName: String
  let title: String
  let subtitle: String
  let totalBalance: String
  let assets: String
  let debt: String
  let monthlyIncome: String
  let monthlyExpense: String
  let accountsState: String
  let createIncome: String
  let createExpense: String
  let switchProfile: String
  let noAccounts: String
  let setupTitle: String
  let setupSubtitle: String

  static let preview = WidgetLabels(
    appName: "Plutus",
    title: "Assets & Cash Flow",
    subtitle: "Track balances, monthly flow, and add transactions",
    totalBalance: "Total balance",
    assets: "Assets",
    debt: "Liabilities",
    monthlyIncome: "Month income",
    monthlyExpense: "Month expense",
    accountsState: "Accounts state",
    createIncome: "Create income",
    createExpense: "Create expense",
    switchProfile: "Switch profile",
    noAccounts: "No active accounts yet",
    setupTitle: "Finish setting up Plutus",
    setupSubtitle: "Open Plutus to create your profile and accounts."
  )
}

struct WidgetSnapshotPayload: Codable {
  let version: Int
  let updatedAt: String
  let language: String
  let isRTL: Bool
  let themeMode: String
  let accentColor: String
  let amountsHidden: Bool
  var selectedProfileId: String?
  let labels: WidgetLabels
  let profiles: [WidgetProfileSnapshot]

  static let preview = WidgetSnapshotPayload(
    version: 1,
    updatedAt: "2026-10-27T12:00:00.000Z",
    language: "en",
    isRTL: false,
    themeMode: "system",
    accentColor: "cyan",
    amountsHidden: false,
    selectedProfileId: "preview-personal",
    labels: .preview,
    profiles: [
      WidgetProfileSnapshot(
        id: "preview-personal",
        name: "Personal",
        initials: "PE",
        color: "#70D2EB",
        currencyCode: "USD",
        accountCount: 3,
        accountCountLabel: "3 accounts",
        monthLabel: "Oct 2026",
        balanceFormatted: "24,580.00$",
        assetsFormatted: "26,120.00$",
        debtFormatted: "1,540.00$",
        monthlyIncomeFormatted: "+6,400.00$",
        monthlyExpenseFormatted: "-2,180.00$",
        monthlyNetFormatted: "+4,220.00$",
        assetsRatio: 88,
        cashflowRatio: 75,
        accountsSummary: "Checking: 18,400.00$  ·  Savings: 7,720.00$",
        topAccounts: [
          WidgetAccountItem(
            id: "acc-1",
            name: "Main Checking",
            balanceFormatted: "18,400.00$",
            color: "#70D2EB",
            isPositive: true
          ),
          WidgetAccountItem(
            id: "acc-2",
            name: "High-Yield Savings",
            balanceFormatted: "7,720.00$",
            color: "#78D6A3",
            isPositive: true
          )
        ]
      ),
      WidgetProfileSnapshot(
        id: "preview-family",
        name: "Family",
        initials: "FA",
        color: "#B89CF5",
        currencyCode: "USD",
        accountCount: 2,
        accountCountLabel: "2 accounts",
        monthLabel: "Oct 2026",
        balanceFormatted: "14,200.00$",
        assetsFormatted: "14,950.00$",
        debtFormatted: "750.00$",
        monthlyIncomeFormatted: "+4,800.00$",
        monthlyExpenseFormatted: "-1,920.00$",
        monthlyNetFormatted: "+2,880.00$",
        assetsRatio: 92,
        cashflowRatio: 71,
        accountsSummary: "Shared Bank: 14,950.00$  ·  Card: -750.00$",
        topAccounts: []
      )
    ]
  )
}

enum WidgetSharedStorage {
  static var defaults: UserDefaults {
    UserDefaults(suiteName: appGroupIdentifier) ?? .standard
  }

  static func readSnapshot(isPreview: Bool) -> WidgetSnapshotPayload {
    if isPreview {
      return .preview
    }
    guard let raw = defaults.string(forKey: snapshotStorageKey),
          let data = raw.data(using: .utf8),
          let decoded = try? JSONDecoder().decode(WidgetSnapshotPayload.self, from: data) else {
      return .preview
    }
    return decoded
  }

  static func cycleProfile() {
    let store = defaults
    guard let raw = store.string(forKey: snapshotStorageKey),
          let data = raw.data(using: .utf8),
          var payload = try? JSONDecoder().decode(WidgetSnapshotPayload.self, from: data),
          payload.profiles.count > 1 else {
      return
    }
    let currentIndex = payload.profiles.firstIndex(where: { $0.id == payload.selectedProfileId }) ?? 0
    let nextProfile = payload.profiles[(currentIndex + 1) % payload.profiles.count]
    payload.selectedProfileId = nextProfile.id
    if let encoded = try? JSONEncoder().encode(payload),
       let nextRaw = String(data: encoded, encoding: .utf8) {
      store.set(nextRaw, forKey: snapshotStorageKey)
      store.set(nextProfile.id, forKey: pendingProfileStorageKey)
      store.synchronize()
    }
  }
}

#if canImport(AppIntents)
@available(iOS 17.0, *)
struct SwitchPlutusProfileIntent: AppIntent {
  static var title: LocalizedStringResource = "Switch Plutus Profile"
  static var description = IntentDescription("Switches the active profile displayed in Plutus.")

  init() {}

  func perform() async throws -> some IntentResult {
    WidgetSharedStorage.cycleProfile()
    WidgetCenter.shared.reloadAllTimelines()
    return .result()
  }
}
#endif

struct PlutusWidgetEntry: TimelineEntry {
  let date: Date
  let snapshot: WidgetSnapshotPayload
}

struct PlutusWidgetTimelineProvider: TimelineProvider {
  func placeholder(in context: Context) -> PlutusWidgetEntry {
    PlutusWidgetEntry(date: Date(), snapshot: .preview)
  }

  func getSnapshot(in context: Context, completion: @escaping (PlutusWidgetEntry) -> Void) {
    let snapshot = WidgetSharedStorage.readSnapshot(isPreview: context.isPreview)
    completion(PlutusWidgetEntry(date: Date(), snapshot: snapshot))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<PlutusWidgetEntry>) -> Void) {
    let snapshot = WidgetSharedStorage.readSnapshot(isPreview: false)
    let entry = PlutusWidgetEntry(date: Date(), snapshot: snapshot)
    let nextUpdate = Calendar.current.date(byAdding: .minute, value: 30, to: Date()) ?? Date().addingTimeInterval(1800)
    completion(Timeline(entries: [entry], policy: .after(nextUpdate)))
  }
}

private struct WidgetThemePalette {
  let isDark: Bool

  var surfaceTop: Color {
    isDark ? Color(red: 0.07, green: 0.10, blue: 0.09) : Color(red: 0.95, green: 0.97, blue: 0.96)
  }
  var surfaceBottom: Color {
    isDark ? Color(red: 0.04, green: 0.06, blue: 0.05) : Color(red: 0.89, green: 0.94, blue: 0.91)
  }
  var border: Color {
    isDark ? Color(red: 0.15, green: 0.20, blue: 0.19) : Color(red: 0.77, green: 0.84, blue: 0.80)
  }
  var innerSurface: Color {
    isDark ? Color(red: 0.09, green: 0.13, blue: 0.13) : Color.white
  }
  var innerBorder: Color {
    isDark ? Color(red: 0.15, green: 0.21, blue: 0.20) : Color(red: 0.84, green: 0.89, blue: 0.86)
  }
  var pillBackground: Color {
    isDark ? Color(red: 0.12, green: 0.17, blue: 0.16) : Color(red: 0.86, green: 0.91, blue: 0.88)
  }
  var badgeBackground: Color {
    isDark ? Color(red: 0.10, green: 0.21, blue: 0.23) : Color(red: 0.83, green: 0.92, blue: 0.93)
  }
  var foreground: Color {
    isDark ? Color(red: 0.96, green: 0.97, blue: 0.96) : Color(red: 0.07, green: 0.13, blue: 0.10)
  }
  var muted: Color {
    isDark ? Color(red: 0.58, green: 0.65, blue: 0.62) : Color(red: 0.32, green: 0.40, blue: 0.36)
  }
  var accent: Color {
    isDark ? Color(red: 0.44, green: 0.82, blue: 0.92) : Color(red: 0.03, green: 0.49, blue: 0.55)
  }
  var progressTrack: Color {
    isDark ? Color(red: 0.13, green: 0.19, blue: 0.18) : Color(red: 0.81, green: 0.87, blue: 0.83)
  }
  var progressStart: Color {
    isDark ? Color(red: 0.20, green: 0.83, blue: 0.60) : Color(red: 0.03, green: 0.49, blue: 0.55)
  }
  var progressEnd: Color {
    isDark ? Color(red: 0.44, green: 0.82, blue: 0.92) : Color(red: 0.13, green: 0.53, blue: 0.36)
  }
  var incomeText: Color {
    isDark ? Color(red: 0.43, green: 0.91, blue: 0.72) : Color(red: 0.09, green: 0.47, blue: 0.29)
  }
  var incomeButtonBg: Color {
    isDark ? Color(red: 0.09, green: 0.20, blue: 0.16) : Color(red: 0.86, green: 0.95, blue: 0.90)
  }
  var incomeButtonBorder: Color {
    isDark ? Color(red: 0.14, green: 0.33, blue: 0.26) : Color(red: 0.66, green: 0.87, blue: 0.76)
  }
  var expenseText: Color {
    isDark ? Color(red: 0.99, green: 0.64, blue: 0.69) : Color(red: 0.75, green: 0.24, blue: 0.19)
  }
  var expenseButtonBg: Color {
    isDark ? Color(red: 0.21, green: 0.11, blue: 0.11) : Color(red: 0.98, green: 0.89, blue: 0.87)
  }
  var expenseButtonBorder: Color {
    isDark ? Color(red: 0.35, green: 0.17, blue: 0.18) : Color(red: 0.92, green: 0.73, blue: 0.71)
  }
}

struct PlutusWidgetEntryView: View {
  let entry: PlutusWidgetEntry
  @Environment(\\.colorScheme) private var systemColorScheme

  private var effectiveDark: Bool {
    if entry.snapshot.themeMode == "dark" { return true }
    if entry.snapshot.themeMode == "light" { return false }
    return systemColorScheme == .dark
  }

  private var palette: WidgetThemePalette {
    WidgetThemePalette(isDark: effectiveDark)
  }

  private var activeProfile: WidgetProfileSnapshot? {
    entry.snapshot.profiles.first(where: { $0.id == entry.snapshot.selectedProfileId })
      ?? entry.snapshot.profiles.first
  }

  private var nextProfileId: String? {
    guard entry.snapshot.profiles.count > 1, let active = activeProfile else { return nil }
    let idx = entry.snapshot.profiles.firstIndex(where: { $0.id == active.id }) ?? 0
    return entry.snapshot.profiles[(idx + 1) % entry.snapshot.profiles.count].id
  }

  private func encoded(_ value: String) -> String {
    value.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? value
  }

  var body: some View {
    let labels = entry.snapshot.labels
    let hasMultipleProfiles = entry.snapshot.profiles.count > 1

    VStack(alignment: .leading, spacing: 10) {
      // Row 1: Header with icon, title, account count, and profile switcher pill
      HStack(spacing: 8) {
        ZStack {
          Circle()
            .fill(palette.badgeBackground)
            .frame(width: 28, height: 28)
          Text("◈")
            .font(.system(size: 13, weight: .bold))
            .foregroundColor(palette.accent)
        }

        VStack(alignment: .leading, spacing: 1) {
          Text(labels.totalBalance)
            .font(.system(size: 12, weight: .semibold))
            .foregroundColor(palette.muted)
            .lineLimit(1)
          if let profile = activeProfile {
            Text(profile.accountCountLabel)
              .font(.system(size: 10, weight: .medium))
              .foregroundColor(palette.muted.opacity(0.85))
              .lineLimit(1)
          }
        }

        Spacer(minLength: 4)

        if let profile = activeProfile {
          if hasMultipleProfiles {
            #if canImport(AppIntents)
            if #available(iOS 17.0, *) {
              Button(intent: SwitchPlutusProfileIntent()) {
                profilePillContent(name: profile.name, showChevron: true)
              }
              .buttonStyle(.plain)
            } else if let nextId = nextProfileId,
                      let url = URL(string: "plutus:///widget-action?action=switch-profile&profileId=\\(encoded(nextId))") {
              Link(destination: url) {
                profilePillContent(name: profile.name, showChevron: true)
              }
            }
            #else
            if let nextId = nextProfileId,
               let url = URL(string: "plutus:///widget-action?action=switch-profile&profileId=\\(encoded(nextId))") {
              Link(destination: url) {
                profilePillContent(name: profile.name, showChevron: true)
              }
            }
            #endif
          } else {
            profilePillContent(name: profile.name, showChevron: false)
          }
        }
      }

      if let profile = activeProfile {
        // Hero Balance + Assets vs Liabilities Bar
        Link(destination: URL(string: "plutus:///(tabs)/accounts?profileId=\\(encoded(profile.id))")!) {
          VStack(alignment: .leading, spacing: 6) {
            Text(profile.balanceFormatted)
              .font(.system(size: 30, weight: .bold, design: .rounded))
              .foregroundColor(palette.foreground)
              .lineLimit(1)
              .minimumScaleFactor(0.65)

            HStack {
              Text("\\(labels.assets): \\(profile.assetsFormatted)")
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(palette.incomeText)
                .lineLimit(1)
              Spacer(minLength: 8)
              Text("\\(labels.debt): \\(profile.debtFormatted)")
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(palette.muted)
                .lineLimit(1)
            }

            GeometryReader { geo in
              let ratio = CGFloat(max(6, min(100, profile.assetsRatio))) / 100.0
              ZStack(alignment: .leading) {
                Capsule()
                  .fill(palette.progressTrack)
                  .frame(height: 8)
                Capsule()
                  .fill(
                    LinearGradient(
                      colors: [palette.progressStart, palette.progressEnd],
                      startPoint: .leading,
                      endPoint: .trailing
                    )
                  )
                  .frame(width: max(12, geo.size.width * ratio), height: 8)
              }
            }
            .frame(height: 8)
          }
        }

        Spacer(minLength: 0)

        // Row 2: Inner Card with Monthly Income/Expense + Account State
        Link(destination: URL(string: "plutus:///(tabs)/accounts?profileId=\\(encoded(profile.id))")!) {
          VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 12) {
              VStack(alignment: .leading, spacing: 2) {
                Text(labels.monthlyIncome)
                  .font(.system(size: 11, weight: .medium))
                  .foregroundColor(palette.muted)
                  .lineLimit(1)
                Text(profile.monthlyIncomeFormatted)
                  .font(.system(size: 15, weight: .bold, design: .rounded))
                  .foregroundColor(palette.incomeText)
                  .lineLimit(1)
                  .minimumScaleFactor(0.75)
              }
              .frame(maxWidth: .infinity, alignment: .leading)

              Rectangle()
                .fill(palette.innerBorder)
                .frame(width: 1, height: 30)

              VStack(alignment: .leading, spacing: 2) {
                Text(labels.monthlyExpense)
                  .font(.system(size: 11, weight: .medium))
                  .foregroundColor(palette.muted)
                  .lineLimit(1)
                Text(profile.monthlyExpenseFormatted)
                  .font(.system(size: 15, weight: .bold, design: .rounded))
                  .foregroundColor(palette.expenseText)
                  .lineLimit(1)
                  .minimumScaleFactor(0.75)
              }
              .frame(maxWidth: .infinity, alignment: .leading)
            }

            Rectangle()
              .fill(palette.innerBorder)
              .frame(height: 1)

            Text(profile.accountsSummary)
              .font(.system(size: 11, weight: .medium))
              .foregroundColor(palette.muted)
              .lineLimit(1)
          }
          .padding(.horizontal, 12)
          .padding(.vertical, 10)
          .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
              .fill(palette.innerSurface)
          )
          .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
              .stroke(palette.innerBorder, lineWidth: 1)
          )
        }

        Spacer(minLength: 0)

        // Row 3: Two Action Buttons (Create Income & Create Expense)
        HStack(spacing: 10) {
          Link(destination: URL(string: "plutus:///transactions/create?type=income&profileId=\\(encoded(profile.id))")!) {
            HStack(spacing: 6) {
              Text("+")
                .font(.system(size: 15, weight: .bold))
              Text(labels.createIncome)
                .font(.system(size: 13, weight: .bold))
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            }
            .foregroundColor(palette.incomeText)
            .frame(maxWidth: .infinity)
            .frame(height: 40)
            .background(
              RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(palette.incomeButtonBg)
            )
            .overlay(
              RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(palette.incomeButtonBorder, lineWidth: 1)
            )
          }

          Link(destination: URL(string: "plutus:///transactions/create?type=expense&profileId=\\(encoded(profile.id))")!) {
            HStack(spacing: 6) {
              Text("−")
                .font(.system(size: 15, weight: .bold))
              Text(labels.createExpense)
                .font(.system(size: 13, weight: .bold))
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            }
            .foregroundColor(palette.expenseText)
            .frame(maxWidth: .infinity)
            .frame(height: 40)
            .background(
              RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(palette.expenseButtonBg)
            )
            .overlay(
              RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(palette.expenseButtonBorder, lineWidth: 1)
            )
          }
        }
      } else {
        Spacer()
        Text(labels.setupTitle)
          .font(.system(size: 18, weight: .bold))
          .foregroundColor(palette.foreground)
        Text(labels.setupSubtitle)
          .font(.system(size: 13, weight: .medium))
          .foregroundColor(palette.muted)
        Spacer()
      }
    }
    .environment(\\.layoutDirection, entry.snapshot.isRTL ? .rightToLeft : .leftToRight)
    .padding(18)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
  }

  @ViewBuilder
  private func profilePillContent(name: String, showChevron: Bool) -> some View {
    HStack(spacing: 4) {
      Circle()
        .fill(palette.accent)
        .frame(width: 6, height: 6)
      Text(showChevron ? "\\(name) ▾" : name)
        .font(.system(size: 11, weight: .bold))
        .foregroundColor(palette.foreground)
        .lineLimit(1)
    }
    .padding(.horizontal, 10)
    .padding(.vertical, 5)
    .background(
      Capsule()
        .fill(palette.pillBackground)
    )
  }
}

struct PlutusWidgetBackgroundView: View {
  let themeMode: String
  @Environment(\\.colorScheme) private var systemColorScheme

  private var effectiveDark: Bool {
    if themeMode == "dark" { return true }
    if themeMode == "light" { return false }
    return systemColorScheme == .dark
  }

  var body: some View {
    let palette = WidgetThemePalette(isDark: effectiveDark)
    LinearGradient(
      colors: [palette.surfaceTop, palette.surfaceBottom],
      startPoint: .topLeading,
      endPoint: .bottomTrailing
    )
  }
}

struct PlutusOverviewWidget: Widget {
  let kind: String = "PlutusOverviewWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: PlutusWidgetTimelineProvider()) { entry in
      if #available(iOS 17.0, *) {
        PlutusWidgetEntryView(entry: entry)
          .containerBackground(for: .widget) {
            PlutusWidgetBackgroundView(themeMode: entry.snapshot.themeMode)
          }
      } else {
        PlutusWidgetEntryView(entry: entry)
          .background(PlutusWidgetBackgroundView(themeMode: entry.snapshot.themeMode))
      }
    }
    .configurationDisplayName(WidgetLabels.preview.title)
    .description(WidgetLabels.preview.subtitle)
    .supportedFamilies([.systemLarge])
    .contentMarginsDisabledIfAvailable()
  }
}

private extension WidgetConfiguration {
  func contentMarginsDisabledIfAvailable() -> some WidgetConfiguration {
    if #available(iOS 17.0, *) {
      return self.contentMarginsDisabled()
    } else {
      return self
    }
  }
}

@main
struct PlutusWidgetBundle: WidgetBundle {
  var body: some Widget {
    PlutusOverviewWidget()
  }
}
`;

const WIDGET_INFO_PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>$(DEVELOPMENT_LANGUAGE)</string>
  <key>CFBundleDisplayName</key>
  <string>Plutus Widget</string>
  <key>CFBundleExecutable</key>
  <string>$(EXECUTABLE_NAME)</string>
  <key>CFBundleIdentifier</key>
  <string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>$(PRODUCT_NAME)</string>
  <key>CFBundlePackageType</key>
  <string>$(PRODUCT_BUNDLE_PACKAGE_TYPE)</string>
  <key>CFBundleShortVersionString</key>
  <string>$(MARKETING_VERSION)</string>
  <key>CFBundleVersion</key>
  <string>$(CURRENT_PROJECT_VERSION)</string>
  <key>NSExtension</key>
  <dict>
    <key>NSExtensionPointIdentifier</key>
    <string>com.apple.widgetkit-extension</string>
  </dict>
</dict>
</plist>
`;

const WIDGET_ENTITLEMENTS = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.application-groups</key>
  <array>
    <string>${APP_GROUP_ID}</string>
  </array>
</dict>
</plist>
`;

module.exports = function withPlutusWidgets(config) {
  config.ios = config.ios ?? {};
  config.ios.entitlements = config.ios.entitlements ?? {};
  const existingGroups =
    config.ios.entitlements["com.apple.security.application-groups"] ?? [];
  if (!existingGroups.includes(APP_GROUP_ID)) {
    config.ios.entitlements["com.apple.security.application-groups"] = [
      ...existingGroups,
      APP_GROUP_ID,
    ];
  }

  config = withEntitlementsPlist(config, (mod) => {
    const groups =
      mod.modResults["com.apple.security.application-groups"] ?? [];
    if (!groups.includes(APP_GROUP_ID)) {
      mod.modResults["com.apple.security.application-groups"] = [
        ...groups,
        APP_GROUP_ID,
      ];
    }
    return mod;
  });

  config = withDangerousMod(config, [
    "ios",
    async (mod) => {
      const extensionDir = path.join(
        mod.modRequest.platformProjectRoot,
        EXTENSION_NAME,
      );
      fs.mkdirSync(extensionDir, { recursive: true });
      fs.writeFileSync(
        path.join(extensionDir, "PlutusWidget.swift"),
        WIDGET_SWIFT_SOURCE,
        "utf8",
      );
      fs.writeFileSync(
        path.join(extensionDir, "Info.plist"),
        WIDGET_INFO_PLIST,
        "utf8",
      );
      fs.writeFileSync(
        path.join(extensionDir, `${EXTENSION_NAME}.entitlements`),
        WIDGET_ENTITLEMENTS,
        "utf8",
      );
      return mod;
    },
  ]);

  config = withXcodeProject(config, (mod) => {
    const xcodeProject = mod.modResults;
    if (xcodeProject.pbxTargetByName(EXTENSION_NAME)) {
      return mod;
    }

    const bundleId = `${config.ios?.bundleIdentifier ?? "com.plutus.budgettracker"}${EXTENSION_BUNDLE_SUFFIX}`;
    const target = xcodeProject.addTarget(
      EXTENSION_NAME,
      "app_extension",
      EXTENSION_NAME,
      bundleId,
    );

    const group = xcodeProject.addPbxGroup(
      [
        "PlutusWidget.swift",
        "Info.plist",
        `${EXTENSION_NAME}.entitlements`,
      ],
      EXTENSION_NAME,
      EXTENSION_NAME,
    );

    const mainGroupId = xcodeProject.getFirstProject().firstProject.mainGroup;
    xcodeProject.addToPbxGroup(group.uuid, mainGroupId);

    xcodeProject.addBuildPhase(
      ["PlutusWidget.swift"],
      "PBXSourcesBuildPhase",
      "Sources",
      target.uuid,
    );
    xcodeProject.addBuildPhase(
      ["WidgetKit.framework", "SwiftUI.framework"],
      "PBXFrameworksBuildPhase",
      "Frameworks",
      target.uuid,
    );

    const configurations = xcodeProject.pbxXCBuildConfigurationSection();
    for (const key of Object.keys(configurations)) {
      const buildConfig = configurations[key];
      if (
        buildConfig &&
        typeof buildConfig === "object" &&
        buildConfig.buildSettings &&
        buildConfig.buildSettings.PRODUCT_NAME === `"${EXTENSION_NAME}"`
      ) {
        buildConfig.buildSettings.IPHONEOS_DEPLOYMENT_TARGET = "16.4";
        buildConfig.buildSettings.SWIFT_VERSION = "5.9";
        buildConfig.buildSettings.TARGETED_DEVICE_FAMILY = '"1,2"';
        buildConfig.buildSettings.CODE_SIGN_ENTITLEMENTS = `${EXTENSION_NAME}/${EXTENSION_NAME}.entitlements`;
        buildConfig.buildSettings.INFOPLIST_FILE = `${EXTENSION_NAME}/Info.plist`;
        buildConfig.buildSettings.MARKETING_VERSION =
          config.version ?? "1.0.0";
        buildConfig.buildSettings.CURRENT_PROJECT_VERSION = "1";
        buildConfig.buildSettings.SKIP_INSTALL = "YES";
      }
    }

    return mod;
  });

  return config;
};
