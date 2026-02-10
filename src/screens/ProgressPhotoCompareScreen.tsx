import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  Dimensions,
  FlatList,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO, differenceInDays } from 'date-fns';
import { colors, typography, spacing, borderRadius } from '../theme';
import { useData } from '../contexts/DataContext';
import { ProgressPhoto } from '../types';
import { getAllProgressPhotos, getProgressPhotoUri } from '../services/progressPhotos';
import { formatWeight } from '../services/units';
import { RootStackParamList } from '../navigation/types';

const SCREEN_WIDTH = Dimensions.get('window').width;
const PHOTO_WIDTH = (SCREEN_WIDTH - spacing.base * 2 - spacing.sm) / 2;

type RouteParams = RouteProp<RootStackParamList, 'ProgressPhotoCompare'>;

export function ProgressPhotoCompareScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteParams>();
  const { userSettings } = useData();
  const { photoId1, photoId2 } = route.params;

  const [photos, setPhotos] = useState<ProgressPhoto[]>([]);
  const [leftId, setLeftId] = useState<string | undefined>(photoId1);
  const [rightId, setRightId] = useState<string | undefined>(photoId2);
  const [pickingSide, setPickingSide] = useState<'left' | 'right' | null>(null);

  const loadPhotos = useCallback(async () => {
    const allPhotos = await getAllProgressPhotos();
    setPhotos(allPhotos);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadPhotos();
    }, [loadPhotos])
  );

  const leftPhoto = useMemo(() => photos.find(p => p.id === leftId), [photos, leftId]);
  const rightPhoto = useMemo(() => photos.find(p => p.id === rightId), [photos, rightId]);

  const daysBetween = useMemo(() => {
    if (!leftPhoto || !rightPhoto) return null;
    return Math.abs(differenceInDays(parseISO(rightPhoto.date), parseISO(leftPhoto.date)));
  }, [leftPhoto, rightPhoto]);

  const weightDelta = useMemo(() => {
    if (!leftPhoto?.weight || !rightPhoto?.weight) return null;
    return rightPhoto.weight - leftPhoto.weight;
  }, [leftPhoto, rightPhoto]);

  const handleQuickSelect = (daysAgo: number) => {
    if (!leftPhoto) return;
    const leftDate = parseISO(leftPhoto.date);
    // Find the photo closest to daysAgo before the left photo
    let best: ProgressPhoto | null = null;
    let bestDiff = Infinity;

    photos.forEach(p => {
      if (p.id === leftPhoto.id) return;
      const diff = differenceInDays(leftDate, parseISO(p.date));
      if (diff > 0 && Math.abs(diff - daysAgo) < bestDiff) {
        bestDiff = Math.abs(diff - daysAgo);
        best = p;
      }
    });

    if (best) {
      setRightId(leftId);
      setLeftId((best as ProgressPhoto).id);
    }
  };

  const handlePickPhoto = (photo: ProgressPhoto) => {
    if (pickingSide === 'left') {
      setLeftId(photo.id);
    } else {
      setRightId(photo.id);
    }
    setPickingSide(null);
  };

  const renderPhotoSide = (photo: ProgressPhoto | undefined, side: 'left' | 'right') => {
    if (!photo) {
      return (
        <TouchableOpacity
          style={styles.emptySlot}
          onPress={() => setPickingSide(side)}
        >
          <Ionicons name="add-circle-outline" size={40} color={colors.textTertiary} />
          <Text style={styles.emptySlotText}>Select photo</Text>
        </TouchableOpacity>
      );
    }

    return (
      <TouchableOpacity
        style={styles.photoSide}
        onPress={() => setPickingSide(side)}
        activeOpacity={0.9}
      >
        <Image
          source={{ uri: getProgressPhotoUri(photo) }}
          style={styles.photo}
          resizeMode="cover"
        />
        <View style={styles.photoInfo}>
          <Text style={styles.photoDate}>
            {format(parseISO(photo.date), 'MMM d, yyyy')}
          </Text>
          {photo.weight && (
            <Text style={styles.photoWeight}>
              {formatWeight(photo.weight, userSettings.units)}
            </Text>
          )}
          <View style={styles.poseBadge}>
            <Text style={styles.poseText}>
              {photo.pose.charAt(0).toUpperCase() + photo.pose.slice(1)}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Compare</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.compareContainer}>
        {renderPhotoSide(leftPhoto, 'left')}
        <View style={styles.divider} />
        {renderPhotoSide(rightPhoto, 'right')}
      </View>

      {/* Stats delta */}
      {leftPhoto && rightPhoto && (
        <View style={styles.statsRow}>
          {daysBetween !== null && (
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Days Apart</Text>
              <Text style={styles.statValue}>{daysBetween}</Text>
            </View>
          )}
          {weightDelta !== null && (
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Weight Change</Text>
              <Text style={[
                styles.statValue,
                weightDelta > 0 && styles.statPositive,
                weightDelta < 0 && styles.statNegative,
              ]}>
                {weightDelta > 0 ? '+' : ''}
                {formatWeight(Math.abs(weightDelta), userSettings.units)}
                {weightDelta < 0 ? ' lost' : weightDelta > 0 ? ' gained' : ''}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Quick select buttons */}
      {leftPhoto && photos.length >= 2 && (
        <View style={styles.quickSelectRow}>
          <Text style={styles.quickSelectLabel}>Compare with:</Text>
          {[
            { days: 28, label: '4 weeks' },
            { days: 90, label: '3 months' },
            { days: 180, label: '6 months' },
          ].map(({ days, label }) => (
            <TouchableOpacity
              key={days}
              style={styles.quickSelectButton}
              onPress={() => handleQuickSelect(days)}
            >
              <Text style={styles.quickSelectText}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Photo picker modal */}
      <Modal
        visible={pickingSide !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setPickingSide(null)}
      >
        <SafeAreaView style={styles.modalSafeArea}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Photo</Text>
            <TouchableOpacity onPress={() => setPickingSide(null)}>
              <Text style={styles.modalClose}>Cancel</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={photos}
            numColumns={3}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.pickerGrid}
            columnWrapperStyle={styles.pickerRow}
            renderItem={({ item }) => {
              const isCurrentlyUsed =
                (pickingSide === 'left' && item.id === rightId) ||
                (pickingSide === 'right' && item.id === leftId);
              return (
                <TouchableOpacity
                  style={[styles.pickerThumb, isCurrentlyUsed && styles.pickerThumbDimmed]}
                  onPress={() => handlePickPhoto(item)}
                  activeOpacity={0.8}
                >
                  <Image
                    source={{ uri: getProgressPhotoUri(item) }}
                    style={styles.pickerThumbImage}
                  />
                  <View style={styles.pickerThumbOverlay}>
                    <Text style={styles.pickerThumbDate}>
                      {format(parseISO(item.date), 'MMM d')}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const PICKER_GAP = spacing.xs;
const PICKER_THUMB = (SCREEN_WIDTH - spacing.base * 2 - PICKER_GAP * 2) / 3;

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  backButton: {
    padding: spacing.xs,
  },
  headerTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold as any,
    color: colors.text,
  },
  headerSpacer: {
    width: 32,
  },
  compareContainer: {
    flex: 1,
    flexDirection: 'row',
    paddingHorizontal: spacing.base,
    gap: spacing.sm,
  },
  divider: {
    width: 1,
    backgroundColor: colors.separator,
  },
  photoSide: {
    flex: 1,
  },
  photo: {
    flex: 1,
    borderRadius: borderRadius.md,
  },
  photoInfo: {
    paddingVertical: spacing.sm,
    gap: 2,
  },
  photoDate: {
    fontSize: typography.size.sm,
    color: colors.text,
    fontWeight: typography.weight.medium as any,
  },
  photoWeight: {
    fontSize: typography.size.sm,
    color: colors.primary,
    fontWeight: typography.weight.semibold as any,
  },
  poseBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.backgroundTertiary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 1,
    borderRadius: borderRadius.sm,
    marginTop: 2,
  },
  poseText: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },
  emptySlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.separator,
    borderStyle: 'dashed',
  },
  emptySlotText: {
    fontSize: typography.size.sm,
    color: colors.textTertiary,
    marginTop: spacing.xs,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xl,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    backgroundColor: colors.backgroundSecondary,
    marginHorizontal: spacing.base,
    borderRadius: borderRadius.md,
  },
  statItem: {
    alignItems: 'center',
  },
  statLabel: {
    fontSize: typography.size.xs,
    color: colors.textTertiary,
    marginBottom: 2,
  },
  statValue: {
    fontSize: typography.size.md,
    color: colors.text,
    fontWeight: typography.weight.semibold as any,
  },
  statPositive: {
    color: colors.primary,
  },
  statNegative: {
    color: colors.error,
  },
  quickSelectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  quickSelectLabel: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  quickSelectButton: {
    backgroundColor: colors.backgroundTertiary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  quickSelectText: {
    fontSize: typography.size.sm,
    color: colors.text,
    fontWeight: typography.weight.medium as any,
  },
  // Modal styles
  modalSafeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  modalTitle: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold as any,
    color: colors.text,
  },
  modalClose: {
    fontSize: typography.size.md,
    color: colors.primary,
  },
  pickerGrid: {
    padding: spacing.base,
  },
  pickerRow: {
    gap: PICKER_GAP,
    marginBottom: PICKER_GAP,
  },
  pickerThumb: {
    width: PICKER_THUMB,
    height: PICKER_THUMB * 1.33,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    backgroundColor: colors.backgroundSecondary,
  },
  pickerThumbDimmed: {
    opacity: 0.4,
  },
  pickerThumbImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  pickerThumbOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 6,
    paddingVertical: 3,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  pickerThumbDate: {
    fontSize: 10,
    color: 'white',
    fontWeight: '600',
  },
});

export default ProgressPhotoCompareScreen;
