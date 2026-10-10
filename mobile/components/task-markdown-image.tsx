import { parseTaskImageContentPath } from "@backsteros/contracts";
import { File, Paths } from "expo-file-system";
import { useEffect, useState } from "react";
import { Image, StyleSheet, View } from "react-native";

import { useMobileApiClient } from "../lib/use-mobile-api-client";

async function blobToBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === "function") {
    return new Uint8Array(await blob.arrayBuffer());
  }
  return new Uint8Array(await new Response(blob).arrayBuffer());
}

function cachePathForTaskImage(taskId: string, imageId: string): File {
  return new File(
    Paths.cache,
    `task-image-${taskId}-${imageId}.bin`,
  );
}

/**
 * Authenticated task-image markdown embed (OS-90).
 * Relative `/api/v1/tasks/.../images/...` paths are fetched with the API key.
 */
export function TaskMarkdownImage({
  src,
  alt,
}: {
  src: string;
  alt: string;
}) {
  const client = useMobileApiClient();
  const [uri, setUri] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const parsed = parseTaskImageContentPath(src);
      if (!parsed) {
        if (!cancelled) setUri(src);
        return;
      }
      const cached = cachePathForTaskImage(parsed.taskId, parsed.imageId);
      if (cached.exists) {
        if (!cancelled) setUri(cached.uri);
        return;
      }
      try {
        const blob = await client.downloadTaskImage(
          parsed.taskId,
          parsed.imageId,
        );
        const bytes = await blobToBytes(blob);
        cached.create({ overwrite: true });
        cached.write(bytes);
        if (!cancelled) setUri(cached.uri);
      } catch {
        if (!cancelled) setUri(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, src]);

  if (!uri) return null;
  return (
    <View style={styles.wrap}>
      <Image
        source={{ uri }}
        style={styles.image}
        resizeMode="contain"
        accessibilityLabel={alt || "Image"}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    marginVertical: 8,
    borderRadius: 8,
    overflow: "hidden",
  },
  image: {
    width: "100%",
    height: 220,
    backgroundColor: "transparent",
  },
});
