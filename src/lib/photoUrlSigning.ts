import type { SupabaseClient } from "@supabase/supabase-js";

export const PROFILE_PHOTO_SIGNED_URL_TTL_SECONDS = 60 * 60;

export type PhotoStorageRow = {
  id: string;
  user_id?: string | null;
  storage_bucket?: string | null;
  storage_path?: string | null;
};

export type SignedPhotoUrlPayload = {
  thumbPath: string | null;
  fullPath: string | null;
  thumbUrl: string | null;
  imageUrl: string | null;
  displayUrl: string | null;
  fallbackUrl: string | null;
  signed_url: string | null;
  photoUrlError: string | null;
};

export function makeThumbPath(storagePath: string) {
  const lastSlash = storagePath.lastIndexOf("/");
  if (lastSlash === -1) return `thumbs/${storagePath}`;

  const folder = storagePath.slice(0, lastSlash);
  const fileName = storagePath.slice(lastSlash + 1);

  return `${folder}/thumbs/${fileName}`;
}

export async function signProfilePhotoUrls(
  supabaseAdmin: SupabaseClient,
  photo: PhotoStorageRow,
  expiresInSeconds = PROFILE_PHOTO_SIGNED_URL_TTL_SECONDS,
): Promise<SignedPhotoUrlPayload> {
  const bucket = photo.storage_bucket ?? "profile-photos";
  const fullPath = photo.storage_path ?? null;
  const thumbPath = fullPath ? makeThumbPath(fullPath) : null;

  let thumbUrl: string | null = null;
  let imageUrl: string | null = null;
  let thumbError: string | null = null;
  let fullError: string | null = null;

  if (thumbPath) {
    const { data, error } = await supabaseAdmin.storage
      .from(bucket)
      .createSignedUrl(thumbPath, expiresInSeconds);

    thumbUrl = data?.signedUrl ?? null;
    thumbError = error?.message ?? null;
  }

  if (fullPath) {
    const { data, error } = await supabaseAdmin.storage
      .from(bucket)
      .createSignedUrl(fullPath, expiresInSeconds);

    imageUrl = data?.signedUrl ?? null;
    fullError = error?.message ?? null;
  }

  const displayUrl = thumbUrl || imageUrl;
  const fallbackUrl = imageUrl;
  const photoUrlError = displayUrl ? null : thumbError ?? fullError;

  console.log("profile photo signed URL debug", {
    photoId: photo.id,
    userId: photo.user_id ?? null,
    storage_bucket: bucket,
    storage_path: fullPath,
    calculatedThumbPath: thumbPath,
    thumbSignedUrlCreated: !!thumbUrl,
    fullSignedUrlCreated: !!imageUrl,
    thumbError,
    fullError,
  });

  return {
    thumbPath,
    fullPath,
    thumbUrl,
    imageUrl,
    displayUrl,
    fallbackUrl,
    signed_url: displayUrl,
    photoUrlError,
  };
}

export async function signProfilePhotoRows<T extends PhotoStorageRow>(
  supabaseAdmin: SupabaseClient,
  photos: T[],
  expiresInSeconds = PROFILE_PHOTO_SIGNED_URL_TTL_SECONDS,
): Promise<Array<T & SignedPhotoUrlPayload>> {
  return Promise.all(
    photos.map(async (photo) => ({
      ...photo,
      ...(await signProfilePhotoUrls(supabaseAdmin, photo, expiresInSeconds)),
    })),
  );
}
