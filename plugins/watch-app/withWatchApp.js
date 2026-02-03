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

      // Copy iOS bridge file to main app (pure Obj-C, no Swift bridging header needed)
      const bridgeSrc = path.join(pluginDir, 'ios-bridge', 'WatchConnectivityBridge.m');
      const bridgeDest = path.join(mainAppDir, 'WatchConnectivityBridge.m');
      if (fs.existsSync(bridgeSrc)) {
        fs.copyFileSync(bridgeSrc, bridgeDest);
        console.log(`[Watch Plugin] Copied bridge file: ${bridgeDest}`);
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

      // Create Watch App Info.plist (modern watchOS app with required App Store keys)
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
  <key>CFBundleIconName</key>
  <string>AppIcon</string>
  <key>CFBundleName</key>
  <string>$(PRODUCT_NAME)</string>
  <key>CFBundlePackageType</key>
  <string>$(PRODUCT_BUNDLE_PACKAGE_TYPE)</string>
  <key>CFBundleShortVersionString</key>
  <string>$(MARKETING_VERSION)</string>
  <key>CFBundleVersion</key>
  <string>$(CURRENT_PROJECT_VERSION)</string>
  <key>MinimumOSVersion</key>
  <string>10.0</string>
  <key>WKCompanionAppBundleIdentifier</key>
  <string>${bundleId}</string>
  <key>WKWatchOnly</key>
  <false/>
</dict>
</plist>`;
      fs.writeFileSync(path.join(watchAppDir, 'Info.plist'), watchInfoPlist);

      // Create Assets.xcassets with AppIcon for App Store validation
      const zlib = require('zlib');

      // Function to generate a minimal valid PNG with solid color
      function createSolidPNG(width, height, r, g, b) {
        // Raw pixel data (RGBA) with filter bytes
        const rawData = Buffer.alloc((width * 4 + 1) * height);
        for (let y = 0; y < height; y++) {
          rawData[y * (width * 4 + 1)] = 0; // filter byte (none)
          for (let x = 0; x < width; x++) {
            const offset = y * (width * 4 + 1) + 1 + x * 4;
            rawData[offset] = r;
            rawData[offset + 1] = g;
            rawData[offset + 2] = b;
            rawData[offset + 3] = 255; // alpha
          }
        }

        const compressed = zlib.deflateSync(rawData);

        // PNG signature
        const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

        // CRC32 calculation
        function crc32(data) {
          let crc = 0xffffffff;
          const table = [];
          for (let i = 0; i < 256; i++) {
            let c = i;
            for (let j = 0; j < 8; j++) {
              c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
            }
            table[i] = c;
          }
          for (let i = 0; i < data.length; i++) {
            crc = table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
          }
          return (crc ^ 0xffffffff) >>> 0;
        }

        function createChunk(type, data) {
          const length = Buffer.alloc(4);
          length.writeUInt32BE(data.length);
          const typeBuffer = Buffer.from(type);
          const crcData = Buffer.concat([typeBuffer, data]);
          const crc = crc32(crcData);
          const crcBuffer = Buffer.alloc(4);
          crcBuffer.writeUInt32BE(crc);
          return Buffer.concat([length, typeBuffer, data, crcBuffer]);
        }

        // IHDR chunk
        const ihdr = Buffer.alloc(13);
        ihdr.writeUInt32BE(width, 0);
        ihdr.writeUInt32BE(height, 4);
        ihdr[8] = 8;  // bit depth
        ihdr[9] = 6;  // color type (RGBA)
        ihdr[10] = 0; // compression
        ihdr[11] = 0; // filter
        ihdr[12] = 0; // interlace

        const ihdrChunk = createChunk('IHDR', ihdr);
        const idatChunk = createChunk('IDAT', compressed);
        const iendChunk = createChunk('IEND', Buffer.alloc(0));

        return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
      }

      // Create Assets.xcassets directory structure
      const assetsDir = path.join(watchAppDir, 'Assets.xcassets');
      const appIconDir = path.join(assetsDir, 'AppIcon.appiconset');
      fs.mkdirSync(appIconDir, { recursive: true });

      // Create Contents.json for asset catalog root
      fs.writeFileSync(path.join(assetsDir, 'Contents.json'), JSON.stringify({
        "info": { "version": 1, "author": "xcode" }
      }, null, 2));

      // Create AppIcon Contents.json with a single 1024x1024 universal entry
      fs.writeFileSync(path.join(appIconDir, 'Contents.json'), JSON.stringify({
        "images": [
          {
            "filename": "icon.png",
            "idiom": "universal",
            "platform": "watchos",
            "size": "1024x1024"
          }
        ],
        "info": { "version": 1, "author": "xcode" }
      }, null, 2));

      // Generate 1024x1024 gold (#FFC52F) icon
      const iconData = createSolidPNG(1024, 1024, 255, 197, 47);
      fs.writeFileSync(path.join(appIconDir, 'icon.png'), iconData);
      console.log(`[Watch Plugin] Created Watch app icon: ${path.join(appIconDir, 'icon.png')}`);

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

    // Add iOS bridge source file to main app target (pure Obj-C, no bridging header needed)
    const mainTarget = project.getFirstTarget();
    const mainGroupKey = project.getFirstProject().firstProject.mainGroup;

    const bridgeFilePath = `${projectName}/WatchConnectivityBridge.m`;
    if (!project.hasFile(bridgeFilePath)) {
      project.addSourceFile(bridgeFilePath, { target: mainTarget.uuid }, mainGroupKey);
      console.log(`[Watch Plugin] Added bridge file to main target: ${bridgeFilePath}`);
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
    // Note: name might be stored with or without quotes depending on serialization
    const existingTargets = project.pbxNativeTargetSection();
    let watchTargetExists = false;
    let existingWatchTargetUuid = null;

    for (const key in existingTargets) {
      if (key.endsWith('_comment')) continue;
      const targetName = existingTargets[key].name;
      // Check both quoted and unquoted versions
      if (targetName === WATCH_TARGET_NAME ||
          targetName === `"${WATCH_TARGET_NAME}"` ||
          targetName === `'${WATCH_TARGET_NAME}'`) {
        watchTargetExists = true;
        existingWatchTargetUuid = key;
        console.log(`[Watch Plugin] Found existing Watch target: ${key}`);
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

      // Create file references for Swift files
      watchSwiftFiles.forEach(file => {
        fileRefUuids[file] = generateUuid();
        buildFileUuids[file] = generateUuid();
      });

      // Create file references for Info.plist and Assets.xcassets
      fileRefUuids['Info.plist'] = generateUuid();
      fileRefUuids['Assets.xcassets'] = generateUuid();
      buildFileUuids['Assets.xcassets'] = generateUuid();

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

      // Add Info.plist file reference with unique name to avoid conflicts with other targets
      // Using full path in comment to distinguish from LiveActivity's Info.plist
      pbxFileReference[fileRefUuids['Info.plist']] = {
        isa: 'PBXFileReference',
        lastKnownFileType: 'text.plist.xml',
        path: 'Info.plist',
        sourceTree: '"<group>"',
      };
      pbxFileReference[`${fileRefUuids['Info.plist']}_comment`] = `${WATCH_TARGET_NAME}-Info.plist`;

      // Add Assets.xcassets file reference
      pbxFileReference[fileRefUuids['Assets.xcassets']] = {
        isa: 'PBXFileReference',
        lastKnownFileType: 'folder.assetcatalog',
        path: 'Assets.xcassets',
        sourceTree: '"<group>"',
      };
      pbxFileReference[`${fileRefUuids['Assets.xcassets']}_comment`] = 'Assets.xcassets';

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

      // Add PBXBuildFile for Assets.xcassets (Resources)
      pbxBuildFile[buildFileUuids['Assets.xcassets']] = {
        isa: 'PBXBuildFile',
        fileRef: fileRefUuids['Assets.xcassets'],
        fileRef_comment: 'Assets.xcassets',
      };
      pbxBuildFile[`${buildFileUuids['Assets.xcassets']}_comment`] = 'Assets.xcassets in Resources';

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
        // Create an array of { uuid, name } for all files to include proper comments
        // Note: Assets.xcassets name must match its path to satisfy Xcodeproj consistency checks
        const allFilesWithNames = [
          ...watchSwiftFiles.map(f => ({ uuid: fileRefUuids[f], name: f })),
          { uuid: fileRefUuids['Info.plist'], name: `${WATCH_TARGET_NAME}-Info.plist` },
          { uuid: fileRefUuids['Assets.xcassets'], name: 'Assets.xcassets' },
        ];

        // Add group to PBXGroup section
        const pbxGroupSection = project.hash.project.objects['PBXGroup'];
        pbxGroupSection[watchGroupUuid] = {
          isa: 'PBXGroup',
          children: allFilesWithNames.map(f => ({ value: f.uuid, comment: f.name })),
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

      // Create Resources build phase with Assets.xcassets
      const pbxResourcesBuildPhase = project.hash.project.objects['PBXResourcesBuildPhase'] || {};
      project.hash.project.objects['PBXResourcesBuildPhase'] = pbxResourcesBuildPhase;
      pbxResourcesBuildPhase[watchResourcesBuildPhaseUuid] = {
        isa: 'PBXResourcesBuildPhase',
        buildActionMask: 2147483647,
        files: [
          { value: buildFileUuids['Assets.xcassets'], comment: 'Assets.xcassets in Resources' },
        ],
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
      // App Store requires both arm64 and arm64_32 for watchOS - use $(ARCHS_STANDARD)
      // Modern watchOS app type (not legacy WatchKit)
      const watchBuildSettings = {
        ARCHS: '"$(ARCHS_STANDARD)"',
        ASSETCATALOG_COMPILER_APPICON_NAME: 'AppIcon',
        CODE_SIGN_STYLE: 'Automatic',
        CURRENT_PROJECT_VERSION: 1,
        DEVELOPMENT_TEAM: DEVELOPMENT_TEAM,
        GENERATE_INFOPLIST_FILE: 'YES',
        INFOPLIST_FILE: `${WATCH_TARGET_NAME}/Info.plist`,
        INFOPLIST_KEY_CFBundleDisplayName: '"Workout Tracker"',
        INFOPLIST_KEY_UISupportedInterfaceOrientations: '"UIInterfaceOrientationPortrait UIInterfaceOrientationPortraitUpsideDown"',
        LD_RUNPATH_SEARCH_PATHS: '"$(inherited) @executable_path/Frameworks"',
        MARKETING_VERSION: '1.0',
        ONLY_ACTIVE_ARCH: 'NO',
        PRODUCT_BUNDLE_IDENTIFIER: watchBundleId,
        PRODUCT_NAME: `"$(TARGET_NAME)"`,
        SDKROOT: 'watchos',
        SKIP_INSTALL: 'YES',
        SWIFT_EMIT_LOC_STRINGS: 'YES',
        SWIFT_VERSION: '5.0',
        TARGETED_DEVICE_FAMILY: 4,
        WATCHOS_DEPLOYMENT_TARGET: '10.0',
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
        productType: '"com.apple.product-type.application"',
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

      // Create Embed Watch Content build phase for main target (if not already present)
      const pbxCopyFilesBuildPhase = project.hash.project.objects['PBXCopyFilesBuildPhase'] || {};
      project.hash.project.objects['PBXCopyFilesBuildPhase'] = pbxCopyFilesBuildPhase;

      // Check if Embed Watch Content phase already exists
      let existingEmbedPhaseUuid = null;
      for (const key in pbxCopyFilesBuildPhase) {
        if (key.endsWith('_comment')) continue;
        const phase = pbxCopyFilesBuildPhase[key];
        if (phase.name === '"Embed Watch Content"') {
          existingEmbedPhaseUuid = key;
          break;
        }
      }

      const embedPhaseUuid = existingEmbedPhaseUuid || generateUuid();

      if (!existingEmbedPhaseUuid) {
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
      const mainTargetUuidForDep = mainTarget.uuid;
      if (pbxNativeTarget[mainTargetUuidForDep]) {
        if (!pbxNativeTarget[mainTargetUuidForDep].dependencies) {
          pbxNativeTarget[mainTargetUuidForDep].dependencies = [];
        }
        pbxNativeTarget[mainTargetUuidForDep].dependencies.push({
          value: dependencyUuid,
          comment: 'PBXTargetDependency',
        });
      }
    }

    // ============== DEDUPLICATION CLEANUP ==============
    // Clean up any duplicate entries that might cause "Multiple commands produce" errors

    const pbxNativeTargetSection = project.hash.project.objects['PBXNativeTarget'];
    const pbxSourcesBuildPhaseSection = project.hash.project.objects['PBXSourcesBuildPhase'] || {};
    const pbxResourcesBuildPhaseSection = project.hash.project.objects['PBXResourcesBuildPhase'] || {};
    const pbxFrameworksBuildPhaseSection = project.hash.project.objects['PBXFrameworksBuildPhase'] || {};
    const pbxCopyFilesBuildPhaseSection = project.hash.project.objects['PBXCopyFilesBuildPhase'] || {};
    const pbxProjectSection = project.hash.project.objects['PBXProject'];

    // Find the Watch target UUID (check both quoted and unquoted names)
    let watchTargetUuidFound = null;
    const allWatchTargetUuids = [];
    for (const key in pbxNativeTargetSection) {
      if (key.endsWith('_comment')) continue;
      const targetName = pbxNativeTargetSection[key].name;
      if (targetName === WATCH_TARGET_NAME ||
          targetName === `"${WATCH_TARGET_NAME}"` ||
          targetName === `'${WATCH_TARGET_NAME}'`) {
        allWatchTargetUuids.push(key);
        if (!watchTargetUuidFound) watchTargetUuidFound = key;
      }
    }

    // Remove duplicate Watch targets (keep only the first one)
    if (allWatchTargetUuids.length > 1) {
      console.log(`[Watch Plugin] WARNING: Found ${allWatchTargetUuids.length} Watch targets, removing duplicates`);
      for (let i = 1; i < allWatchTargetUuids.length; i++) {
        delete pbxNativeTargetSection[allWatchTargetUuids[i]];
        delete pbxNativeTargetSection[`${allWatchTargetUuids[i]}_comment`];
      }
    }

    if (watchTargetUuidFound) {
      const watchTarget = pbxNativeTargetSection[watchTargetUuidFound];

      // Deduplicate Watch target build phases BY TYPE (not UUID)
      // Only keep ONE Sources phase, ONE Frameworks phase, ONE Resources phase
      if (watchTarget.buildPhases && Array.isArray(watchTarget.buildPhases)) {
        const seenTypes = new Set();
        watchTarget.buildPhases = watchTarget.buildPhases.filter(phase => {
          const type = phase.comment; // "Sources", "Frameworks", "Resources"
          if (!type) return true; // keep phases without comments
          if (seenTypes.has(type)) {
            console.log(`[Watch Plugin] Removing duplicate ${type} phase: ${phase.value}`);
            return false;
          }
          seenTypes.add(type);
          return true;
        });
      }

      // Debug: dump final build phases
      console.log(`[Watch Plugin] Final Watch buildPhases:`);
      if (watchTarget.buildPhases) {
        watchTarget.buildPhases.forEach((p, i) => {
          console.log(`[Watch Plugin]   ${i}: ${p.comment} (${p.value})`);
        });
      }

      // For each build phase referenced by Watch target, deduplicate files
      if (watchTarget.buildPhases) {
        watchTarget.buildPhases.forEach(phaseRef => {
          const phaseUuid = phaseRef.value;

          // Deduplicate Sources
          if (pbxSourcesBuildPhaseSection[phaseUuid] && pbxSourcesBuildPhaseSection[phaseUuid].files) {
            const seen = new Set();
            pbxSourcesBuildPhaseSection[phaseUuid].files = pbxSourcesBuildPhaseSection[phaseUuid].files.filter(f => {
              const key = f.value;
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            });
          }

          // Deduplicate Resources
          if (pbxResourcesBuildPhaseSection[phaseUuid] && pbxResourcesBuildPhaseSection[phaseUuid].files) {
            const seen = new Set();
            pbxResourcesBuildPhaseSection[phaseUuid].files = pbxResourcesBuildPhaseSection[phaseUuid].files.filter(f => {
              const key = f.value;
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            });
          }

          // Deduplicate Frameworks
          if (pbxFrameworksBuildPhaseSection[phaseUuid] && pbxFrameworksBuildPhaseSection[phaseUuid].files) {
            const seen = new Set();
            pbxFrameworksBuildPhaseSection[phaseUuid].files = pbxFrameworksBuildPhaseSection[phaseUuid].files.filter(f => {
              const key = f.value;
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            });
          }
        });
      }
    }

    // Deduplicate Watch target entries in project targets array
    for (const key in pbxProjectSection) {
      if (key.endsWith('_comment')) continue;
      if (pbxProjectSection[key].targets && Array.isArray(pbxProjectSection[key].targets)) {
        const seen = new Set();
        pbxProjectSection[key].targets = pbxProjectSection[key].targets.filter(t => {
          const targetKey = t.value;
          if (seen.has(targetKey)) return false;
          seen.add(targetKey);
          return true;
        });
      }
    }

    // Deduplicate Embed Watch Content phases on main target and their files
    const mainTargetUuidCleanup = mainTarget.uuid;
    if (pbxNativeTargetSection[mainTargetUuidCleanup]) {
      const mainTargetObj = pbxNativeTargetSection[mainTargetUuidCleanup];

      // Deduplicate build phases on main target
      if (mainTargetObj.buildPhases && Array.isArray(mainTargetObj.buildPhases)) {
        const seenPhases = new Set();
        const seenEmbedWatch = [];

        mainTargetObj.buildPhases = mainTargetObj.buildPhases.filter(phase => {
          const key = phase.value;
          // Track Embed Watch Content phases
          if (phase.comment === 'Embed Watch Content') {
            seenEmbedWatch.push(key);
            if (seenEmbedWatch.length > 1) return false; // Remove duplicate embed phases
          }
          if (seenPhases.has(key)) return false;
          seenPhases.add(key);
          return true;
        });
      }

      // Deduplicate dependencies on main target
      if (mainTargetObj.dependencies && Array.isArray(mainTargetObj.dependencies)) {
        const seen = new Set();
        mainTargetObj.dependencies = mainTargetObj.dependencies.filter(dep => {
          const key = dep.value;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      }
    }

    // Deduplicate files in all Embed Watch Content / Copy Files phases
    for (const key in pbxCopyFilesBuildPhaseSection) {
      if (key.endsWith('_comment')) continue;
      const phase = pbxCopyFilesBuildPhaseSection[key];
      if (phase.files && Array.isArray(phase.files)) {
        const seen = new Set();
        phase.files = phase.files.filter(f => {
          const fileKey = f.value;
          if (seen.has(fileKey)) return false;
          seen.add(fileKey);
          return true;
        });
      }
    }

    // ============== VERIFICATION ==============
    // Count Watch targets to ensure no duplicates
    const finalTargets = project.hash.project.objects['PBXNativeTarget'];
    const watchTargetCount = Object.keys(finalTargets).filter(key => {
      if (key.endsWith('_comment')) return false;
      const name = finalTargets[key].name;
      return name === WATCH_TARGET_NAME ||
             name === `"${WATCH_TARGET_NAME}"` ||
             name === `'${WATCH_TARGET_NAME}'`;
    }).length;
    console.log(`[Watch Plugin] Final Watch target count: ${watchTargetCount}`);
    if (watchTargetCount > 1) {
      console.error(`[Watch Plugin] ERROR: ${watchTargetCount} Watch targets found - this will cause build errors!`);
    }

    // Verify Watch target compile sources don't include iOS bridge file
    if (watchTargetUuidFound && finalTargets[watchTargetUuidFound]) {
      const watchTarget = finalTargets[watchTargetUuidFound];
      if (watchTarget.buildPhases) {
        const sourcesPhase = watchTarget.buildPhases.find(p => p.comment === 'Sources');
        if (sourcesPhase) {
          const sourcesPhaseObj = pbxSourcesBuildPhaseSection[sourcesPhase.value];
          if (sourcesPhaseObj && sourcesPhaseObj.files) {
            console.log(`[Watch Plugin] Watch compile sources:`);
            sourcesPhaseObj.files.forEach(f => {
              console.log(`[Watch Plugin]   - ${f.comment}`);
              // Warn if bridge file is found in Watch target
              if (f.comment && f.comment.includes('WatchConnectivityBridge')) {
                console.error(`[Watch Plugin] ERROR: iOS bridge file found in Watch target: ${f.comment}`);
              }
            });
          }
        }
      }
    }

    // Also verify main target compile sources include the bridge file
    const mainTargetForVerify = finalTargets[mainTarget.uuid];
    if (mainTargetForVerify && mainTargetForVerify.buildPhases) {
      const mainSourcesPhase = mainTargetForVerify.buildPhases.find(p => p.comment === 'Sources');
      if (mainSourcesPhase) {
        const mainSourcesObj = pbxSourcesBuildPhaseSection[mainSourcesPhase.value];
        if (mainSourcesObj && mainSourcesObj.files) {
          const bridgeFile = mainSourcesObj.files.find(f =>
            f.comment && f.comment.includes('WatchConnectivityBridge')
          );
          if (bridgeFile) {
            console.log(`[Watch Plugin] Main target bridge file: ${bridgeFile.comment}`);
          } else {
            console.error(`[Watch Plugin] WARNING: Bridge file not found in main target compile sources`);
          }
        }
      }
    }

    // Verify Watch target has exactly one Sources phase
    if (watchTargetUuidFound && finalTargets[watchTargetUuidFound]) {
      const watchTarget = finalTargets[watchTargetUuidFound];
      if (watchTarget.buildPhases) {
        const sourcePhases = watchTarget.buildPhases.filter(p =>
          p.comment && p.comment.includes('Sources')
        );
        console.log(`[Watch Plugin] Watch target Sources phases: ${sourcePhases.length}`);
        if (sourcePhases.length > 1) {
          console.error(`[Watch Plugin] ERROR: ${sourcePhases.length} Sources phases found - this will cause build errors!`);
        }
      }
    }

    // Count Embed Watch Content phases on main target
    const mainTargetFinal = finalTargets[mainTarget.uuid];
    if (mainTargetFinal && mainTargetFinal.buildPhases) {
      const embedPhases = mainTargetFinal.buildPhases.filter(p =>
        p.comment && p.comment.includes('Embed Watch')
      );
      console.log(`[Watch Plugin] Main target Embed Watch phases: ${embedPhases.length}`);
      if (embedPhases.length > 1) {
        console.error(`[Watch Plugin] ERROR: ${embedPhases.length} Embed Watch phases found - this will cause build errors!`);
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
