import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  Dimensions,
  FlatList,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO, differenceInDays } from 'date-fns';
import { colors, typography, spacing, borderRadius } from '../theme';
import { useData } from '../contexts/DataContext';
import { ProgressPhoto } from '../types';
import {
  getAllProgressPhotos,
  getProgressPhotoUri,
  deleteProgressPhoto,
} from '../services/progressPhotos';
import { updateProgressPhoto } from '../services/storage';
import { formatWeight } from '../services/units';
import { RootStackParamList } from '../navigation/types';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;

type RouteParams = RouteProp<RootStackParamList, 'ProgressPhotoView'>;

export function ProgressPhotoViewScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteParams>();
  const { userSettings } = useData();
  const { photoId } = route.params;
  const flatListRef = useRef<FlatList>(null);

  const [photos, setPhotos] = useState<ProgressPhoto[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesText, setNotesText] = useState('');

  const loadPhotos = useCallback(async () => {
    const allPhotos = await getAllProgressPhotos();
    setPhotos(allPhotos);
    const idx = allPhotos.findIndex(p => p.id === photoId);
    if (idx !== -1) {
      setCurrentIndex(idx);
      setTimeout(() => {
        flatListRef.current?.scrollToIndex({ index: idx, animated: false });
      }, 100);
    }
  }, [photoId]);

  useFocusEffect(
    useCallback(() => {
      loadPhotos();
    }, [loadPhotos])
  );

  const currentPhoto = photos[currentIndex];

  const handleDelete = () => {
    if (!currentPhoto) return;
    Alert.alert(
      'Delete Photo',
      'This photo will be permanently deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteProgressPhoto(currentPhoto.id);
            if (photos.length <= 1) {
              navigation.goBack();
            } else {
              loadPhotos();
            }
          },
        },
      ]
    );
  };

  const handleSaveNotes = async () => {
    if (!currentPhoto) return;
    const updated = { ...currentPhoto, notes: notesText || undefined };
    await updateProgressPhoto(updated);
    setEditingNotes(false);
    loadPhotos();
  };

  const handleCompare = () => {
    if (!currentPhoto) return;
    navigation.navigate('ProgressPhotoCompare' as any, { photoId1: currentPhoto.id });
  };

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      setCurrentIndex(viewableItems[0].index ?? 0);
    }
  }).current;

  if (!currentPhoto) return null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {format(parseISO(currentPhoto.date), 'MMM d, yyyy')}
        </Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={handleCompare} style={styles.headerButton}>
            <Ionicons name="git-compare-outline" size={22} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleDelete} style={styles.headerButton}>
            <Ionicons name="trash-outline" size={22} color={colors.error} />
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        ref={flatListRef}
        data={photos}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
        getItemLayout={(_, index) => ({
          length: SCREEN_WIDTH,
          offset: SCREEN_WIDTH * index,
          index,
        })}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <View style={styles.photoContainer}>
            <Image
              source={{ uri: getProgressPhotoUri(item) }}
              style={styles.photo}
              resizeMode="contain"
            />
          </View>
        )}
      />

      <View style={styles.infoPanel}>
        <View style={styles.infoRow}>
          <View style={styles.poseBadge}>
            <Text style={styles.poseText}>
              {currentPhoto.pose.charAt(0).toUpperCase() + currentPhoto.pose.slice(1)}
            </Text>
          </View>
          {currentPhoto.weight && (
            <Text style={styles.weightText}>
              {formatWeight(currentPhoto.weight, userSettings.units)}
            </Text>
          )}
          <Text style={styles.indexText}>
            {currentIndex + 1} / {photos.length}
          </Text>
        </View>

        {editingNotes ? (
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.notesEditRow}>
              <TextInput
                style={styles.notesInput}
                value={notesText}
                onChangeText={setNotesText}
                placeholder="Add a note..."
                placeholderTextColor={colors.textTertiary}
                autoFocus
                multiline
                maxLength={200}
              />
              <TouchableOpacity onPress={handleSaveNotes} style={styles.notesSaveButton}>
                <Text style={styles.notesSaveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        ) : (
          <TouchableOpacity
            onPress={() => {
              setNotesText(currentPhoto.notes || '');
              setEditingNotes(true);
            }}
            style={styles.notesRow}
          >
            <Text style={currentPhoto.notes ? styles.notesText : styles.notesPlaceholder}>
              {currentPhoto.notes || 'Tap to add notes...'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
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
  headerActions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  headerButton: {
    padding: spacing.xs,
  },
  photoContainer: {
    width: SCREEN_WIDTH,
    flex: 1,
    backgroundColor: colors.background,
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  infoPanel: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    backgroundColor: colors.backgroundSecondary,
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  poseBadge: {
    backgroundColor: colors.backgroundTertiary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  poseText: {
    fontSize: typography.size.xs,
    color: colors.text,
    fontWeight: typography.weight.medium as any,
  },
  weightText: {
    fontSize: typography.size.md,
    color: colors.primary,
    fontWeight: typography.weight.semibold as any,
  },
  indexText: {
    fontSize: typography.size.xs,
    color: colors.textTertiary,
    marginLeft: 'auto',
  },
  notesRow: {
    marginTop: spacing.sm,
    paddingVertical: spacing.xs,
  },
  notesText: {
    fontSize: typography.size.sm,
    color: colors.text,
  },
  notesPlaceholder: {
    fontSize: typography.size.sm,
    color: colors.textTertiary,
    fontStyle: 'italic',
  },
  notesEditRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  notesInput: {
    flex: 1,
    fontSize: typography.size.sm,
    color: colors.text,
    backgroundColor: colors.backgroundTertiary,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    maxHeight: 80,
  },
  notesSaveButton: {
    paddingVertical: spacing.xs,
  },
  notesSaveText: {
    fontSize: typography.size.sm,
    color: colors.primary,
    fontWeight: typography.weight.semibold as any,
  },
});

export default ProgressPhotoViewScreen;
