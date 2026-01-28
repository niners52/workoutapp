const {
  withXcodeProject,
  withEntitlementsPlist,
  withInfoPlist,
  withDangerousMod,
} = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Config plugin to add Live Activities support to an Expo project.
 * Fully automated - no manual Xcode work required.
 */

// Add entitlements
const withLiveActivityEntitlements = (config) => {
  return withEntitlementsPlist(config, (config) => {
    config.modResults['com.apple.developer.push-type.liveactivity'] = true;

    const bundleId = config.ios?.bundleIdentifier || 'com.app.identifier';
    const existingGroups = config.modResults['com.apple.security.application-groups'] || [];
    const appGroup = `group.${bundleId}`;

    if (!existingGroups.includes(appGroup)) {
      config.modResults['com.apple.security.application-groups'] = [...existingGroups, appGroup];
    }

    return config;
  });
};

// Add Info.plist entries
const withLiveActivityInfoPlist = (config) => {
  return withInfoPlist(config, (config) => {
    config.modResults.NSSupportsLiveActivities = true;
    return config;
  });
};

// Copy files and create widget extension
const withLiveActivityFiles = (config) => {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const platformProjectRoot = config.modRequest.platformProjectRoot;
      const projectName = config.modRequest.projectName;
      const bundleId = config.ios?.bundleIdentifier || 'com.app.identifier';

      // Copy native module files to main app
      const pluginDir = path.join(projectRoot, 'plugins', 'live-activities');
      const destDir = path.join(platformProjectRoot, projectName);

      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      // Copy native module files
      const nativeModuleFiles = ['LiveActivityModule.swift', 'LiveActivityModule.m'];
      for (const file of nativeModuleFiles) {
        const src = path.join(pluginDir, 'native-module', file);
        const dest = path.join(destDir, file);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, dest);
        }
      }

      // Copy RestTimerAttributes to main app
      const attrSrc = path.join(pluginDir, 'swift', 'RestTimerAttributes.swift');
      const attrDest = path.join(destDir, 'RestTimerAttributes.swift');
      if (fs.existsSync(attrSrc)) {
        fs.copyFileSync(attrSrc, attrDest);
      }

      // Create Widget Extension directory
      const widgetDir = path.join(platformProjectRoot, 'RestTimerWidget');
      if (!fs.existsSync(widgetDir)) {
        fs.mkdirSync(widgetDir, { recursive: true });
      }

      // Copy widget Swift files
      const widgetFiles = [
        'RestTimerAttributes.swift',
        'RestTimerWidgetBundle.swift',
        'RestTimerWidgetLiveActivity.swift',
      ];
      for (const file of widgetFiles) {
        const src = path.join(pluginDir, 'swift', file);
        const dest = path.join(widgetDir, file);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, dest);
        }
      }

      // Create widget Info.plist
      const widgetInfoPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>$(DEVELOPMENT_LANGUAGE)</string>
  <key>CFBundleDisplayName</key>
  <string>Rest Timer</string>
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
</plist>`;
      fs.writeFileSync(path.join(widgetDir, 'Info.plist'), widgetInfoPlist);

      // Create widget entitlements
      const widgetEntitlements = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.application-groups</key>
  <array>
    <string>group.${bundleId}</string>
  </array>
</dict>
</plist>`;
      fs.writeFileSync(path.join(widgetDir, 'RestTimerWidgetExtension.entitlements'), widgetEntitlements);

      return config;
    },
  ]);
};

