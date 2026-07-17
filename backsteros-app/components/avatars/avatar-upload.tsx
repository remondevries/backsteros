"use client";

import { useEffect, useRef, useState, useTransition } from "react";

type AvatarActionResult = { ok: true } | { ok: false; error: string };

type AvatarUploadProps = {
  displayName: string;
  avatarSrc: string | null;
  onUpload: (file: File) => Promise<AvatarActionResult>;
  onRemove: () => Promise<AvatarActionResult>;
  onSuccess?: () => void;
};

function AvatarPlaceholder({ name }: { name: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";

  return (
    <span
      aria-hidden="true"
      className="flex h-full w-full items-center justify-center bg-white/[0.08] text-2xl font-medium text-foreground/70"
    >
      {initial}
    </span>
  );
}

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
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setImageFailed(false);
  }, [avatarSrc]);

  const hasAvatar = Boolean(avatarSrc);
  const showImage = Boolean(avatarSrc) && !imageFailed;

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    setError(null);

    startTransition(async () => {
      const result = await onUpload(file);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      onSuccess?.();
    });
  }

  function handleRemove() {
    setError(null);

    startTransition(async () => {
      const result = await onRemove();

      if (!result.ok) {
        setError(result.error);
        return;
      }

      onSuccess?.();
    });
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative">
        <button
          type="button"
          className={[
            "group relative h-24 w-24 overflow-hidden rounded-full bg-white/[0.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 disabled:cursor-not-allowed disabled:opacity-60",
            showImage ? "border-0" : "border border-white/10",
          ].join(" ")}
          onClick={() => fileInputRef.current?.click()}
          disabled={isPending}
          aria-label={hasAvatar ? "Change avatar" : "Upload avatar"}
        >
          {showImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarSrc!}
              alt=""
              className="h-full w-full object-cover"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <AvatarPlaceholder name={displayName} />
          )}
          <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            {isPending ? "Saving…" : "Change"}
          </span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif"
          className="hidden"
          onChange={handleFileChange}
          disabled={isPending}
        />
      </div>

      <div className="flex flex-col items-center gap-1 text-center">
        <p className="text-xs text-foreground/45">
          JPG, PNG, WebP, or GIF up to 5 MB
        </p>

        {hasAvatar ? (
          <button
            type="button"
            className="text-xs text-foreground/60 underline-offset-2 hover:text-foreground hover:underline disabled:opacity-60"
            onClick={handleRemove}
            disabled={isPending}
          >
            Remove avatar
          </button>
        ) : null}

        {error ? (
          <p className="max-w-xs text-xs text-red-400" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
