// HIRELENS dark-first design tokens. Components must read colors from here.
import { useMemo } from "react";
import { Appearance, StyleSheet, useColorScheme } from "react-native";

export type ColorScheme = "light" | "dark";

const dark = {
  surface: "#121316",
  onSurface: "#F3F4F6",
  surfaceSecondary: "#1A1C23",
  onSurfaceSecondary: "#E5E7EB",
  surfaceTertiary: "#252833",
  onSurfaceTertiary: "#9CA3AF",
  surfaceInverse: "#FFFFFF",
  onSurfaceInverse: "#121316",
  muted: "#9CA3AF",
  brand: "#00E599",
  onBrand: "#121316",
  brandPrimary: "#00E599",
  onBrandPrimary: "#121316",
  brandSecondary: "#00B377",
  onBrandSecondary: "#FFFFFF",
  brandTertiary: "#1C3829",
  onBrandTertiary: "#6EE7B7",
  success: "#10B981",
  onSuccess: "#FFFFFF",
  warning: "#F59E0B",
  onWarning: "#FFFFFF",
  error: "#EF4444",
  onError: "#FFFFFF",
  info: "#3B82F6",
  onInfo: "#FFFFFF",
  border: "#2E323F",
  borderStrong: "#4B5563",
  divider: "#1F232D",
};

export type ThemeColors = typeof dark;
export const defaultScheme = "dark" satisfies ColorScheme;
// The design system is deliberately dark in both device modes for visual parity.
export const themes: { light: ThemeColors; dark?: ThemeColors } = { light: dark, dark };

export function setColorScheme(scheme: ColorScheme | null) {
  Appearance.setColorScheme?.(scheme);
}

setColorScheme(defaultScheme);

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const system = useColorScheme();
  const scheme: ColorScheme = system && themes[system] ? system : defaultScheme;
  return { scheme, colors: themes[scheme] ?? themes.dark ?? themes.light };
}

export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}