"use client";

import * as React from "react";
import { Loader2, Minus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/** On-screen square editing viewport (px). */
const VIEWPORT = 288;
/** Exported avatar resolution (square, px). */
const OUTPUT = 512;
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

type AvatarCropperDialogProps = {
  open: boolean;
  /** The image the user picked; a new object URL is created per file. */
  file: File | null;
  /** True while the cropped result is being uploaded (keeps the dialog open). */
  busy?: boolean;
  onCancel: () => void;
  onCropped: (blob: Blob) => void;
};

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export function AvatarCropperDialog({
  open,
  file,
  busy = false,
  onCancel,
  onCropped,
}: AvatarCropperDialogProps) {
  const imgRef = React.useRef<HTMLImageElement>(null);
  const [url, setUrl] = React.useState<string | null>(null);
  const [natural, setNatural] = React.useState<{ w: number; h: number } | null>(
    null,
  );
  const [zoom, setZoom] = React.useState(1);
  const [offset, setOffset] = React.useState({ x: 0, y: 0 });

  const drag = React.useRef<{
    startX: number;
    startY: number;
    baseX: number;
    baseY: number;
  } | null>(null);

  // Create / revoke the object URL for the selected file.
  React.useEffect(() => {
    if (!file) {
      setUrl(null);
      return;
    }
    const next = URL.createObjectURL(file);
    setUrl(next);
    setNatural(null);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    return () => URL.revokeObjectURL(next);
  }, [file]);

  const baseScale = natural
    ? Math.max(VIEWPORT / natural.w, VIEWPORT / natural.h)
    : 1;
  const scale = baseScale * zoom;
  const dw = natural ? natural.w * scale : VIEWPORT;
  const dh = natural ? natural.h * scale : VIEWPORT;

  const clampOffset = React.useCallback(
    (x: number, y: number, w: number, h: number) => ({
      x: clamp(x, VIEWPORT - w, 0),
      y: clamp(y, VIEWPORT - h, 0),
    }),
    [],
  );

  const handleImageLoad = () => {
    const el = imgRef.current;
    if (!el) return;
    const w = el.naturalWidth;
    const h = el.naturalHeight;
    setNatural({ w, h });
    const bScale = Math.max(VIEWPORT / w, VIEWPORT / h);
    const ndw = w * bScale;
    const ndh = h * bScale;
    // Center the image in the viewport.
    setOffset({ x: (VIEWPORT - ndw) / 2, y: (VIEWPORT - ndh) / 2 });
  };

  const applyZoom = (nextZoom: number) => {
    const z = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
    if (!natural) {
      setZoom(z);
      return;
    }
    const newScale = baseScale * z;
    const newDw = natural.w * newScale;
    const newDh = natural.h * newScale;
    // Keep the viewport centre pinned while zooming.
    const cx = (VIEWPORT / 2 - offset.x) / scale;
    const cy = (VIEWPORT / 2 - offset.y) / scale;
    const nx = VIEWPORT / 2 - cx * newScale;
    const ny = VIEWPORT / 2 - cy * newScale;
    setZoom(z);
    setOffset(clampOffset(nx, ny, newDw, newDh));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!natural) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = {
      startX: e.clientX,
      startY: e.clientY,
      baseX: offset.x,
      baseY: offset.y,
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const nx = drag.current.baseX + (e.clientX - drag.current.startX);
    const ny = drag.current.baseY + (e.clientY - drag.current.startY);
    setOffset(clampOffset(nx, ny, dw, dh));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (drag.current) {
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
      drag.current = null;
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    if (!natural) return;
    applyZoom(zoom - e.deltaY * 0.002);
  };

  const handleSave = () => {
    const el = imgRef.current;
    if (!el || !natural) return;
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT;
    canvas.height = OUTPUT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Map the viewport back onto source-image pixels.
    const sSize = VIEWPORT / scale;
    const sx = (0 - offset.x) / scale;
    const sy = (0 - offset.y) / scale;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(el, sx, sy, sSize, sSize, 0, 0, OUTPUT, OUTPUT);
    canvas.toBlob(
      (blob) => {
        if (blob) onCropped(blob);
      },
      "image/jpeg",
      0.9,
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v && !busy) onCancel();
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Adjust your photo</DialogTitle>
          <DialogDescription>
            Drag to reposition and use the slider to zoom. The circle shows how it
            will be cropped.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4">
          <div
            className="relative touch-none overflow-hidden rounded-lg bg-muted select-none"
            style={{ width: VIEWPORT, height: VIEWPORT }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onWheel={onWheel}
          >
            {url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                ref={imgRef}
                src={url}
                alt=""
                draggable={false}
                onLoad={handleImageLoad}
                className={cn(
                  "pointer-events-none absolute max-w-none",
                  natural ? "cursor-grab" : "opacity-0",
                )}
                style={{
                  left: offset.x,
                  top: offset.y,
                  width: dw,
                  height: dh,
                }}
              />
            ) : null}
            {/* Circular crop mask: darken everything OUTSIDE the circle via a
                large outset shadow on a circular element (container clips it). */}
            <div
              className="pointer-events-none absolute inset-0 rounded-full border-2 border-white/70"
              style={{ boxShadow: "0 0 0 9999px rgba(0,0,0,0.5)" }}
            />
          </div>

          <div className="flex w-full items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="Zoom out"
              disabled={!natural || zoom <= MIN_ZOOM}
              onClick={() => applyZoom(zoom - 0.25)}
            >
              <Minus className="size-4" />
            </Button>
            <input
              type="range"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={0.01}
              value={zoom}
              disabled={!natural}
              onChange={(e) => applyZoom(parseFloat(e.target.value))}
              aria-label="Zoom"
              className="h-1.5 w-full cursor-pointer accent-primary"
            />
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="Zoom in"
              disabled={!natural || zoom >= MAX_ZOOM}
              onClick={() => applyZoom(zoom + 0.25)}
            >
              <Plus className="size-4" />
            </Button>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={!natural || busy}
            className="gap-1.5"
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : null}
            {busy ? "Uploading…" : "Save photo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
