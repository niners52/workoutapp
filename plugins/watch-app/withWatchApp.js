const {
  withXcodeProject,
  withEntitlementsPlist,
  withInfoPlist,
  withDangerousMod,
} = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Config plugin to add Apple Watch companion app to an Expo project.
 * Fully automated - no manual Xcode work required.
 */

const WATCH_TARGET_NAME = 'WorkoutTrackerWatch';
const WATCH_BUNDLE_ID_SUFFIX = '.watchkitapp';
const DEVELOPMENT_TEAM = 'K3HQYRNVMR';

// Add WatchConnectivity framework entitlements
const withWatchEntitlements = (config) => {
  return withEntitlementsPlist(config, (config) => {
    // No special entitlements needed for WatchConnectivity
    return config;
  });
};

// Copy Watch app files and iOS bridge files
const withWatchAppFiles = (config) => {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const platformProjectRoot = config.modRequest.platformProjectRoot;
      const projectName = config.modRequest.projectName;
      const bundleId = config.ios?.bundleIdentifier || 'com.app.identifier';

      const pluginDir = path.join(projectRoot, 'plugins', 'watch-app');
      const mainAppDir = path.join(platformProjectRoot, projectName);

      // Ensure main app directory exists
      if (!fs.existsSync(mainAppDir)) {
        fs.mkdirSync(mainAppDir, { recursive: true });
      }

      // Copy iOS bridge files to main app
      const iosBridgeFiles = [
        'WatchConnectivityManager.swift',
        'WatchConnectivityBridge.swift',
        'WatchConnectivityBridge.m',
      ];
      for (const file of iosBridgeFiles) {
        const src = path.join(pluginDir, 'ios-bridge', file);
        const dest = path.join(mainAppDir, file);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, dest);
        }
      }

      // Create Watch App directory
      const watchAppDir = path.join(platformProjectRoot, WATCH_TARGET_NAME);
      if (!fs.existsSync(watchAppDir)) {
        fs.mkdirSync(watchAppDir, { recursive: true });
      }

      // Copy Watch app Swift files
      const watchSwiftFiles = [
        'WorkoutTrackerWatchApp.swift',
        'ContentView.swift',
        'WorkoutActiveView.swift',
        'LogSetView.swift',
        'WatchViewModel.swift',
      ];
      for (const file of watchSwiftFiles) {
        const src = path.join(pluginDir, 'swift', file);
        const dest = path.join(watchAppDir, file);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, dest);
        }
      }

      // Create Watch App Info.plist
      const watchInfoPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>$(DEVELOPMENT_LANGUAGE)</string>
  <key>CFBundleDisplayName</key>
  <string>Workout Tracker</string>
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
  <key>WKApplication</key>
  <true/>
  <key>WKCompanionAppBundleIdentifier</key>
  <string>${bundleId}</string>
