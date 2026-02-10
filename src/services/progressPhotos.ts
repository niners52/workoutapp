import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { ProgressPhoto, PhotoPose } from '../types';
import {
  saveProgressPhoto,
  getProgressPhotos,
  deleteProgressPhotoMetadata,
  getLatestBodyMeasurement,
} from './storage';

const PHOTOS_DIR = `${FileSystem.documentDirectory}progress-photos/`;
const MAX_WIDTH = 1200;
const JPEG_QUALITY = 0.8;

/** Ensure the photos directory exists */
async function ensureDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(PHOTOS_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(PHOTOS_DIR, { intermediates: true });
  }
}

/** Generate a unique filename */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/** Compress and save an image to the photos directory */
async function compressAndSave(uri: string): Promise<string> {
  await ensureDir();

  const manipulated = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: MAX_WIDTH } }],
    { compress: JPEG_QUALITY, format: ImageManipulator.SaveFormat.JPEG }
  );

  const fileName = `${generateId()}.jpg`;
  const destUri = `${PHOTOS_DIR}${fileName}`;
  await FileSystem.moveAsync({ from: manipulated.uri, to: destUri });

  return fileName;
}

/** Get the full file:// URI for a progress photo */
export function getProgressPhotoUri(photo: ProgressPhoto): string {
  return `${PHOTOS_DIR}${photo.fileName}`;
}

/** Capture a new progress photo from the camera */
export async function captureProgressPhoto(pose: PhotoPose): Promise<ProgressPhoto | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return null;

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    quality: 1,
    allowsEditing: false,
    cameraType: ImagePicker.CameraType.front,
  });

  if (result.canceled || !result.assets?.[0]) return null;

  const fileName = await compressAndSave(result.assets[0].uri);
  const weight = await getAutoWeight();

  const photo: ProgressPhoto = {
    id: generateId(),
    date: new Date().toISOString().split('T')[0],
    createdAt: new Date().toISOString(),
    pose,
    fileName,
    weight: weight ?? undefined,
  };

  await saveProgressPhoto(photo);
  return photo;
}

/** Pick a progress photo from the photo library */
export async function pickProgressPhoto(pose: PhotoPose): Promise<ProgressPhoto | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return null;

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 1,
    allowsEditing: false,
  });

  if (result.canceled || !result.assets?.[0]) return null;

  const fileName = await compressAndSave(result.assets[0].uri);
  const weight = await getAutoWeight();

  const photo: ProgressPhoto = {
    id: generateId(),
    date: new Date().toISOString().split('T')[0],
    createdAt: new Date().toISOString(),
    pose,
    fileName,
    weight: weight ?? undefined,
  };

  await saveProgressPhoto(photo);
  return photo;
}

/** Delete a progress photo (file + metadata) */
export async function deleteProgressPhoto(id: string): Promise<void> {
  const photos = await getProgressPhotos();
  const photo = photos.find(p => p.id === id);

  if (photo) {
    const fileUri = `${PHOTOS_DIR}${photo.fileName}`;
    const info = await FileSystem.getInfoAsync(fileUri);
    if (info.exists) {
      await FileSystem.deleteAsync(fileUri, { idempotent: true });
    }
  }

  await deleteProgressPhotoMetadata(id);
}

/** Get all photos sorted by date (newest first) */
export async function getAllProgressPhotos(): Promise<ProgressPhoto[]> {
  const photos = await getProgressPhotos();
  return photos.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

/** Pull most recent body weight for auto-tagging */
async function getAutoWeight(): Promise<number | null> {
  try {
    const latest = await getLatestBodyMeasurement();
    return latest?.weight ?? null;
  } catch {
    return null;
  }
}
