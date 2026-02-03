const {
  withXcodeProject,
  withEntitlementsPlist,
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

// Helper to generate a unique UUID for pbxproj
function generateUuid() {
  return [...Array(24)]
    .map(() => Math.floor(Math.random() * 16).toString(16).toUpperCase())
    .join('');
}

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

    // Check if watch target already exists
    const existingTargets = project.pbxNativeTargetSection();
    let watchTargetExists = false;

    for (const key in existingTargets) {
      if (existingTargets[key].name === WATCH_TARGET_NAME) {
        watchTargetExists = true;
        break;
      }
    }

    if (!watchTargetExists) {
      // Generate UUIDs for all the new entries we'll create
      const watchGroupUuid = generateUuid();
      const watchTargetUuid = generateUuid();
      const watchProductUuid = generateUuid();
      const watchProductBuildFileUuid = generateUuid();
      const watchConfigListUuid = generateUuid();
      const watchDebugConfigUuid = generateUuid();
      const watchReleaseConfigUuid = generateUuid();
      const watchSourcesBuildPhaseUuid = generateUuid();
      const watchResourcesBuildPhaseUuid = generateUuid();
      const watchFrameworksBuildPhaseUuid = generateUuid();

      // File references and build files for Watch app
      const watchSwiftFiles = [
        'WorkoutTrackerWatchApp.swift',
        'ContentView.swift',
        'WorkoutActiveView.swift',
        'LogSetView.swift',
        'WatchViewModel.swift',
      ];

      const fileRefUuids = {};
      const buildFileUuids = {};
      const resourceBuildFileUuids = {};

      // Create file references for Swift files
      watchSwiftFiles.forEach(file => {
        fileRefUuids[file] = generateUuid();
        buildFileUuids[file] = generateUuid();
      });

      // Create file references for resources
      fileRefUuids['Assets.xcassets'] = generateUuid();
      resourceBuildFileUuids['Assets.xcassets'] = generateUuid();
      fileRefUuids['Info.plist'] = generateUuid();

      // Add PBXFileReference entries for Swift files and resources
      const pbxFileReference = project.pbxFileReferenceSection();
      watchSwiftFiles.forEach(file => {
        pbxFileReference[fileRefUuids[file]] = {
          isa: 'PBXFileReference',
          lastKnownFileType: 'sourcecode.swift',
          path: file,
          sourceTree: '"<group>"',
        };
        pbxFileReference[`${fileRefUuids[file]}_comment`] = file;
      });

      // Add Assets.xcassets file reference
      pbxFileReference[fileRefUuids['Assets.xcassets']] = {
        isa: 'PBXFileReference',
        lastKnownFileType: 'folder.assetcatalog',
        path: 'Assets.xcassets',
        sourceTree: '"<group>"',
      };
      pbxFileReference[`${fileRefUuids['Assets.xcassets']}_comment`] = 'Assets.xcassets';

      // Add Info.plist file reference
      pbxFileReference[fileRefUuids['Info.plist']] = {
        isa: 'PBXFileReference',
        lastKnownFileType: 'text.plist.xml',
        path: 'Info.plist',
        sourceTree: '"<group>"',
      };
      pbxFileReference[`${fileRefUuids['Info.plist']}_comment`] = 'Info.plist';

      // Add Watch app product reference
      pbxFileReference[watchProductUuid] = {
        isa: 'PBXFileReference',
        explicitFileType: '"wrapper.application"',
        includeInIndex: 0,
        path: `${WATCH_TARGET_NAME}.app`,
        sourceTree: 'BUILT_PRODUCTS_DIR',
      };
      pbxFileReference[`${watchProductUuid}_comment`] = `${WATCH_TARGET_NAME}.app`;

      // Add PBXBuildFile entries for Swift files (Sources)
      const pbxBuildFile = project.pbxBuildFileSection();
      watchSwiftFiles.forEach(file => {
        pbxBuildFile[buildFileUuids[file]] = {
          isa: 'PBXBuildFile',
          fileRef: fileRefUuids[file],
          fileRef_comment: file,
        };
        pbxBuildFile[`${buildFileUuids[file]}_comment`] = `${file} in Sources`;
      });

      // Add PBXBuildFile entry for Assets.xcassets (Resources)
      pbxBuildFile[resourceBuildFileUuids['Assets.xcassets']] = {
        isa: 'PBXBuildFile',
        fileRef: fileRefUuids['Assets.xcassets'],
        fileRef_comment: 'Assets.xcassets',
      };
      pbxBuildFile[`${resourceBuildFileUuids['Assets.xcassets']}_comment`] = 'Assets.xcassets in Resources';

      // Add PBXBuildFile for Watch product in main app's embed phase
      pbxBuildFile[watchProductBuildFileUuid] = {
        isa: 'PBXBuildFile',
        fileRef: watchProductUuid,
        fileRef_comment: `${WATCH_TARGET_NAME}.app`,
        settings: { ATTRIBUTES: ['RemoveHeadersOnCopy'] },
      };
      pbxBuildFile[`${watchProductBuildFileUuid}_comment`] = `${WATCH_TARGET_NAME}.app in Embed Watch Content`;

      // Create PBXGroup for Watch app
      const pbxGroup = project.pbxGroupByName(WATCH_TARGET_NAME);
      if (!pbxGroup) {
        const allFileRefs = [
          ...watchSwiftFiles.map(f => fileRefUuids[f]),
          fileRefUuids['Assets.xcassets'],
          fileRefUuids['Info.plist'],
        ];

        // Add group to PBXGroup section
        const pbxGroupSection = project.hash.project.objects['PBXGroup'];
        pbxGroupSection[watchGroupUuid] = {
          isa: 'PBXGroup',
          children: allFileRefs.map(uuid => ({ value: uuid, comment: null })),
          path: WATCH_TARGET_NAME,
          sourceTree: '"<group>"',
        };
        pbxGroupSection[`${watchGroupUuid}_comment`] = WATCH_TARGET_NAME;

        // Add Watch group to main group
        const mainGroup = pbxGroupSection[mainGroupKey];
        if (mainGroup && mainGroup.children) {
          mainGroup.children.push({ value: watchGroupUuid, comment: WATCH_TARGET_NAME });
        }
      }

      // Add Watch product to Products group
      const productsGroupKey = project.pbxGroupByName('Products');
      if (productsGroupKey) {
        const pbxGroupSection = project.hash.project.objects['PBXGroup'];
        for (const key in pbxGroupSection) {
          if (pbxGroupSection[key].name === 'Products' || pbxGroupSection[`${key}_comment`] === 'Products') {
            if (pbxGroupSection[key].children) {
              pbxGroupSection[key].children.push({ value: watchProductUuid, comment: `${WATCH_TARGET_NAME}.app` });
            }
            break;
          }
        }
      }

      // Create Sources build phase
      const pbxSourcesBuildPhase = project.hash.project.objects['PBXSourcesBuildPhase'] || {};
      project.hash.project.objects['PBXSourcesBuildPhase'] = pbxSourcesBuildPhase;
      pbxSourcesBuildPhase[watchSourcesBuildPhaseUuid] = {
        isa: 'PBXSourcesBuildPhase',
        buildActionMask: 2147483647,
        files: watchSwiftFiles.map(f => ({ value: buildFileUuids[f], comment: `${f} in Sources` })),
        runOnlyForDeploymentPostprocessing: 0,
      };
      pbxSourcesBuildPhase[`${watchSourcesBuildPhaseUuid}_comment`] = 'Sources';

      // Create Resources build phase
      const pbxResourcesBuildPhase = project.hash.project.objects['PBXResourcesBuildPhase'] || {};
      project.hash.project.objects['PBXResourcesBuildPhase'] = pbxResourcesBuildPhase;
      pbxResourcesBuildPhase[watchResourcesBuildPhaseUuid] = {
        isa: 'PBXResourcesBuildPhase',
        buildActionMask: 2147483647,
        files: [{ value: resourceBuildFileUuids['Assets.xcassets'], comment: 'Assets.xcassets in Resources' }],
        runOnlyForDeploymentPostprocessing: 0,
      };
      pbxResourcesBuildPhase[`${watchResourcesBuildPhaseUuid}_comment`] = 'Resources';

      // Create Frameworks build phase (empty for now)
      const pbxFrameworksBuildPhase = project.hash.project.objects['PBXFrameworksBuildPhase'] || {};
      project.hash.project.objects['PBXFrameworksBuildPhase'] = pbxFrameworksBuildPhase;
      pbxFrameworksBuildPhase[watchFrameworksBuildPhaseUuid] = {
        isa: 'PBXFrameworksBuildPhase',
        buildActionMask: 2147483647,
        files: [],
        runOnlyForDeploymentPostprocessing: 0,
      };
      pbxFrameworksBuildPhase[`${watchFrameworksBuildPhaseUuid}_comment`] = 'Frameworks';

      // Create build configurations for Watch target
      const watchBuildSettings = {
        ASSETCATALOG_COMPILER_APPICON_NAME: 'AppIcon',
        ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME: 'AccentColor',
        CODE_SIGN_STYLE: 'Automatic',
        CURRENT_PROJECT_VERSION: 1,
        DEVELOPMENT_TEAM: DEVELOPMENT_TEAM,
        GENERATE_INFOPLIST_FILE: 'YES',
        INFOPLIST_FILE: `${WATCH_TARGET_NAME}/Info.plist`,
        INFOPLIST_KEY_CFBundleDisplayName: '"Workout Tracker"',
        INFOPLIST_KEY_UISupportedInterfaceOrientations: '"UIInterfaceOrientationPortrait UIInterfaceOrientationPortraitUpsideDown"',
        INFOPLIST_KEY_WKCompanionAppBundleIdentifier: bundleId,
        INFOPLIST_KEY_WKRunsIndependentlyOfCompanionApp: 'NO',
        LD_RUNPATH_SEARCH_PATHS: '"$(inherited) @executable_path/Frameworks"',
        MARKETING_VERSION: '1.0',
        PRODUCT_BUNDLE_IDENTIFIER: watchBundleId,
        PRODUCT_NAME: `"$(TARGET_NAME)"`,
        SDKROOT: 'watchos',
        SKIP_INSTALL: 'YES',
        SWIFT_EMIT_LOC_STRINGS: 'YES',
        SWIFT_VERSION: '5.0',
        TARGETED_DEVICE_FAMILY: 4,
        WATCHOS_DEPLOYMENT_TARGET: '9.0',
      };

      const pbxXCBuildConfiguration = project.hash.project.objects['XCBuildConfiguration'];
      pbxXCBuildConfiguration[watchDebugConfigUuid] = {
        isa: 'XCBuildConfiguration',
        buildSettings: { ...watchBuildSettings, DEBUG_INFORMATION_FORMAT: '"dwarf-with-dsym"' },
        name: 'Debug',
      };
      pbxXCBuildConfiguration[`${watchDebugConfigUuid}_comment`] = 'Debug';

      pbxXCBuildConfiguration[watchReleaseConfigUuid] = {
        isa: 'XCBuildConfiguration',
        buildSettings: { ...watchBuildSettings, DEBUG_INFORMATION_FORMAT: '"dwarf-with-dsym"' },
        name: 'Release',
      };
      pbxXCBuildConfiguration[`${watchReleaseConfigUuid}_comment`] = 'Release';

      // Create XCConfigurationList for Watch target
      const pbxXCConfigurationList = project.hash.project.objects['XCConfigurationList'];
      pbxXCConfigurationList[watchConfigListUuid] = {
        isa: 'XCConfigurationList',
        buildConfigurations: [
          { value: watchDebugConfigUuid, comment: 'Debug' },
          { value: watchReleaseConfigUuid, comment: 'Release' },
        ],
        defaultConfigurationIsVisible: 0,
        defaultConfigurationName: 'Release',
      };
      pbxXCConfigurationList[`${watchConfigListUuid}_comment`] = `Build configuration list for PBXNativeTarget "${WATCH_TARGET_NAME}"`;

      // Create the Watch native target
      const pbxNativeTarget = project.hash.project.objects['PBXNativeTarget'];
      pbxNativeTarget[watchTargetUuid] = {
        isa: 'PBXNativeTarget',
        buildConfigurationList: watchConfigListUuid,
        buildConfigurationList_comment: `Build configuration list for PBXNativeTarget "${WATCH_TARGET_NAME}"`,
        buildPhases: [
          { value: watchSourcesBuildPhaseUuid, comment: 'Sources' },
          { value: watchFrameworksBuildPhaseUuid, comment: 'Frameworks' },
          { value: watchResourcesBuildPhaseUuid, comment: 'Resources' },
        ],
        buildRules: [],
        dependencies: [],
        name: WATCH_TARGET_NAME,
        productName: WATCH_TARGET_NAME,
        productReference: watchProductUuid,
        productReference_comment: `${WATCH_TARGET_NAME}.app`,
        productType: '"com.apple.product-type.application.watchapp2"',
      };
      pbxNativeTarget[`${watchTargetUuid}_comment`] = WATCH_TARGET_NAME;

      // Add Watch target to project's targets array
      const pbxProject = project.hash.project.objects['PBXProject'];
      for (const key in pbxProject) {
        if (pbxProject[key].targets) {
          pbxProject[key].targets.push({ value: watchTargetUuid, comment: WATCH_TARGET_NAME });
          break;
        }
      }

      // Create Embed Watch Content build phase for main target
      const embedPhaseUuid = generateUuid();
      const pbxCopyFilesBuildPhase = project.hash.project.objects['PBXCopyFilesBuildPhase'] || {};
      project.hash.project.objects['PBXCopyFilesBuildPhase'] = pbxCopyFilesBuildPhase;

      pbxCopyFilesBuildPhase[embedPhaseUuid] = {
        isa: 'PBXCopyFilesBuildPhase',
        buildActionMask: 2147483647,
        dstPath: '"$(CONTENTS_FOLDER_PATH)/Watch"',
        dstSubfolderSpec: 16,
        files: [{ value: watchProductBuildFileUuid, comment: `${WATCH_TARGET_NAME}.app in Embed Watch Content` }],
        name: '"Embed Watch Content"',
        runOnlyForDeploymentPostprocessing: 0,
      };
      pbxCopyFilesBuildPhase[`${embedPhaseUuid}_comment`] = 'Embed Watch Content';

      // Add embed phase to main target's build phases
      const mainTargetUuid = mainTarget.uuid;
      if (pbxNativeTarget[mainTargetUuid] && pbxNativeTarget[mainTargetUuid].buildPhases) {
        pbxNativeTarget[mainTargetUuid].buildPhases.push({
          value: embedPhaseUuid,
          comment: 'Embed Watch Content',
        });
      }

      // Add target dependency so Watch app is built when main app is built
      const dependencyUuid = generateUuid();
      const containerProxyUuid = generateUuid();

      // Get the project root UUID
      let projectRootUuid = null;
      for (const key in pbxProject) {
        if (pbxProject[key].isa === 'PBXProject') {
          projectRootUuid = key;
          break;
        }
      }

      // Create PBXContainerItemProxy
      const pbxContainerItemProxy = project.hash.project.objects['PBXContainerItemProxy'] || {};
      project.hash.project.objects['PBXContainerItemProxy'] = pbxContainerItemProxy;
      pbxContainerItemProxy[containerProxyUuid] = {
        isa: 'PBXContainerItemProxy',
        containerPortal: projectRootUuid,
        containerPortal_comment: 'Project object',
        proxyType: 1,
        remoteGlobalIDString: watchTargetUuid,
        remoteInfo: WATCH_TARGET_NAME,
      };
      pbxContainerItemProxy[`${containerProxyUuid}_comment`] = 'PBXContainerItemProxy';

      // Create PBXTargetDependency
      const pbxTargetDependency = project.hash.project.objects['PBXTargetDependency'] || {};
      project.hash.project.objects['PBXTargetDependency'] = pbxTargetDependency;
      pbxTargetDependency[dependencyUuid] = {
        isa: 'PBXTargetDependency',
        target: watchTargetUuid,
        target_comment: WATCH_TARGET_NAME,
        targetProxy: containerProxyUuid,
        targetProxy_comment: 'PBXContainerItemProxy',
      };
      pbxTargetDependency[`${dependencyUuid}_comment`] = 'PBXTargetDependency';

      // Add dependency to main target
      if (pbxNativeTarget[mainTargetUuid]) {
        if (!pbxNativeTarget[mainTargetUuid].dependencies) {
          pbxNativeTarget[mainTargetUuid].dependencies = [];
        }
        pbxNativeTarget[mainTargetUuid].dependencies.push({
          value: dependencyUuid,
          comment: 'PBXTargetDependency',
        });
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
