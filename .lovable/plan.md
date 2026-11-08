# Mobile study gestures and offline photo notes

## What will change
- On lecture and tutorial rows, a clear right swipe toggles studied status using the current update flow; existing tap controls remain available.
- A left swipe reveals the existing rename action and a quick way into that course’s Photos & notes. Photos remain organized by course and folder, not newly linked to individual lectures.
- The photo viewer gains mobile pinch-to-zoom and panning while keeping its current next/previous, close, and keyboard controls.
- Photo thumbnails viewed while online are saved locally so previously visited course folders can still show thumbnails offline. Full-resolution originals are not promised offline unless cached separately.

## Implementation approach
- Add horizontal swipe handling to lecture/tutorial rows with movement thresholds, vertical-scroll protection, and accessible existing button alternatives; reuse current mutation handlers.
- Use a maintained pinch/zoom interaction library for the photo viewer and prevent pinch gestures from triggering the viewer’s existing swipe-to-next behavior.
- Store compressed thumbnail bytes in browser IndexedDB, keyed per signed-in user and photo; prefer local bytes offline, refresh them when online, and remove them when a photo is deleted. Storage quota failures should fall back to online images without breaking the gallery.
- Keep the existing private course-photo storage and permissions; no schema migration or new photo-sharing behavior is planned.

## Technical notes
- Relevant existing areas are `src/routes/_authenticated/uni.tsx` (course rows and study updates) and `src/components/CoursePhotos.tsx` (photo folders and viewer). React Query already persists page data, but not image bytes.
- Verify swipe directions and existing controls on mobile, plus zoom, photo navigation, thumbnail reload, deletion, and offline display after an online visit.
