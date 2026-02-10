import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  SectionList,
  Alert,
  ActionSheetIOS,
  Platform,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import { format, parseISO } from 'date-fns';
import { colors, typography, spacing, borderRadius } from '../theme';
import { Card } from '../components/common';
import { useData } from '../contexts/DataContext';
import { ProgressPhoto, PhotoPose } from '../types';
import {
  getAllProgressPhotos,
  captureProgressPhoto,
  pickProgressPhoto,
  getProgressPhotoUri,
} from '../services/progressPhotos';
import { formatWeight } from '../services/units';

const SCREEN_WIDTH = Dimensions.get('window').width;
const GRID_PADDING = spacing.base;
const GRID_GAP = spacing.xs;
const NUM_COLUMNS = 3;
const THUMB_SIZE = (SCREEN_WIDTH - GRID_PADDING * 2 - GRID_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS;

const POSE_LABELS: Record<PhotoPose, string> = {
  front: 'Front',
  side: 'Side',
  back: 'Back',
  other: 'Other',
};

const POSE_ICONS: Record<PhotoPose, string> = {
  front: 'person',
  side: 'person-outline',
  back: 'person',
  other: 'image-outline',
};

interface PhotoSection {
  title: string;
  data: ProgressPhoto[][];
}

function groupPhotosByMonth(photos: ProgressPhoto[]): PhotoSection[] {
  const groups = new Map<string, ProgressPhoto[]>();

  photos.forEach(photo => {
    const monthKey = photo.date.substring(0, 7); // YYYY-MM
    const existing = groups.get(monthKey) || [];
    existing.push(photo);
    groups.set(monthKey, existing);
  });

  return Array.from(groups.entries()).map(([monthKey, monthPhotos]) => {
    // Chunk into rows of NUM_COLUMNS
    const rows: ProgressPhoto[][] = [];
    for (let i = 0; i < monthPhotos.length; i += NUM_COLUMNS) {
      rows.push(monthPhotos.slice(i, i + NUM_COLUMNS));
    }
    return {
      title: format(parseISO(`${monthKey}-01`), 'MMMM yyyy'),
      data: rows,
    };
  });
}

export function ProgressPhotosScreen() {
  const navigation = useNavigation();
  const { userSettings } = useData();
  const [photos, setPhotos] = useState<ProgressPhoto[]>([]);
  const [isLocked, setIsLocked] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [selectedForCompare, setSelectedForCompare] = useState<string[]>([]);

  const loadPhotos = useCallback(async () => {
    // Check Face ID lock
    if (userSettings.progressPhotosLocked && !isAuthenticated) {
      setIsLocked(true);
      return;
    }
    setIsLocked(false);
    const allPhotos = await getAllProgressPhotos();
    setPhotos(allPhotos);
  }, [userSettings.progressPhotosLocked, isAuthenticated]);

  useFocusEffect(
    useCallback(() => {
      loadPhotos();
    }, [loadPhotos])
  );

  const handleUnlock = async () => {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock Progress Photos',
      fallbackLabel: 'Use Passcode',
    });
    if (result.success) {
      setIsAuthenticated(true);
      setIsLocked(false);
      const allPhotos = await getAllProgressPhotos();
      setPhotos(allPhotos);
    }
  };

  const showPosePicker = (onSelect: (pose: PhotoPose) => void) => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'Front', 'Side', 'Back', 'Other'],
          cancelButtonIndex: 0,
        },
        (index) => {
          const poses: PhotoPose[] = ['front', 'side', 'back', 'other'];
          if (index > 0) onSelect(poses[index - 1]);
        }
      );
    } else {
      onSelect('front');
    }
  };

  const showSourcePicker = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'Take Photo', 'Choose from Library'],
          cancelButtonIndex: 0,
        },
        (index) => {
          if (index === 1) {
            showPosePicker(async (pose) => {
              const photo = await captureProgressPhoto(pose);
              if (photo) loadPhotos();
            });
          } else if (index === 2) {
            showPosePicker(async (pose) => {
              const photo = await pickProgressPhoto(pose);
              if (photo) loadPhotos();
            });
          }
        }
      );
    } else {
      showPosePicker(async (pose) => {
        const photo = await captureProgressPhoto(pose);
        if (photo) loadPhotos();
      });
    }
  };

  const handlePhotoPress = (photo: ProgressPhoto) => {
    if (compareMode) {
      setSelectedForCompare(prev => {
        if (prev.includes(photo.id)) {
          return prev.filter(id => id !== photo.id);
        }
        if (prev.length >= 2) return prev;
        const next = [...prev, photo.id];
        if (next.length === 2) {
          setCompareMode(false);
          setSelectedForCompare([]);
          navigation.navigate('ProgressPhotoCompare' as any, {
            photoId1: next[0],
            photoId2: next[1],
          });
        }
        return next;
      });
    } else {
      navigation.navigate('ProgressPhotoView' as any, { photoId: photo.id });
    }
  };

  const sections = groupPhotosByMonth(photos);

  if (isLocked) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Progress Photos</Text>
        </View>
        <View style={styles.lockedContainer}>
          <Ionicons name="lock-closed" size={64} color={colors.textTertiary} />
          <Text style={styles.lockedTitle}>Photos Locked</Text>
          <Text style={styles.lockedSubtext}>
            Authenticate to view your progress photos
          </Text>
          <TouchableOpacity style={styles.unlockButton} onPress={handleUnlock}>
            <Text style={styles.unlockButtonText}>Unlock</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Progress Photos</Text>
        <View style={styles.headerActions}>
          {photos.length >= 2 && (
            <TouchableOpacity
              style={[styles.headerButton, compareMode && styles.headerButtonActive]}
              onPress={() => {
                setCompareMode(!compareMode);
                setSelectedForCompare([]);
              }}
            >
              <Ionicons
                name="git-compare-outline"
                size={22}
                color={compareMode ? colors.primary : colors.text}
              />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.headerButton} onPress={showSourcePicker}>
            <Ionicons name="camera" size={22} color={colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      {compareMode && (
        <View style={styles.compareBanner}>
          <Text style={styles.compareBannerText}>
            Select {2 - selectedForCompare.length} photo{selectedForCompare.length === 1 ? '' : 's'} to compare
          </Text>
        </View>
      )}

      {photos.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="camera-outline" size={80} color={colors.textTertiary} />
          <Text style={styles.emptyTitle}>No Progress Photos</Text>
          <Text style={styles.emptySubtext}>
            Take your first progress photo to start tracking your physique changes over time.
          </Text>
          <TouchableOpacity style={styles.addButton} onPress={showSourcePicker}>
            <Ionicons name="add" size={20} color={colors.textOnPrimary} />
            <Text style={styles.addButtonText}>Add Photo</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item, index) => `row-${index}`}
          renderSectionHeader={({ section: { title } }) => (
            <Text style={styles.sectionHeader}>{title}</Text>
          )}
          renderItem={({ item: row }) => (
            <View style={styles.gridRow}>
              {row.map(photo => {
                const isSelected = selectedForCompare.includes(photo.id);
                return (
                  <TouchableOpacity
                    key={photo.id}
                    style={[styles.thumbnail, isSelected && styles.thumbnailSelected]}
                    onPress={() => handlePhotoPress(photo)}
                    activeOpacity={0.8}
                  >
                    <Image
                      source={{ uri: getProgressPhotoUri(photo) }}
                      style={styles.thumbnailImage}
                    />
                    <View style={styles.thumbnailOverlay}>
                      <Text style={styles.thumbnailDate}>
                        {format(parseISO(photo.date), 'MMM d')}
                      </Text>
                      <Ionicons
                        name={POSE_ICONS[photo.pose] as any}
                        size={12}
                        color="white"
                      />
                    </View>
                    {photo.weight && (
                      <View style={styles.thumbnailWeight}>
                        <Text style={styles.thumbnailWeightText}>
                          {formatWeight(photo.weight, userSettings.units)}
                        </Text>
                      </View>
                    )}
                    {isSelected && (
                      <View style={styles.selectedBadge}>
                        <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
              {/* Fill empty spots in last row */}
              {row.length < NUM_COLUMNS &&
                Array(NUM_COLUMNS - row.length)
                  .fill(null)
                  .map((_, i) => <View key={`empty-${i}`} style={styles.thumbnailPlaceholder} />)}
            </View>
          )}
          contentContainerStyle={styles.listContent}
          stickySectionHeadersEnabled={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: GRID_PADDING,
    paddingVertical: spacing.sm,
  },
  headerTitle: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold as any,
    color: colors.text,
  },
  headerActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  headerButton: {
    padding: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  headerButtonActive: {
    backgroundColor: colors.backgroundTertiary,
  },
  compareBanner: {
    backgroundColor: colors.backgroundTertiary,
    paddingVertical: spacing.xs,
    paddingHorizontal: GRID_PADDING,
    alignItems: 'center',
  },
  compareBannerText: {
    fontSize: typography.size.sm,
    color: colors.primary,
    fontWeight: typography.weight.medium as any,
  },
  listContent: {
    paddingHorizontal: GRID_PADDING,
    paddingBottom: spacing.xl,
  },
  sectionHeader: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold as any,
    color: colors.textSecondary,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  gridRow: {
    flexDirection: 'row',
    gap: GRID_GAP,
    marginBottom: GRID_GAP,
  },
  thumbnail: {
    width: THUMB_SIZE,
    height: THUMB_SIZE * 1.33,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    backgroundColor: colors.backgroundSecondary,
  },
  thumbnailSelected: {
    borderWidth: 2,
    borderColor: colors.primary,
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  thumbnailOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 4,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  thumbnailDate: {
    fontSize: 10,
    color: 'white',
    fontWeight: '600',
  },
  thumbnailWeight: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  thumbnailWeightText: {
    fontSize: 9,
    color: colors.primary,
    fontWeight: '600',
  },
  thumbnailPlaceholder: {
    width: THUMB_SIZE,
    height: THUMB_SIZE * 1.33,
  },
  selectedBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  emptyTitle: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold as any,
    color: colors.text,
    marginTop: spacing.md,
  },
  emptySubtext: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 20,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    marginTop: spacing.lg,
    gap: spacing.xs,
  },
  addButtonText: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold as any,
    color: colors.textOnPrimary,
  },
  lockedContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  lockedTitle: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold as any,
    color: colors.text,
    marginTop: spacing.md,
  },
  lockedSubtext: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  unlockButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    marginTop: spacing.lg,
  },
  unlockButtonText: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold as any,
    color: colors.textOnPrimary,
  },
});

export default ProgressPhotosScreen;
