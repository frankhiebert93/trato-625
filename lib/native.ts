'use client';
/**
 * Native capability layer for the iOS (Capacitor) build.
 *
 * Every function here degrades to the existing web behaviour, so the PWA on
 * trato625.com is unchanged. Capacitor packages are imported dynamically so
 * they never land in the web bundle for users who will never run the native
 * app.
 */

let nativeChecked = false;
let nativeCached = false;

/** True only inside the Capacitor iOS/Android shell. */
export function isNative(): boolean {
  if (nativeChecked) return nativeCached;
  nativeChecked = true;
  try {
    // Capacitor injects this global into the WebView before any app code runs.
    const cap = (globalThis as any).Capacitor;
    nativeCached = !!cap?.isNativePlatform?.();
  } catch {
    nativeCached = false;
  }
  return nativeCached;
}

const TWA_REFERRER = 'android-app://com.trato625.app';

/**
 * True inside the Android app shipped through Google Play (a Trusted Web
 * Activity). Play's billing policy covers paid digital features there, the same
 * way App Store guideline 3.1.1 does on iOS.
 *
 * A TWA marks its launch navigation with `document.referrer`. That value is
 * lost on a later reload inside the app, so the first positive result is cached
 * for the session. A PWA installed from the browser is deliberately NOT matched
 * — it is the website, and no store policy applies to it.
 */
export function isPlayApp(): boolean {
  if (typeof document === 'undefined') return false;
  const fromReferrer = document.referrer.startsWith(TWA_REFERRER);
  try {
    if (sessionStorage.getItem('trato_twa') === '1') return true;
    if (fromReferrer) sessionStorage.setItem('trato_twa', '1');
  } catch {
    // Private mode: fall back to the referrer alone.
  }
  return fromReferrer;
}

/** True in either store-distributed app: the iOS shell or the Play TWA. */
export function isStoreApp(): boolean {
  return isNative() || isPlayApp();
}

/** A short tap. No-op on web. */
export async function tapHaptic(): Promise<void> {
  if (!isNative()) return;
  try {
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {
    // Haptics are a nicety; never let them break an interaction.
  }
}

/**
 * Native iOS share sheet when available, otherwise the existing
 * navigator.share / clipboard path.
 * Returns true if the native sheet handled it.
 */
export async function nativeShare(data: {
  title?: string;
  text?: string;
  url?: string;
}): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const { Share } = await import('@capacitor/share');
    await Share.share({ title: data.title, text: data.text, url: data.url });
    return true;
  } catch {
    // User dismissed the sheet, or the plugin is unavailable.
    return false;
  }
}

/**
 * Take a photo with the real camera and return it as a File, so it drops
 * straight into the existing upload/compression pipeline.
 * Returns null on web, or if the user cancels.
 */
export async function takeNativePhoto(): Promise<File | null> {
  if (!isNative()) return null;
  try {
    const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
    const photo = await Camera.getPhoto({
      quality: 85,
      allowEditing: false,
      resultType: CameraResultType.Uri,
      source: CameraSource.Camera,
      saveToGallery: false,
    });
    if (!photo.webPath) return null;

    const blob = await (await fetch(photo.webPath)).blob();
    const ext = photo.format || 'jpeg';
    return new File([blob], `camera-${Date.now()}.${ext}`, {
      type: blob.type || `image/${ext}`,
    });
  } catch {
    // Cancelled, or permission denied.
    return null;
  }
}
