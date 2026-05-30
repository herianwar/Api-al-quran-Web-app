"use client";

import {
  AlertTriangle,
  Compass,
  Loader2,
  MapPin,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

const KAABA = { lat: 21.4225, lng: 39.8262 }; // Ka'bah, Makkah

interface Coords {
  lat: number;
  lng: number;
  accuracy?: number;
}

interface DeviceOrientationEventConstructorIOS {
  requestPermission?: () => Promise<"granted" | "denied">;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/** Initial bearing from (lat1, lng1) to (lat2, lng2) — degrees from North. */
function bearingTo(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dLambda = toRad(lng2 - lng1);
  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  const theta = Math.atan2(y, x);
  return (toDeg(theta) + 360) % 360;
}

/** Great-circle distance (km). */
function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dPhi = toRad(lat2 - lat1);
  const dLambda = toRad(lng2 - lng1);
  const a =
    Math.sin(dPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function cardinal(deg: number): string {
  const dirs = ["U", "TL", "T", "TG", "S", "BD", "B", "BL"];
  return dirs[Math.round(deg / 45) % 8];
}

export default function QiblaPage() {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [heading, setHeading] = useState<number | null>(null);
  const [needsOrientationPerm, setNeedsOrientationPerm] = useState(false);
  const cleanupRef = useRef<() => void>(() => {});

  const askLocation = useCallback(() => {
    setBusy(true);
    setError(null);
    if (!("geolocation" in navigator)) {
      setError("Browser tidak mendukung geolocation.");
      setBusy(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
        setBusy(false);
      },
      (err) => {
        setError(err.message || "Gagal mengambil lokasi");
        setBusy(false);
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }, []);

  const startOrientation = useCallback(() => {
    const handler = (e: DeviceOrientationEvent) => {
      const eAbs = e as DeviceOrientationEvent & { webkitCompassHeading?: number };
      let value: number | null = null;
      if (typeof eAbs.webkitCompassHeading === "number") {
        value = eAbs.webkitCompassHeading;
      } else if (typeof e.alpha === "number") {
        value = 360 - e.alpha;
      }
      if (value !== null) setHeading(value);
    };
    window.addEventListener("deviceorientationabsolute", handler as EventListener);
    window.addEventListener("deviceorientation", handler as EventListener);
    cleanupRef.current = () => {
      window.removeEventListener(
        "deviceorientationabsolute",
        handler as EventListener,
      );
      window.removeEventListener("deviceorientation", handler as EventListener);
    };
  }, []);

  const askOrientation = useCallback(async () => {
    const Ctor = (window as unknown as { DeviceOrientationEvent?: DeviceOrientationEventConstructorIOS })
      .DeviceOrientationEvent;
    if (Ctor?.requestPermission) {
      try {
        const result = await Ctor.requestPermission();
        if (result === "granted") {
          setNeedsOrientationPerm(false);
          startOrientation();
        } else {
          setError("Izin orientasi ditolak. Arah Kompas tidak tersedia.");
        }
      } catch {
        setError("Gagal meminta izin orientasi");
      }
    } else {
      startOrientation();
    }
  }, [startOrientation]);

  useEffect(() => {
    askLocation();
    // iOS Safari needs explicit permission for DeviceOrientation.
    const Ctor = (window as unknown as { DeviceOrientationEvent?: DeviceOrientationEventConstructorIOS })
      .DeviceOrientationEvent;
    if (Ctor?.requestPermission) {
      setNeedsOrientationPerm(true);
    } else {
      startOrientation();
    }
    return () => cleanupRef.current();
  }, [askLocation, startOrientation]);

  const qiblaBearing = coords
    ? bearingTo(coords.lat, coords.lng, KAABA.lat, KAABA.lng)
    : null;
  const distance = coords
    ? distanceKm(coords.lat, coords.lng, KAABA.lat, KAABA.lng)
    : null;
  const rotation =
    heading !== null && qiblaBearing !== null
      ? qiblaBearing - heading
      : qiblaBearing;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 space-y-6">
      <header className="flex items-center gap-3">
        <div className="h-10 w-10 grid place-items-center rounded-xl bg-emerald-100 text-emerald-700">
          <Compass size={20} />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Arah Kiblat</h1>
          <p className="text-sm text-slate-500">
            Penunjuk arah Ka&apos;bah dari lokasi Anda.
          </p>
        </div>
      </header>

      {error && (
        <div className="card p-4 flex items-start gap-3 text-amber-800 bg-amber-50 border-amber-200">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">Terjadi masalah</p>
            <p className="text-sm">{error}</p>
            <button
              onClick={askLocation}
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-amber-700 hover:underline"
            >
              <RefreshCw size={12} /> Coba lagi
            </button>
          </div>
        </div>
      )}

      {needsOrientationPerm && (
        <button
          onClick={askOrientation}
          className="w-full rounded-xl bg-amber-100 text-amber-800 border border-amber-200 px-4 py-3 text-sm font-semibold hover:bg-amber-200"
        >
          🧭 Aktifkan Kompas (klik untuk izinkan orientasi)
        </button>
      )}

      <section className="card p-4 sm:p-8 flex flex-col items-center">
        {busy && !coords && <Loader2 size={32} className="animate-spin text-emerald-700" />}
        {coords && (
          <>
            <div
              className="relative h-56 w-56 sm:h-64 sm:w-64 rounded-full bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200 grid place-items-center shadow-inner"
            >
              {/* Cardinal labels */}
              <span className="absolute top-2 left-1/2 -translate-x-1/2 text-xs font-bold text-slate-500">
                U
              </span>
              <span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs font-bold text-slate-400">
                S
              </span>
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                B
              </span>
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                T
              </span>

              <div
                className="absolute inset-0 transition-transform duration-200"
                style={{
                  transform: rotation !== null ? `rotate(${rotation}deg)` : undefined,
                }}
              >
                <div className="absolute left-1/2 top-2 -translate-x-1/2 flex flex-col items-center">
                  <div className="w-0 h-0 border-l-[12px] border-l-transparent border-r-[12px] border-r-transparent border-b-[24px] border-b-emerald-600" />
                  <span className="text-[10px] font-bold text-emerald-700 mt-1">
                    KIBLAT
                  </span>
                </div>
              </div>

              <div className="text-center">
                <Sparkles size={20} className="text-emerald-700 mx-auto" />
                <p className="text-3xl font-bold mt-1">
                  {qiblaBearing !== null ? `${Math.round(qiblaBearing)}°` : "—"}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {qiblaBearing !== null ? cardinal(qiblaBearing) : ""} dari Utara
                </p>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3 w-full text-center">
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs uppercase tracking-wider text-slate-400">
                  Jarak ke Ka&apos;bah
                </p>
                <p className="font-semibold text-slate-900">
                  {distance ? `${distance.toLocaleString("id-ID", { maximumFractionDigits: 0 })} km` : "—"}
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs uppercase tracking-wider text-slate-400">
                  Orientasi Perangkat
                </p>
                <p className="font-semibold text-slate-900">
                  {heading !== null ? `${Math.round(heading)}°` : "Tidak tersedia"}
                </p>
              </div>
            </div>
          </>
        )}
      </section>

      {coords && (
        <p className="text-xs text-slate-500 flex items-center gap-1">
          <MapPin size={12} />
          Lokasi: {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}
          {coords.accuracy && (
            <span className="ml-1">(akurasi ± {Math.round(coords.accuracy)} m)</span>
          )}
        </p>
      )}

      <details className="text-xs text-slate-500">
        <summary className="cursor-pointer">Catatan teknis</summary>
        <p className="mt-2 leading-relaxed">
          Arah dihitung menggunakan bearing great-circle dari koordinat Anda ke
          Ka&apos;bah (21.4225°LU, 39.8262°BT). Kompas mengandalkan
          DeviceOrientation API — pada iOS perlu disetujui dahulu, pada
          desktop biasanya tidak tersedia. Akurasi tergantung kalibrasi
          magnetometer perangkat.
        </p>
      </details>
    </div>
  );
}
