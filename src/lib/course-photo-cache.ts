const DB_NAME = "ritual-course-photo-thumbnails";
const STORE_NAME = "thumbnails";
const MAX_THUMBNAILS = 400;
const THUMBNAIL_WIDTH = 480;

type ThumbnailRecord = {
  key: string;
  ownerId: string;
  photoId: string;
  blob: Blob;
  savedAt: number;
};

function openThumbnailDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("Local photo storage is unavailable"));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "key" });
        store.createIndex("ownerId", "ownerId");
        store.createIndex("savedAt", "savedAt");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open local photo storage"));
  });
}

function recordKey(ownerId: string, photoId: string) {
  return `${ownerId}:${photoId}`;
}

export async function getCoursePhotoThumbnail(
  ownerId: string,
  photoId: string,
): Promise<Blob | null> {
  const db = await openThumbnailDb();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(
        recordKey(ownerId, photoId),
      );
      request.onsuccess = () => resolve((request.result as ThumbnailRecord | undefined)?.blob ?? null);
      request.onerror = () => reject(request.error ?? new Error("Could not read saved photo"));
    });
  } finally {
    db.close();
  }
}

export async function saveCoursePhotoThumbnail(
  ownerId: string,
  photoId: string,
  blob: Blob,
): Promise<void> {
  const db = await openThumbnailDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      store.put({
        key: recordKey(ownerId, photoId),
        ownerId,
        photoId,
        blob,
        savedAt: Date.now(),
      } satisfies ThumbnailRecord);
      const allRequest = store.getAll();
      allRequest.onsuccess = () => {
        const records = (allRequest.result as ThumbnailRecord[])
          .sort((a, b) => a.savedAt - b.savedAt);
        for (const record of records.slice(0, Math.max(0, records.length - MAX_THUMBNAILS))) {
          store.delete(record.key);
        }
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Could not save photo locally"));
      transaction.onabort = () => reject(transaction.error ?? new Error("Photo storage is full"));
    });
  } finally {
    db.close();
  }
}

export async function deleteCoursePhotoThumbnail(ownerId: string, photoId: string): Promise<void> {
  const db = await openThumbnailDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const request = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).delete(
        recordKey(ownerId, photoId),
      );
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error("Could not remove saved photo"));
    });
  } finally {
    db.close();
  }
}

export async function createCoursePhotoThumbnail(source: Blob): Promise<Blob> {
  if (typeof createImageBitmap === "undefined") {
    throw new Error("Photo thumbnails are not supported in this browser");
  }
  const bitmap = await createImageBitmap(source);
  try {
    const scale = Math.min(1, THUMBNAIL_WIDTH / bitmap.width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not prepare photo thumbnail");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Could not compress photo thumbnail"))),
        "image/jpeg",
        0.74,
      );
    });
  } finally {
    bitmap.close();
  }
}