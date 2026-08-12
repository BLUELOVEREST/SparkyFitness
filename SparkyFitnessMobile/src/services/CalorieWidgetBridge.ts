import { NativeModules, Platform } from 'react-native';

interface CalorieWidgetNativeModule {
  setCalorieSnapshot(json: string): Promise<void>;
  setMacroSnapshot(json: string): Promise<void>;
  setHydrationSnapshot(json: string): Promise<void>;
  reloadWidget(): Promise<void>;
  reloadMacroWidget(): Promise<void>;
  reloadHydrationWidget(): Promise<void>;
}

const nativeModule: CalorieWidgetNativeModule | undefined =
  Platform.OS === 'android'
    ? (NativeModules.CalorieWidget as CalorieWidgetNativeModule | undefined)
    : undefined;

export const CalorieWidgetBridge = {
  async setCalorieSnapshot(json: string): Promise<void> {
    if (!nativeModule) return;
    await nativeModule.setCalorieSnapshot(json);
  },
  async reloadWidget(): Promise<void> {
    if (!nativeModule) return;
    await nativeModule.reloadWidget();
  },
  async setMacroSnapshot(json: string): Promise<void> {
    if (!nativeModule) return;
    await nativeModule.setMacroSnapshot(json);
  },
  async reloadMacroWidget(): Promise<void> {
    if (!nativeModule) return;
    await nativeModule.reloadMacroWidget();
  },
  async setHydrationSnapshot(json: string): Promise<void> {
    if (!nativeModule) return;
    await nativeModule.setHydrationSnapshot(json);
  },
  async reloadHydrationWidget(): Promise<void> {
    if (!nativeModule) return;
    await nativeModule.reloadHydrationWidget();
  },
  get isAvailable(): boolean {
    return nativeModule !== undefined;
  },
};
