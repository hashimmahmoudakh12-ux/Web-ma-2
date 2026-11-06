"use client";
/**
 * Camera QR scanner for Wallet passes (works on iPad Safari + Android).
 * Uses jsQR to read frames from the tablet's camera.
 * A USB/Bluetooth scanner also works without opening this (see Counter).
 */
import jsQR from "jsqr";
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function Scanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let done = false;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    const tick = () => {
      const v = video.current;
      if (!done && v && ctx && v.readyState === v.HAVE_ENOUGH_DATA) {
        canvas.width = v.videoWidth;
        canvas.height = v.videoHeight;
        ctx.drawImage(v, 0, 0);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const qr = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
        if (qr?.data?.toUpperCase().startsWith("STRK:")) {
          done = true;
          onCode(qr.data);
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    };

    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "user" }, audio: false })
      .then((s) => {
        stream = s;
        if (video.current) {
          video.current.srcObject = s;
          void video.current.play();
          raf = requestAnimationFrame(tick);
        }
      })
      .catch(() => setError("Camera not available. Allow camera access in Settings, or type the phone number instead."));

    return () => {
      done = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onCode]);

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/80 p-4" role="dialog" aria-modal="true" aria-label="Scan pass">
      <div className="animate-pop relative w-full max-w-lg rounded-3xl bg-brand-surface p-5 text-center">
        <button type="button" onClick={onClose} className="absolute right-4 top-4 rounded-full bg-brand-bg p-2" aria-label="Close scanner">
          <X className="h-5 w-5" />
        </button>
        <h2 className="text-xl font-semibold">Hold your Wallet pass up to the camera</h2>
        <div className="relative mt-4 overflow-hidden rounded-2xl bg-black">
          <video ref={video} playsInline muted className="aspect-[4/3] w-full -scale-x-100 object-cover" />
          <div className="pointer-events-none absolute inset-[18%] rounded-2xl border-4 border-brand-primary/80" />
        </div>
        {error && <p className="mt-3 text-red-400">{error}</p>}
      </div>
    </div>
  );
}