// Add widget extension target to Xcode project
const withWidgetExtensionTarget = (config) => {
  return withXcodeProject(config, (config) => {
    const project = config.modResults;
    const projectName = config.modRequest.projectName;
    const bundleId = config.ios?.bundleIdentifier || 'com.app.identifier';
    const widgetBundleId = `${bundleId}.RestTimerWidget`;

    // Add source files to main app target
    const mainTarget = project.getFirstTarget();
    const mainGroupKey = project.getFirstProject().firstProject.mainGroup;

    const mainAppFiles = [
      'LiveActivityModule.swift',
      'LiveActivityModule.m',
      'RestTimerAttributes.swift',
    ];

    for (const file of mainAppFiles) {
      const filePath = `${projectName}/${file}`;
      if (!project.hasFile(filePath)) {
        project.addSourceFile(filePath, { target: mainTarget.uuid }, mainGroupKey);
      }
    }

    // Check if widget target already exists
    const existingTargets = project.pbxNativeTargetSection();
    let widgetTargetExists = false;
    for (const key in existingTargets) {
      if (existingTargets[key].name === 'RestTimerWidgetExtension') {
        widgetTargetExists = true;
        break;
      }
    }

    if (!widgetTargetExists) {
      // Create widget extension target
      const widgetTarget = project.addTarget(
        'RestTimerWidgetExtension',
        'app_extension',
        'RestTimerWidget',
        widgetBundleId
      );

      if (widgetTarget) {
        const widgetTargetUuid = widgetTarget.uuid;

        // Create a group for widget files
        const widgetGroup = project.addPbxGroup(
          [
            'RestTimerAttributes.swift',
            'RestTimerWidgetBundle.swift',
            'RestTimerWidgetLiveActivity.swift',
            'Info.plist',
          ],
          'RestTimerWidget',
          'RestTimerWidget'
        );

        // Add widget group to main project
        project.addToPbxGroup(widgetGroup.uuid, mainGroupKey);

        // Add Swift files to widget target
        const widgetSwiftFiles = [
          'RestTimerWidget/RestTimerAttributes.swift',
          'RestTimerWidget/RestTimerWidgetBundle.swift',
          'RestTimerWidget/RestTimerWidgetLiveActivity.swift',
        ];

        for (const file of widgetSwiftFiles) {
          project.addSourceFile(file, { target: widgetTargetUuid }, widgetGroup.uuid);
        }

        // Configure build settings for widget target
        const configurations = project.pbxXCBuildConfigurationSection();
        for (const key in configurations) {
          const config = configurations[key];
          if (config.buildSettings && config.baseConfigurationReference === undefined) {
            // Check if this configuration belongs to widget target
            const targetName = config.buildSettings.PRODUCT_NAME;
            if (targetName === '"$(TARGET_NAME)"' || targetName === 'RestTimerWidgetExtension') {
              config.buildSettings.ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME = 'AccentColor';
              config.buildSettings.ASSETCATALOG_COMPILER_WIDGET_BACKGROUND_COLOR_NAME = 'WidgetBackground';
              config.buildSettings.CODE_SIGN_ENTITLEMENTS = 'RestTimerWidget/RestTimerWidgetExtension.entitlements';
              config.buildSettings.CODE_SIGN_STYLE = 'Automatic';
              config.buildSettings.CURRENT_PROJECT_VERSION = '1';
              config.buildSettings.GENERATE_INFOPLIST_FILE = 'YES';
              config.buildSettings.INFOPLIST_FILE = 'RestTimerWidget/Info.plist';
              config.buildSettings.INFOPLIST_KEY_CFBundleDisplayName = 'Rest Timer';
              config.buildSettings.INFOPLIST_KEY_NSHumanReadableCopyright = '""';
              config.buildSettings.IPHONEOS_DEPLOYMENT_TARGET = '16.2';
              config.buildSettings.LD_RUNPATH_SEARCH_PATHS = '"$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks"';
              config.buildSettings.MARKETING_VERSION = '1.0';
              config.buildSettings.PRODUCT_BUNDLE_IDENTIFIER = widgetBundleId;
              config.buildSettings.PRODUCT_NAME = '"$(TARGET_NAME)"';
              config.buildSettings.SKIP_INSTALL = 'YES';
              config.buildSettings.SWIFT_EMIT_LOC_STRINGS = 'YES';
              config.buildSettings.SWIFT_VERSION = '5.0';
              config.buildSettings.TARGETED_DEVICE_FAMILY = '"1,2"';
            }
          }
        }

        // Add embed extension build phase to main target
        const embedPhase = project.addBuildPhase(
          ['RestTimerWidgetExtension.appex'],
          'PBXCopyFilesBuildPhase',
          'Embed Foundation Extensions',
          mainTarget.uuid,
          'app_extension'
        );

        if (embedPhase) {
          // Set destination to PlugIns folder (13)
          embedPhase.buildPhase.dstSubfolderSpec = 13;
        }
      }
    }

    return config;
  });
};

// Main plugin
const withLiveActivities = (config) => {
  config = withLiveActivityEntitlements(config);
  config = withLiveActivityInfoPlist(config);
  config = withLiveActivityFiles(config);
  config = withWidgetExtensionTarget(config);
  return config;
};

module.exports = withLiveActivities;
