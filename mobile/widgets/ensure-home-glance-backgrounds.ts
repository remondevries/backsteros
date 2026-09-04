import { Image, Platform } from "react-native";
import { File } from "expo-file-system";
import { widgetsDirectory } from "expo-widgets";

const MEDIUM_ASSET = require("../assets/widgets/home-glance-medium-bg.jpg");
const LARGE_ASSET = require("../assets/widgets/home-glance-large-bg.jpg");

export const HOME_GLANCE_MEDIUM_BG_FILENAME = "home-glance-medium-bg.jpg";
export const HOME_GLANCE_LARGE_BG_FILENAME = "home-glance-large-bg.jpg";

export type HomeGlanceBackgroundUris = {
  mediumBackgroundUri: string;
  largeBackgroundUri: string;
};

async function copyAssetToWidgetsDirectory(
  assetModule: number,
  filename: string,
): Promise<string> {
  if (!widgetsDirectory) {
    throw new Error("widgetsDirectory is unavailable (App Group missing)");
  }

  const resolved = Image.resolveAssetSource(assetModule);
  if (!resolved?.uri) {
    throw new Error(`Could not resolve widget background asset: ${filename}`);
  }

  const destination = new File(widgetsDirectory, filename);
  const sourceUri = resolved.uri;

  if (sourceUri.startsWith("http://") || sourceUri.startsWith("https://")) {
    await File.downloadFileAsync(sourceUri, destination, { idempotent: true });
  } else {
    const source = new File(sourceUri);
    await source.copy(destination, { overwrite: true });
  }

  return destination.uri;
}

/** Copy bundled backgrounds into the App Group so widgets can read them. */
export async function ensureHomeGlanceBackgrounds(): Promise<HomeGlanceBackgroundUris | null> {
  if (Platform.OS !== "ios") return null;

  try {
    const [mediumBackgroundUri, largeBackgroundUri] = await Promise.all([
      copyAssetToWidgetsDirectory(MEDIUM_ASSET, HOME_GLANCE_MEDIUM_BG_FILENAME),
      copyAssetToWidgetsDirectory(LARGE_ASSET, HOME_GLANCE_LARGE_BG_FILENAME),
    ]);
    return { mediumBackgroundUri, largeBackgroundUri };
  } catch {
    return null;
  }
}
