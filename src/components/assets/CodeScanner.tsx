import { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, Keyboard } from 'lucide-react';
import { fieldClasses } from './assetUi';

/**
 * Kamera-Scanner (AS-6) für QR-Etiketten und Code128 — plus Handeingabe
 * (Handscanner tippen wie eine Tastatur und schicken Enter).
 *
 * Erkennung: native BarcodeDetector-API (Chrome/Android), sonst ZXing
 * (iPhone/Safari — dort gibt es keinen BarcodeDetector; vorher las der
 * Rückfall jsQR NUR QR-Codes, Seriennummern-Strichcodes nie). Formate: QR,
 * Data Matrix, Code 128/39/93, EAN/UPC, ITF, Codabar. Ausgewertet wird nur der
 * Bereich im Sucherrahmen — bei Etiketten mit mehreren Codes (P/N, S/N, EAN)
 * zählt der, auf den man zielt. Kamera braucht HTTPS bzw. localhost.
 */
const WANTED_FORMATS = ['qr_code', 'data_matrix', 'code_128', 'code_39', 'code_93', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'itf', 'codabar'];
/** Sucherrahmen = ausgewerteter Bildausschnitt (Anteil an Breite/Höhe) */
const CROP_W = 0.86;
const CROP_H = 0.62;

type ZxingDecode = (lum: Uint8ClampedArray, w: number, h: number) => string | null;
let zxingPromise: Promise<ZxingDecode> | null = null;
/** ZXing erst bei Bedarf laden (eigener Chunk) */
const loadZxing = () => {
  zxingPromise ??= import('@zxing/library').then(Z => {
    const hints = new Map<import('@zxing/library').DecodeHintType, unknown>();
    hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [
      Z.BarcodeFormat.QR_CODE, Z.BarcodeFormat.DATA_MATRIX, Z.BarcodeFormat.CODE_128, Z.BarcodeFormat.CODE_39,
      Z.BarcodeFormat.CODE_93, Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.UPC_A,
      Z.BarcodeFormat.UPC_E, Z.BarcodeFormat.ITF, Z.BarcodeFormat.CODABAR,
    ]);
    hints.set(Z.DecodeHintType.TRY_HARDER, true);
    const reader = new Z.MultiFormatReader();
    reader.setHints(hints);
    return (lum: Uint8ClampedArray, w: number, h: number) => {
      try {
        const bitmap = new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.RGBLuminanceSource(lum, w, h)));
        return reader.decodeWithState(bitmap).getText() || null;
      } catch {
        return null; // nichts gefunden in diesem Bild
      } finally {
        reader.reset();
      }
    };
  });
  return zxingPromise;
};

/** RGBA → Graustufen (ZXing-Eingabe) */
const toLuminance = (data: Uint8ClampedArray) => {
  const lum = new Uint8ClampedArray(data.length / 4);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) lum[j] = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
  return lum;
};
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
    const Ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor & { getSupportedFormats?: () => Promise<string[]> } }).BarcodeDetector;
    let detector: BarcodeDetectorLike | null = null;
    let zxing: ZxingDecode | null = null;
    (async () => {
      if (Ctor) {
        try {
          const supported = Ctor.getSupportedFormats ? await Ctor.getSupportedFormats() : WANTED_FORMATS;
          const formats = WANTED_FORMATS.filter(f => supported.includes(f));
          // Fehlen Strichcode-Formate (manche Geräte können nur QR), lieber ZXing nehmen
          if (formats.includes('code_128') && formats.includes('code_39')) detector = new Ctor({ formats });
        } catch { detector = null; }
      }
      if (!detector) zxing = await loadZxing().catch(() => null);
    })();

    const tick = async () => {
      if (stopped) return;
      const video = videoRef.current;
      if (video && video.readyState >= 2 && video.videoWidth > 0 && (detector || zxing)) {
        try {
          // nur der Bereich im Sucherrahmen
          const vw = video.videoWidth, vh = video.videoHeight;
          const sw = Math.round(vw * CROP_W), sh = Math.round(vh * CROP_H);
          const sx = Math.round((vw - sw) / 2), sy = Math.round((vh - sh) / 2);
          const scale = Math.min(1, 1280 / sw);
          const w = Math.round(sw * scale), h = Math.round(sh * scale);
          if (!canvasRef.current) canvasRef.current = document.createElement('canvas');
          const canvas = canvasRef.current;
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (ctx) {
            ctx.drawImage(video, sx, sy, sw, sh, 0, 0, w, h);
            if (detector) {
              const found = await detector.detect(canvas);
              if (found[0]?.rawValue) emit(found[0].rawValue);
            } else if (zxing) {
              const text = zxing(toLuminance(ctx.getImageData(0, 0, w, h).data), w, h);
              if (text) emit(text);
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
              <div style={{ width: `${CROP_W * 100}%`, height: `${CROP_H * 100}%` }}
                className="rounded-xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)] flex items-end justify-center">
                <span className="mb-1 text-[11px] text-white/90 bg-black/40 rounded px-1.5">Strichcode oder QR in den Rahmen</span>
              </div>
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
