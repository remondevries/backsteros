"use client";

import { useEffect, useRef, useState } from "react";

export type AvatarActionResult = { ok: true } | { ok: false; error: string };

export type AvatarUploadShape = "circle" | "rounded-square";

export type AvatarUploadProps = {
  displayName: string;
  avatarSrc: string | null;
  onUpload: (file: File) => Promise<AvatarActionResult>;
  onRemove?: () => Promise<AvatarActionResult>;
  onSuccess?: () => void;
  /** Defaults to circle (contacts/orgs). Bank accounts use rounded-square. */
  shape?: AvatarUploadShape;
  /** When true, accept SVG uploads in addition to raster formats. */
  allowSvg?: boolean;
  /** Hide format hint under the control. */
  showHint?: boolean;
  /** Show the "Remove avatar" text control. Default true when onRemove is set. */
  showRemove?: boolean;
};

function AvatarPlaceholder({ name }: { name: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span aria-hidden="true" className="avatar-upload__placeholder">
      {initial}
    </span>
  );
}

/**
 * Avatar upload/remove control — circular by default (contacts/orgs),
 * optional rounded-square + SVG for bank logos.
 */
export function AvatarUpload({
  displayName,
  avatarSrc,
  onUpload,
  onRemove,
  onSuccess,
  shape = "circle",
  allowSvg = false,
  showHint = true,
  showRemove,
}: AvatarUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [avatarSrc]);

  const hasAvatar = Boolean(avatarSrc);
  const showImage = Boolean(avatarSrc) && !imageFailed;
  const canShowRemove = (showRemove ?? Boolean(onRemove)) && Boolean(onRemove);
  const accept = allowSvg
    ? "image/jpeg,image/png,image/webp,image/gif,image/svg+xml,.jpg,.jpeg,.png,.webp,.gif,.svg"
    : "image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif";
  const hint = allowSvg
    ? "JPG, PNG, WebP, GIF, or SVG up to 5 MB"
    : "JPG, PNG, WebP, or GIF up to 5 MB";
  const overlayLabel = pending
    ? "Saving…"
    : hasAvatar
      ? "Change"
      : "Upload";

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setError(null);
    setPending(true);
    try {
      const result = await onUpload(file);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSuccess?.();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not upload avatar.",
      );
    } finally {
      setPending(false);
    }
  }

  async function handleRemove() {
    if (!onRemove) return;
    setError(null);
    setPending(true);
    try {
      const result = await onRemove();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSuccess?.();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not remove avatar.",
      );
    } finally {
      setPending(false);
    }
  }

  const showMeta = showHint || (canShowRemove && hasAvatar) || Boolean(error);

  return (
    <div className="avatar-upload">
      <div className="avatar-upload__frame">
        <button
          type="button"
          className={[
            "avatar-upload__button",
            shape === "rounded-square"
              ? "avatar-upload__button--rounded-square"
              : null,
            showImage ? "avatar-upload__button--image" : null,
          ]
            .filter(Boolean)
            .join(" ")}
          onClick={() => fileInputRef.current?.click()}
          disabled={pending}
          aria-label={hasAvatar ? "Change avatar" : "Upload avatar"}
        >
          {showImage ? (
            <img
              src={avatarSrc!}
              alt=""
              className="avatar-upload__img"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <AvatarPlaceholder name={displayName} />
          )}
          <span className="avatar-upload__overlay">{overlayLabel}</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          className="avatar-upload__file"
          onChange={(event) => {
            void handleFileChange(event);
          }}
          disabled={pending}
        />
      </div>

      {showMeta ? (
        <div className="avatar-upload__meta">
          {showHint ? <p className="avatar-upload__hint">{hint}</p> : null}
          {canShowRemove && hasAvatar ? (
            <button
              type="button"
              className="avatar-upload__remove"
              onClick={() => {
                void handleRemove();
              }}
              disabled={pending}
            >
              Remove avatar
            </button>
          ) : null}
          {error ? (
            <p className="avatar-upload__error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
