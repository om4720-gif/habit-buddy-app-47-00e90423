import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Folder,
  FolderPlus,
  Loader2,
  RotateCcw,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { toast } from "sonner";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createCoursePhotoThumbnail,
  deleteCoursePhotoThumbnail,
  getCoursePhotoThumbnail,
  saveCoursePhotoThumbnail,
} from "@/lib/course-photo-cache";

type Photo = { id: string; path: string; url: string; folder_name: string | null; owner_id: string };
type Folder = { id: string; name: string };

/** Makes a photo at most 1800px on its long side, as JPEG, so uploads and loading stay fast. */
async function shrinkImage(file: File): Promise<Blob | File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 1_500_000) {
      bitmap.close();
      return file;
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

export function CoursePhotos({ courseId }: { courseId: string }) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const touchX = useRef<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [folder, setFolder] = useState<string | null>(null);
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<string, string>>({});
  const pinchActive = useRef(false);
  const zoomedRef = useRef(false); // true while the photo is zoomed in: then drags pan, never swipe
  const lastPointer = useRef<string | null>(null); // "touch", "pen" or "mouse": only fingers may swipe

  const key = ["course-photos", courseId];
  const foldersKey = ["course-photo-folders", courseId];

  const { data: photos = [] } = useQuery({
    queryKey: key,
    queryFn: async (): Promise<Photo[]> => {
      const { data: userData } = await supabase.auth.getUser();
      const ownerId = userData.user?.id;
      if (!ownerId) return [];
      const { data, error } = await supabase
        .from("course_photos")
        .select("id, path, folder_name")
        .eq("course_id", courseId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      if (!data?.length) return [];
      const { data: signed } = await supabase.storage
        .from("course-photos")
        .createSignedUrls(data.map((p) => p.path), 60 * 60);
      return data.map((p, i) => ({
        ...p,
        folder_name: p.folder_name ?? null,
        owner_id: ownerId,
        url: signed?.[i]?.signedUrl ?? "",
      }));
    },
    staleTime: 30 * 60 * 1000,
  });

  const { data: folders = [] } = useQuery({
    queryKey: foldersKey,
    queryFn: async (): Promise<Folder[]> => {
      const { data, error } = await supabase
        .from("course_photo_folders")
        .select("id, name")
        .eq("course_id", courseId)
        .order("name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30 * 60 * 1000,
  });

  const inFolder = folder == null ? [] : photos.filter((p) => p.folder_name === folder);
  const open = openIdx != null && openIdx < inFolder.length ? inFolder[openIdx] : null;
  const unsorted = photos.filter((p) => p.folder_name == null);

  useEffect(() => {
    let cancelled = false;
    const objectUrls = new Set<string>();
    const photosToCache = folder == null
      ? [...unsorted, ...folders
          .map((item) => photos.find((photo) => photo.folder_name === item.name))
          .filter((photo): photo is Photo => photo != null)]
      : inFolder;

    setThumbnailUrls({});
    // Download and convert at most 3 photos at a time, so opening a course doesn't pull every original at once.
    const cacheOne = async (photo: (typeof photosToCache)[number]) => {
        let cached: Blob | null = null;
        try {
          cached = await getCoursePhotoThumbnail(photo.owner_id, photo.id);
          if (cached && !cancelled) {
            const localUrl = URL.createObjectURL(cached);
            objectUrls.add(localUrl);
            setThumbnailUrls((current) => ({ ...current, [photo.id]: localUrl }));
          }
        } catch {
          // Local storage can be disabled or full; online photos still work.
        }

        if (cancelled || !navigator.onLine || !photo.url) return;
        try {
          const response = await fetch(photo.url);
          if (!response.ok) return;
          const thumbnail = await createCoursePhotoThumbnail(await response.blob());
          await saveCoursePhotoThumbnail(photo.owner_id, photo.id, thumbnail);
          if (!cancelled && !cached) {
            const localUrl = URL.createObjectURL(thumbnail);
            objectUrls.add(localUrl);
            setThumbnailUrls((current) => ({ ...current, [photo.id]: localUrl }));
          }
        } catch {
          // Preserve the online image if local thumbnail caching is unavailable.
        }
    };
    let nextIndex = 0;
    const runNext = async (): Promise<void> => {
      while (!cancelled && nextIndex < photosToCache.length) {
        const photo = photosToCache[nextIndex++]!;
        await cacheOne(photo);
      }
    };
    for (let i = 0; i < 3; i++) void runNext();

    return () => {
      cancelled = true;
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [photos, folder, folders]);

  function step(delta: number) {
    setOpenIdx((i) => {
      if (i == null || inFolder.length === 0) return i;
      return (i + delta + inFolder.length) % inFolder.length;
    });
  }

  useEffect(() => {
    if (openIdx == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "ArrowRight") step(1);
      else if (e.key === "Escape") setOpenIdx(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openIdx, inFolder.length]);

  async function createFolder() {
    const name = newName.trim();
    if (!name) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("course_photo_folders")
        .insert({ course_id: courseId, name });
      if (error) throw error;
      setNewName("");
      setAdding(false);
      toast.success("Folder created");
      qc.invalidateQueries({ queryKey: foldersKey });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create folder");
    } finally {
      setSaving(false);
    }
  }

  async function deleteFolder() {
    const name = folder;
    if (name == null) return;
    try {
      const { error } = await supabase
        .from("course_photo_folders")
        .delete()
        .eq("course_id", courseId)
        .eq("name", name);
      if (error) throw error;
      await supabase
        .from("course_photos")
        .update({ folder_name: null })
        .eq("course_id", courseId)
        .eq("folder_name", name);
      setFolder(null);
      toast.success("Folder removed — photos kept");
      qc.invalidateQueries({ queryKey: foldersKey });
      qc.invalidateQueries({ queryKey: key });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove folder");
    } finally {
      setConfirmDelete(false);
    }
  }

  async function upload(files: FileList | null) {
    if (!files?.length || folder == null) return;
    setUploading(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Please sign in");
      for (const file of Array.from(files)) {
        const shrunk = await shrinkImage(file);
        const ext = shrunk.type === "image/jpeg" ? "jpg" : file.name.split(".").pop() || "jpg";
        const path = `${u.user.id}/${courseId}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("course-photos")
          .upload(path, shrunk, { contentType: shrunk.type });
        if (upErr) throw upErr;
        const { error } = await supabase.from("course_photos").insert({
          course_id: courseId,
          path,
          folder_name: folder,
        });
        if (error) throw error;
      }
      toast.success("Photo saved");
      qc.invalidateQueries({ queryKey: key });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove(p: Photo) {
    await supabase.storage.from("course-photos").remove([p.path]);
    await supabase.from("course_photos").delete().eq("id", p.id);
    await deleteCoursePhotoThumbnail(p.owner_id, p.id).catch(() => undefined);
    setOpenIdx(null);
    qc.invalidateQueries({ queryKey: key });
  }

  function tile(name: string | null, label?: string) {
    const items =
      name == null ? unsorted : photos.filter((p) => p.folder_name === name);
    return (
      <button
        key={label ?? name ?? "unsorted"}
        onClick={() => {
          setFolder(name);
          setConfirmDelete(false);
        }}
        className="flex min-w-0 items-start gap-3 rounded-xl border border-line bg-surface px-3 py-2.5 text-left transition-colors hover:border-accent/40"
      >
        <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-surface-2">
          {items[0]?.url ? (
            <img src={thumbnailUrls[items[0].id] ?? items[0].url} alt="" loading="lazy" className="size-full object-cover" />
          ) : (
            <Folder className="size-4 text-ink-soft" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block whitespace-normal break-words text-sm font-medium">{label ?? name}</span>
          <span className="block text-[11px] text-ink-soft">
            {items.length} {items.length === 1 ? "photo" : "photos"}
          </span>
        </span>
      </button>
    );
  }

  return (
    <div className="border-t border-line px-5 py-4">
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p className="flex min-w-0 items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-ink-soft">
          {folder != null && (
            <button
              onClick={() => {
                setFolder(null);
                setConfirmDelete(false);
              }}
              aria-label="Back to folders"
              className="flex size-6 shrink-0 items-center justify-center rounded-full border border-line text-ink-soft hover:border-accent/40"
            >
              <ChevronLeft className="size-3.5" />
            </button>
          )}
          <span className="whitespace-normal break-words">
            {folder ?? `Tutorial photos · ${photos.length}`}
          </span>
        </p>
        {folder != null && (
          <div className="flex flex-wrap items-center justify-end gap-2 sm:shrink-0">
            {confirmDelete ? (
              <Button size="sm" variant="destructive" onClick={deleteFolder}>
                Remove folder?
              </Button>
            ) : (
              <Button
                size="icon"
                variant="ghost"
                aria-label="Remove folder"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="size-4" />
              </Button>
            )}
            <Button size="sm" variant="outline" disabled={uploading} onClick={() => inputRef.current?.click()}>
              {uploading ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Camera className="mr-1 size-4" />}
              Add photo
            </Button>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => upload(e.target.files)}
        />
      </div>

      {folder == null && (
        <>
          {folders.length === 0 && unsorted.length === 0 && (
            <p className="mb-3 rounded-xl border border-dashed border-line px-3 py-4 text-xs text-ink-soft">
              No folders yet — create one like "Tut 1" to start saving photos.
            </p>
          )}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {folders.map((f) => tile(f.name))}
            {unsorted.length > 0 && tile(null, "Unsorted")}
            {adding ? (
              <div className="col-span-full flex items-center gap-2">
                <Input
                  autoFocus
                  value={newName}
                  placeholder="Folder name, e.g. Tut 1"
                  className="h-9"
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && createFolder()}
                />
                <Button size="sm" disabled={saving || !newName.trim()} onClick={createFolder}>
                  {saving ? <Loader2 className="size-4 animate-spin" /> : "Create"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setNewName(""); }}>
                  Cancel
                </Button>
              </div>
            ) : (
              <button
                onClick={() => setAdding(true)}
                className="flex items-center gap-3 rounded-xl border border-dashed border-line px-3 py-2.5 text-left text-sm text-ink-soft transition-colors hover:border-accent/40"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-2">
                  <FolderPlus className="size-4" />
                </span>
                New folder
              </button>
            )}
          </div>
        </>
      )}

      {folder != null && (
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
          {inFolder.length === 0 && (
            <p className="col-span-full py-2 text-xs text-ink-soft">
              Empty — tap "Add photo" to take or pick photos for this folder.
            </p>
          )}
          {inFolder.map((p, i) => (
            <div key={p.id} className="group relative aspect-square overflow-hidden rounded-lg border border-line">
              <button onClick={() => setOpenIdx(i)} className="size-full">
                <img src={thumbnailUrls[p.id] ?? p.url} alt="Tutorial photo" loading="lazy" className="size-full object-cover" />
              </button>
              <button
                onClick={() => remove(p)}
                aria-label="Delete photo"
                className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-ink/70 text-background"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-ink/85 p-4"
            onClick={(e) => {
              // Close only when the dark background itself is tapped, not the photo or its controls.
              if (e.target === e.currentTarget) setOpenIdx(null);
            }}
            onPointerDown={(e) => {
              lastPointer.current = e.pointerType;
            }}
            onTouchStart={(e) => {
              if (lastPointer.current !== "touch" || zoomedRef.current) {
                touchX.current = null; // a pen, a mouse, or a zoomed photo never changes the photo
                return;
              }
              if (e.touches.length > 1) {
                pinchActive.current = true;
                touchX.current = null;
                return;
              }
              touchX.current = e.changedTouches[0]?.clientX ?? null;
            }}
            onTouchEnd={(e) => {
              if (pinchActive.current) {
                if (e.touches.length === 0) pinchActive.current = false;
                touchX.current = null;
                return;
              }
              if (lastPointer.current !== "touch" || zoomedRef.current) {
                touchX.current = null;
                return;
              }
              const endX = e.changedTouches[0]?.clientX;
              if (touchX.current == null || endX == null) return;
              const dx = endX - touchX.current;
              touchX.current = null;
              if (Math.abs(dx) > 40) step(dx < 0 ? 1 : -1);
            }}
            onTouchCancel={() => {
              pinchActive.current = false;
              touchX.current = null;
            }}
          >
            <TransformWrapper
              key={open.id}
              onTransform={(_ref: unknown, state: { scale: number }) => {
                zoomedRef.current = state.scale > 1.01;
              }}
              initialScale={1}
              minScale={1}
              maxScale={5}
              centerOnInit
              fitOnInit
              limitToBounds
              pinch={{ allowPanning: true }}
              doubleClick={{ mode: "toggle" }}
              onPinchStart={() => {
                pinchActive.current = true;
                touchX.current = null;
              }}
              onPinchStop={() => {
                window.setTimeout(() => { pinchActive.current = false; }, 0);
              }}
            >
              {({ zoomIn, zoomOut, resetTransform }) => (
                <>
                  <TransformComponent
                    wrapperStyle={{ width: "min(100%, 900px)", height: "85vh", touchAction: "none" }}
                    contentStyle={{ width: "100%", height: "100%", justifyContent: "center", alignItems: "center" }}
                  >
                    <img
                      src={open.url}
                      alt="Tutorial photo"
                      className="max-h-[85vh] max-w-full rounded-lg object-contain"
                      onClick={(e) => e.stopPropagation()}
                      onError={(e) => {
                        const local = thumbnailUrls[open.id];
                        if (local && e.currentTarget.src !== local) e.currentTarget.src = local;
                      }}
                    />
                  </TransformComponent>
                  <div className="absolute bottom-5 right-4 flex gap-2" onClick={(e) => e.stopPropagation()}>
                    <Button size="icon" variant="secondary" aria-label="Zoom in" title="Zoom in" onClick={() => zoomIn()}>
                      <ZoomIn className="size-4" />
                    </Button>
                    <Button size="icon" variant="secondary" aria-label="Zoom out" title="Zoom out" onClick={() => zoomOut()}>
                      <ZoomOut className="size-4" />
                    </Button>
                    <Button size="icon" variant="secondary" aria-label="Reset zoom" title="Reset zoom" onClick={() => resetTransform()}>
                      <RotateCcw className="size-4" />
                    </Button>
                  </div>
                </>
              )}
            </TransformWrapper>

            {inFolder.length > 1 && (
              <>
                <Button
                  size="icon"
                  variant="secondary"
                  aria-label="Previous photo"
                  className="absolute left-3 top-1/2 -translate-y-1/2"
                  onClick={(e) => {
                    e.stopPropagation();
                    step(-1);
                  }}
                >
                  <ChevronLeft className="size-5" />
                </Button>
                <Button
                  size="icon"
                  variant="secondary"
                  aria-label="Next photo"
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  onClick={(e) => {
                    e.stopPropagation();
                    step(1);
                  }}
                >
                  <ChevronRight className="size-5" />
                </Button>
                <p className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-ink/70 px-3 py-1 text-xs text-background">
                  {(openIdx ?? 0) + 1} / {inFolder.length}
                </p>
              </>
            )}

            <div className="absolute right-4 top-4 flex gap-2" onClick={(e) => e.stopPropagation()}>
              <Button size="sm" variant="destructive" onClick={() => remove(open)}>
                Delete
              </Button>
              <Button size="icon" variant="secondary" onClick={() => setOpenIdx(null)}>
                <X className="size-4" />
              </Button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
