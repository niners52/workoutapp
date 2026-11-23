/**
 * The stack header, drawn in JS instead of by iOS.
 *
 * On build 124 (compiled with the iOS 26 SDK) the native header's back
 * button — labelled "MainTabs" when the previous screen is the tab bar —
 * hung or did nothing when tapped. Exercise History got its own bar first
 * and worked; this does the same for every stack screen: a plain Back (or
 * Close, on a modal) that calls goBack, the screen's title, and its
 * headerRight if it sets one. Swipe-back is native and unaffected.
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackHeaderProps } from '@react-navigation/native-stack';
import { colors, typography, spacing } from '../theme';

const MODAL_PRESENTATIONS = new Set(['modal', 'formSheet', 'pageSheet', 'transparentModal', 'containedModal', 'containedTransparentModal', 'fullScreenModal']);

export function AppHeader({ navigation, route, options, back }: NativeStackHeaderProps) {
  const insets = useSafeAreaInsets();
  const isModal = MODAL_PRESENTATIONS.has(String(options.presentation ?? ''));
  const title = typeof options.title === 'string' && options.title ? options.title : route.name;
  const right = typeof options.headerRight === 'function' ? options.headerRight({ tintColor: colors.text, canGoBack: !!back }) : null;

  const goBack = () => {
    if (navigation.canGoBack()) navigation.goBack();
  };

  return (
    <View style={[styles.bar, { paddingTop: isModal ? spacing.sm : insets.top }]}>
      <View style={styles.row}>
        <View style={styles.side}>
          {back ? (
            <TouchableOpacity
              onPress={goBack}
              style={styles.back}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel={isModal ? 'Close' : 'Back'}
              testID="header-back"
            >
              {isModal ? null : <Ionicons name="chevron-back" size={24} color={colors.primary} />}
              <Text style={styles.backText}>{isModal ? 'Close' : 'Back'}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <View style={[styles.side, styles.sideRight]}>{right}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  row: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
  },
  side: {
    minWidth: 84,
    flexDirection: 'row',
    alignItems: 'center',
  },
  sideRight: {
    justifyContent: 'flex-end',
  },
  back: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backText: {
    fontSize: typography.size.md,
    color: colors.primary,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.text,
  },
});
