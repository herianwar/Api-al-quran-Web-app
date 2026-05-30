"use client";

import { Flame, Target } from "lucide-react";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { apiFetch, fetcher } from "@/lib/api";

interface Streak {
  current: number;
  longest: number;
  todayCount: number;
  activeToday: boolean;
  last30Days: { tanggal: string; ayatCount: number }[];
}

interface Goal {
  unit: string;
  target: number;
  default?: boolean;
}

export function StreakCard() {
  const { data: streak } = useSWR<Streak>("/me/streak", fetcher);
  const { data: goal, mutate: mutateGoal } = useSWR<Goal>(
    "/me/goal",
    fetcher,
  );
  const [editing, setEditing] = useState(false);
  const [target, setTarget] = useState(10);
  const [unit, setUnit] = useState("ayat");

  useEffect(() => {
    if (goal) {
      setTarget(goal.target);
      setUnit(goal.unit);
    }
  }, [goal]);

  async function saveGoal() {
    try {
      await apiFetch("/me/goal", {
        method: "PUT",
        body: JSON.stringify({ unit, target }),
      });
      await mutateGoal();
    } catch {
      /* ignore */
    }
    setEditing(false);
  }

  if (!streak) return null;

  const goalTarget = goal?.target ?? 10;
  const progress = Math.min(100, (streak.todayCount / Math.max(1, goalTarget)) * 100);

  return (
    <section className="card p-5 sm:p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">
            Reading Streak
          </p>
          <p className="text-3xl font-bold mt-1 text-slate-900 inline-flex items-center gap-2">
            <Flame
              size={26}
              className={
                streak.activeToday
                  ? "text-orange-500 fill-orange-200"
                  : "text-slate-300"
              }
            />
            {streak.current}{" "}
            <span className="text-base font-medium text-slate-500">hari</span>
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Terpanjang: <strong>{streak.longest}</strong> hari ·{" "}
            {streak.activeToday ? "Hari ini aktif!" : "Belum baca hari ini"}
          </p>
        </div>
        <button
          onClick={() => setEditing((v) => !v)}
          className="text-xs text-emerald-700 hover:text-emerald-800 font-semibold inline-flex items-center gap-1"
        >
          <Target size={12} /> {editing ? "Tutup" : "Atur target"}
        </button>
      </div>

      <div>
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-slate-500">
            Target harian: {goal?.target ?? 10} {goal?.unit ?? "ayat"}
          </span>
          <span className="font-semibold text-slate-700">
            {streak.todayCount} / {goalTarget}
          </span>
        </div>
        <div className="h-2 rounded-full overflow-hidden bg-slate-100">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-amber-400 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {editing && (
        <div className="rounded-xl bg-slate-50 p-4 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="ayat">ayat / hari</option>
              <option value="halaman">halaman / hari</option>
              <option value="juz">juz / hari</option>
            </select>
            <input
              type="number"
              min={1}
              max={30}
              value={target}
              onChange={(e) => setTarget(parseInt(e.target.value || "1", 10))}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <button
            onClick={() => void saveGoal()}
            className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium py-2"
          >
            Simpan Target
          </button>
        </div>
      )}

      {streak.last30Days.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-wider text-slate-400 mb-2">
            30 hari terakhir
          </p>
          <div className="flex items-end gap-0.5 h-12">
            {streak.last30Days.map((d) => {
              const h = Math.min(48, Math.max(2, (d.ayatCount / 10) * 16));
              return (
                <div
                  key={d.tanggal}
                  title={`${d.tanggal}: ${d.ayatCount} ayat`}
                  className="flex-1 rounded-t bg-emerald-300/70"
                  style={{ height: `${h}px` }}
                />
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
