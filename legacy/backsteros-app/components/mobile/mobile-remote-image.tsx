"use client";

type MobileRemoteImageProps = {
  kind?: string;
  entityId?: string;
  storageKey?: string | null;
  fallbackSrc?: string | null;
  alt?: string;
  className?: string;
  /** Explicit pixel size — required in tight dropdown/flex slots where `size-full` can collapse. */
  size?: number;
  onError?: () => void;
};

export function MobileRemoteImage({
  fallbackSrc,
  alt = "",
  className,
  size,
  onError,
}: MobileRemoteImageProps) {
  if (!fallbackSrc) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={fallbackSrc}
      alt={alt}
      width={size}
      height={size}
      className={className}
      style={
        size
          ? { width: size, height: size, maxWidth: size, maxHeight: size }
          : undefined
      }
      onError={onError}
    />
  );
}
