import { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, Keyboard } from 'lucide-react';
import jsQR from 'jsqr';
import { fieldClasses } from './assetUi';

/**
 * Kamera-Scanner (AS-6) für QR-Etiketten und Code128 — plus Handeingabe
 * (Handscanner tippen wie eine Tastatur und schicken Enter).
 *
 * Erkennung: native BarcodeDetector-API (Chrome/Android, Safari ab 17),
 * sonst jsQR (nur QR) über ein Canvas. Kamera braucht HTTPS bzw. localhost.
 */
interface BarcodeDetectorLike {
  detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>;
}
type BarcodeDetectorCtor = new (opts: { formats: string[] }) => BarcodeDetectorLike;

interface CodeScannerProps {
  onCode: (code: string) => void;
  /** Pause nach einem Treffer, damit dasselbe Etikett nicht mehrfach zählt */
  cooldownMs?: number;
  autoStart?: boolean;
}

export const CodeScanner = ({ onCode, cooldownMs = 1500, autoStart = true }: CodeScannerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastRef = useRef<{ code: string; at: number }>({ code: '', at: 0 });
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState('');

  const cameraAvailable = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

  const emit = (code: string) => {
    const c = code.trim();
    if (!c) return;
    const now = Date.now();
    if (lastRef.current.code === c && now - lastRef.current.at < cooldownMs) return;
    lastRef.current = { code: c, at: now };
    if ('vibrate' in navigator) navigator.vibrate?.(60);
    onCodeRef.current(c);
  };

  const stop = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setActive(false);
  };

  const start = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setActive(true);
    } catch {
      setError('Kamera nicht verfügbar oder Zugriff verweigert – Code unten eintippen oder Handscanner nutzen.');
      setActive(false);
    }
  };

  // Erkennungsschleife
  useEffect(() => {
    if (!active) return;
    let stopped = false;
    const Ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
    let detector: BarcodeDetectorLike | null = null;
    try { detector = Ctor ? new Ctor({ formats: ['qr_code', 'code_128'] }) : null; } catch { detector = null; }

    const tick = async () => {
      if (stopped) return;
      const video = videoRef.current;
      if (video && video.readyState >= 2 && video.videoWidth > 0) {
        try {
          if (detector) {
            const found = await detector.detect(video);
            if (found[0]?.rawValue) emit(found[0].rawValue);
          } else {
            if (!canvasRef.current) canvasRef.current = document.createElement('canvas');
            const canvas = canvasRef.current;
            const w = Math.min(640, video.videoWidth);
            const h = Math.round(video.videoHeight * (w / video.videoWidth));
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (ctx) {
              ctx.drawImage(video, 0, 0, w, h);
              const img = ctx.getImageData(0, 0, w, h);
              const qr = jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' });
              if (qr?.data) emit(qr.data);
            }
          }
        } catch { /* einzelner Frame fehlgeschlagen */ }
      }
      if (!stopped) window.setTimeout(tick, 200);
    };
    tick();
    return () => { stopped = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  useEffect(() => {
    if (autoStart && cameraAvailable) start();
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-3">
      {cameraAvailable && (
        <div className="relative rounded-xl overflow-hidden bg-black aspect-[4/3] max-h-[50vh] mx-auto">
          <video ref={videoRef} playsInline muted className={`w-full h-full object-cover ${active ? '' : 'opacity-0'}`} />
          {active ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="w-1/2 aspect-square rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
            </div>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center">
              {error && <p className="text-sm text-white/80">{error}</p>}
              <button type="button" onClick={start}
                className="inline-flex items-center gap-2 rounded-xl bg-white/15 hover:bg-white/25 text-white px-4 py-2 text-sm">
                <Camera size={16} /> Kamera starten
              </button>
            </div>
          )}
          {active && (
            <button type="button" onClick={stop} title="Kamera aus"
              className="absolute top-2 right-2 rounded-lg bg-black/50 text-white p-2 hover:bg-black/70">
              <CameraOff size={16} />
            </button>
          )}
        </div>
      )}
      <form onSubmit={e => { e.preventDefault(); emit(manual); setManual(''); lastRef.current = { code: '', at: 0 }; }}
        className="flex gap-2">
        <div className="relative flex-1">
          <Keyboard size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className={`${fieldClasses} pl-9`} value={manual} onChange={e => setManual(e.target.value)}
            placeholder="Asset-ID, Seriennr. oder Handscanner" autoFocus={!cameraAvailable} aria-label="Code eingeben" />
        </div>
        <button type="submit"
          className="px-4 rounded-xl bg-accent-primary text-white text-sm font-medium hover:bg-accent-dark disabled:opacity-50"
          disabled={!manual.trim()}>
          OK
        </button>
      </form>
    </div>
  );
};
