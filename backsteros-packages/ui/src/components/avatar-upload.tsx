"use client";

import { useEffect, useRef, useState } from "react";

export type AvatarActionResult = { ok: true } | { ok: false; error: string };

export type AvatarUploadProps = {
  displayName: string;
  avatarSrc: string | null;
  onUpload: (file: File) => Promise<AvatarActionResult>;
  onRemove: () => Promise<AvatarActionResult>;
  onSuccess?: () => void;
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
 * Circular avatar upload/remove control — matches Next AvatarUpload behavior.
 */
export function AvatarUpload({
  displayName,
  avatarSrc,
  onUpload,
  onRemove,
  onSuccess,
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

  return (
    <div className="avatar-upload">
      <div className="avatar-upload__frame">
        <button
          type="button"
          className={[
            "avatar-upload__button",
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
          <span className="avatar-upload__overlay">
            {pending ? "Saving…" : "Change"}
          </span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif"
          className="avatar-upload__file"
          onChange={(event) => {
            void handleFileChange(event);
          }}
          disabled={pending}
        />
      </div>

      <div className="avatar-upload__meta">
        <p className="avatar-upload__hint">JPG, PNG, WebP, or GIF up to 5 MB</p>
        {hasAvatar ? (
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
    </div>
  );
}