</dict>
</plist>`;
      fs.writeFileSync(path.join(watchAppDir, 'Info.plist'), watchInfoPlist);

      // Create Watch App Assets.xcassets
      const assetsDir = path.join(watchAppDir, 'Assets.xcassets');
      if (!fs.existsSync(assetsDir)) {
        fs.mkdirSync(assetsDir, { recursive: true });
      }

      // Assets Contents.json
      fs.writeFileSync(path.join(assetsDir, 'Contents.json'), JSON.stringify({
        info: { author: 'xcode', version: 1 }
      }, null, 2));

      // AccentColor.colorset
      const accentColorDir = path.join(assetsDir, 'AccentColor.colorset');
      if (!fs.existsSync(accentColorDir)) {
        fs.mkdirSync(accentColorDir, { recursive: true });
      }
      fs.writeFileSync(path.join(accentColorDir, 'Contents.json'), JSON.stringify({
        colors: [{
          color: {
            'color-space': 'srgb',
            components: {
              alpha: '1.000',
              blue: '0.184',
              green: '0.773',
              red: '1.000'
            }
          },
          idiom: 'universal'
        }],
        info: { author: 'xcode', version: 1 }
      }, null, 2));

      // AppIcon.appiconset
      const appIconDir = path.join(assetsDir, 'AppIcon.appiconset');
      if (!fs.existsSync(appIconDir)) {
        fs.mkdirSync(appIconDir, { recursive: true });
      }
      fs.writeFileSync(path.join(appIconDir, 'Contents.json'), JSON.stringify({
        images: [
          { idiom: 'watch', scale: '2x', 'screen-width': '<=145', size: '24x24' },
          { idiom: 'watch', scale: '2x', 'screen-width': '>145', size: '27.5x27.5' },
          { idiom: 'watch', scale: '2x', 'screen-width': '>183', size: '29x29' },
          { idiom: 'watch', scale: '2x', 'screen-width': '<=145', size: '40x40' },
          { idiom: 'watch', scale: '2x', 'screen-width': '>145', size: '44x44' },
          { idiom: 'watch', scale: '2x', 'screen-width': '>183', size: '46x46' },
          { idiom: 'watch', scale: '2x', 'screen-width': '>183', size: '51x51' },
          { idiom: 'watch-marketing', scale: '1x', size: '1024x1024' }
        ],
        info: { author: 'xcode', version: 1 }
      }, null, 2));

      return config;
    },
  ]);
};

// Add Watch app target to Xcode project
const withWatchAppTarget = (config) => {
  return withXcodeProject(config, (config) => {
    const project = config.modResults;
    const projectName = config.modRequest.projectName;
    const bundleId = config.ios?.bundleIdentifier || 'com.app.identifier';
    const watchBundleId = `${bundleId}${WATCH_BUNDLE_ID_SUFFIX}`;

    // Add iOS bridge source files to main app target
    const mainTarget = project.getFirstTarget();
    const mainGroupKey = project.getFirstProject().firstProject.mainGroup;

    const iosBridgeFiles = [
      'WatchConnectivityManager.swift',
      'WatchConnectivityBridge.swift',
      'WatchConnectivityBridge.m',
    ];

    for (const file of iosBridgeFiles) {
      const filePath = `${projectName}/${file}`;
      if (!project.hasFile(filePath)) {
        project.addSourceFile(filePath, { target: mainTarget.uuid }, mainGroupKey);
      }
    }

    // Add WatchConnectivity framework to main target
    const frameworksBuildPhase = project.pbxFrameworksBuildPhaseObj(mainTarget.uuid);
    if (frameworksBuildPhase) {
      // Check if WatchConnectivity is already added
      let hasWatchConnectivity = false;
      const buildFiles = project.pbxBuildFileSection();
      for (const key in buildFiles) {
        const file = buildFiles[key];
        if (file.fileRef && file.fileRef_comment === 'WatchConnectivity.framework') {
          hasWatchConnectivity = true;
          break;
        }
      }

      if (!hasWatchConnectivity) {
        project.addFramework('WatchConnectivity.framework', { weak: false });
      }
    }

    // Check if watch target already exists
    const existingTargets = project.pbxNativeTargetSection();
    let watchTargetExists = false;
    let watchTargetUuid = null;

    for (const key in existingTargets) {
      if (existingTargets[key].name === WATCH_TARGET_NAME) {
        watchTargetExists = true;
        watchTargetUuid = key;
        break;
      }
    }

    if (!watchTargetExists) {
      // Create watch app target
      const watchTarget = project.addTarget(
        WATCH_TARGET_NAME,
        'watch2_app',
        WATCH_TARGET_NAME,
        watchBundleId
      );

      if (watchTarget) {
        watchTargetUuid = watchTarget.uuid;

        // Create a group for watch app files
        const watchSwiftFiles = [
          'WorkoutTrackerWatchApp.swift',
          'ContentView.swift',
          'WorkoutActiveView.swift',
          'LogSetView.swift',
          'WatchViewModel.swift',
          'Info.plist',
          'Assets.xcassets',
        ];

        const watchGroup = project.addPbxGroup(
          watchSwiftFiles,
          WATCH_TARGET_NAME,
          WATCH_TARGET_NAME
        );

        // Add watch group to main project
        project.addToPbxGroup(watchGroup.uuid, mainGroupKey);

        // Add Swift source files to watch target
        const swiftFiles = [
          `${WATCH_TARGET_NAME}/WorkoutTrackerWatchApp.swift`,
          `${WATCH_TARGET_NAME}/ContentView.swift`,
          `${WATCH_TARGET_NAME}/WorkoutActiveView.swift`,
          `${WATCH_TARGET_NAME}/LogSetView.swift`,
          `${WATCH_TARGET_NAME}/WatchViewModel.swift`,
        ];

        for (const file of swiftFiles) {
          project.addSourceFile(file, { target: watchTargetUuid }, watchGroup.uuid);
        }

        // Add Assets.xcassets to watch target resources
        project.addResourceFile(
          `${WATCH_TARGET_NAME}/Assets.xcassets`,
          { target: watchTargetUuid },
          watchGroup.uuid
        );
      }
    }

    // Configure build settings for watch target
    const configurations = project.pbxXCBuildConfigurationSection();
    for (const key in configurations) {
      const config = configurations[key];
      if (config.buildSettings) {
        const targetName = config.buildSettings.PRODUCT_NAME;
        const productBundleId = config.buildSettings.PRODUCT_BUNDLE_IDENTIFIER;

        // Check if this configuration belongs to watch target
        if (targetName === `"${WATCH_TARGET_NAME}"` ||
            targetName === '"$(TARGET_NAME)"' && productBundleId === watchBundleId) {
          config.buildSettings.ASSETCATALOG_COMPILER_APPICON_NAME = 'AppIcon';
          config.buildSettings.ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME = 'AccentColor';
          config.buildSettings.CODE_SIGN_STYLE = 'Automatic';
          config.buildSettings.CURRENT_PROJECT_VERSION = '1';
          config.buildSettings.DEVELOPMENT_TEAM = DEVELOPMENT_TEAM;
          config.buildSettings.GENERATE_INFOPLIST_FILE = 'YES';
          config.buildSettings.INFOPLIST_FILE = `${WATCH_TARGET_NAME}/Info.plist`;
          config.buildSettings.INFOPLIST_KEY_CFBundleDisplayName = '"Workout Tracker"';
          config.buildSettings.INFOPLIST_KEY_UISupportedInterfaceOrientations = '"UIInterfaceOrientationPortrait UIInterfaceOrientationPortraitUpsideDown"';
          config.buildSettings.INFOPLIST_KEY_WKCompanionAppBundleIdentifier = bundleId;
          config.buildSettings.INFOPLIST_KEY_WKRunsIndependentlyOfCompanionApp = 'NO';
          config.buildSettings.LD_RUNPATH_SEARCH_PATHS = '"$(inherited) @executable_path/Frameworks"';
          config.buildSettings.MARKETING_VERSION = '1.0';
          config.buildSettings.PRODUCT_BUNDLE_IDENTIFIER = watchBundleId;
          config.buildSettings.PRODUCT_NAME = `"${WATCH_TARGET_NAME}"`;
          config.buildSettings.SDKROOT = 'watchos';
          config.buildSettings.SKIP_INSTALL = 'YES';
          config.buildSettings.SWIFT_EMIT_LOC_STRINGS = 'YES';
          config.buildSettings.SWIFT_VERSION = '5.0';
          config.buildSettings.TARGETED_DEVICE_FAMILY = '4';
          config.buildSettings.WATCHOS_DEPLOYMENT_TARGET = '9.0';
        }
      }
    }

    // Add embed watch content build phase to main target
    if (watchTargetUuid) {
      // Check if embed phase already exists
      let embedPhaseExists = false;
      const copyFilesBuildPhases = project.pbxCopyFilesBuildPhaseSection();
      for (const key in copyFilesBuildPhases) {
        const phase = copyFilesBuildPhases[key];
        if (phase.name === '"Embed Watch Content"') {
          embedPhaseExists = true;
          break;
        }
      }

      if (!embedPhaseExists) {
        const embedPhase = project.addBuildPhase(
          [`${WATCH_TARGET_NAME}.app`],
          'PBXCopyFilesBuildPhase',
          'Embed Watch Content',
          mainTarget.uuid,
          'watch2_app'
        );

        if (embedPhase) {
          // Set destination to Watch folder (16)
          embedPhase.buildPhase.dstSubfolderSpec = 16;
          embedPhase.buildPhase.dstPath = '$(CONTENTS_FOLDER_PATH)/Watch';
        }
      }
    }

    return config;
  });
};

// Main plugin
const withWatchApp = (config) => {
  config = withWatchEntitlements(config);
  config = withWatchAppFiles(config);
  config = withWatchAppTarget(config);
  return config;
};

module.exports = withWatchApp;
