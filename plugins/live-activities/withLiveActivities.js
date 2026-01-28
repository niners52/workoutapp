const {
  withXcodeProject,
  withEntitlementsPlist,
  withInfoPlist,
  withDangerousMod,
  IOSConfig,
} = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Config plugin to add Live Activities support to an Expo project.
 *
 * This plugin:
 * 1. Adds required entitlements for Live Activities
 * 2. Adds NSSupportsLiveActivities to Info.plist
 * 3. Copies native module files for the React Native bridge
 *
 * Note: The Widget Extension target needs to be added manually in Xcode
 * after running `expo prebuild`. See the README for instructions.
 */

// Add entitlements
const withLiveActivityEntitlements = (config) => {
  return withEntitlementsPlist(config, (config) => {
    // Enable Live Activities push type
    config.modResults['com.apple.developer.push-type.liveactivity'] = true;

    // Add app groups for sharing data between app and widget
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

// Copy native module files to the iOS project
const withLiveActivityNativeModule = (config) => {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const platformProjectRoot = config.modRequest.platformProjectRoot;
      const projectName = config.modRequest.projectName;

      // Source directory for native module files
      const pluginDir = path.join(projectRoot, 'plugins', 'live-activities', 'native-module');

      // Destination directory (main app target)
      const destDir = path.join(platformProjectRoot, projectName);

      // Ensure destination directory exists
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      // Copy native module files
      const filesToCopy = ['LiveActivityModule.swift', 'LiveActivityModule.m'];

      for (const file of filesToCopy) {
        const sourcePath = path.join(pluginDir, file);
        const destPath = path.join(destDir, file);

        if (fs.existsSync(sourcePath)) {
          fs.copyFileSync(sourcePath, destPath);
          console.log(`Copied ${file} to ${destDir}`);
        } else {
          console.warn(`Warning: ${file} not found at ${sourcePath}`);
        }
      }

      // Copy the shared RestTimerAttributes.swift to the main app
      const attributesSource = path.join(
        projectRoot,
        'plugins',
        'live-activities',
        'swift',
        'RestTimerAttributes.swift'
      );
      const attributesDest = path.join(destDir, 'RestTimerAttributes.swift');

      if (fs.existsSync(attributesSource)) {
        fs.copyFileSync(attributesSource, attributesDest);
        console.log(`Copied RestTimerAttributes.swift to ${destDir}`);
      }

      // Create Widget Extension directory and copy widget files
      const widgetDir = path.join(platformProjectRoot, 'RestTimerWidget');
      if (!fs.existsSync(widgetDir)) {
        fs.mkdirSync(widgetDir, { recursive: true });
      }

      const widgetFiles = [
        'RestTimerAttributes.swift',
        'RestTimerWidgetBundle.swift',
        'RestTimerWidgetLiveActivity.swift',
      ];

      for (const file of widgetFiles) {
        const sourcePath = path.join(projectRoot, 'plugins', 'live-activities', 'swift', file);
        const destPath = path.join(widgetDir, file);

        if (fs.existsSync(sourcePath)) {
          fs.copyFileSync(sourcePath, destPath);
          console.log(`Copied ${file} to widget directory`);
        }
      }

      // Create Info.plist for widget extension
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

      // Create entitlements for widget
      const bundleId = config.ios?.bundleIdentifier || 'com.app.identifier';
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

// Add Swift files to Xcode project
const withLiveActivityXcodeProject = (config) => {
  return withXcodeProject(config, (config) => {
    const project = config.modResults;
    const projectName = config.modRequest.projectName;

    // Get the main target
    const mainTarget = project.getFirstTarget();
    if (!mainTarget) {
      console.warn('Could not find main target');
      return config;
    }

    // Find or create the main app group
    const mainGroupKey = project.getFirstProject().firstProject.mainGroup;

    // Add Swift files to the project
    const swiftFiles = [
      'LiveActivityModule.swift',
      'LiveActivityModule.m',
      'RestTimerAttributes.swift',
    ];

    for (const file of swiftFiles) {
      const filePath = `${projectName}/${file}`;

      // Check if file already exists in project
      const existingFile = project.getFile(filePath);
      if (!existingFile) {
        project.addSourceFile(filePath, { target: mainTarget.uuid }, mainGroupKey);
        console.log(`Added ${file} to Xcode project`);
      }
    }

    return config;
  });
};

// Main plugin function
const withLiveActivities = (config) => {
  config = withLiveActivityEntitlements(config);
  config = withLiveActivityInfoPlist(config);
  config = withLiveActivityNativeModule(config);
  config = withLiveActivityXcodeProject(config);

  return config;
};

module.exports = withLiveActivities;
