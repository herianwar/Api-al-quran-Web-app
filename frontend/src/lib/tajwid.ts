/**
 * Tajwid rule metadata — maps the Quran.com markup class (span.tj-RULE, see
 * globals.css) to an Indonesian label, the matching color, and a short
 * explanation. Used by the surah reader's tajwid legend and the tap-to-identify
 * popover in AyatItem. Colors here MUST stay in sync with the `.tj-*` rules in
 * globals.css.
 */
export interface TajwidRule {
  /** rule key as it appears after `tj-` in the span class */
  cls: string;
  /** Indonesian display name */
  label: string;
  /** hex color, mirrors globals.css */
  color: string;
  /** one-line explanation in Indonesian */
  desc: string;
}

/** Every rule key Quran.com emits → metadata. */
export const TAJWID_RULE_MAP: Record<string, Omit<TajwidRule, "cls">> = {
  ham_wasl: {
    label: "Hamzah Washal",
    color: "#AAAAAA",
    desc: "Hamzah sambung — tidak dibaca ketika disambung dengan kata sebelumnya.",
  },
  slnt: {
    label: "Huruf Tidak Dibaca",
    color: "#AAAAAA",
    desc: "Huruf yang ditulis namun tidak dilafalkan.",
  },
  laam_shamsiyah: {
    label: "Lam Syamsiyah",
    color: "#AAAAAA",
    desc: "Lam ta'rif yang tidak dibaca karena diidghamkan ke huruf syamsiyah.",
  },
  madda_normal: {
    label: "Mad Asli (Thabi'i)",
    color: "#537FFF",
    desc: "Mad biasa, dibaca panjang 2 harakat.",
  },
  madda_permissible: {
    label: "Mad Jaiz Munfashil",
    color: "#4050FF",
    desc: "Boleh dibaca panjang 2, 4, atau 6 harakat.",
  },
  madda_necessary: {
    label: "Mad Lazim",
    color: "#000EBC",
    desc: "Wajib dibaca panjang 6 harakat.",
  },
  madda_obligatory: {
    label: "Mad Wajib Muttashil",
    color: "#2144C1",
    desc: "Wajib dibaca panjang 4–5 harakat.",
  },
  madda_obligatory_monfasel: {
    label: "Mad Wajib (Munfashil)",
    color: "#2144C1",
    desc: "Wajib dibaca panjang 4–5 harakat.",
  },
  madda_obligatory_mottasel: {
    label: "Mad Wajib (Muttashil)",
    color: "#2144C1",
    desc: "Wajib dibaca panjang 4–5 harakat.",
  },
  qalqalah: {
    label: "Qalqalah",
    color: "#DD0008",
    desc: "Huruf qalqalah dibaca memantul ketika sukun.",
  },
  ikhafa: {
    label: "Ikhfa'",
    color: "#9400A8",
    desc: "Nun sukun / tanwin dibaca samar disertai dengung.",
  },
  ikhafa_shafawi: {
    label: "Ikhfa' Syafawi",
    color: "#9400A8",
    desc: "Mim sukun bertemu ba' — dibaca samar di bibir disertai dengung.",
  },
  idgham_ghunnah: {
    label: "Idgham Bighunnah",
    color: "#169200",
    desc: "Nun sukun / tanwin dilebur ke huruf berikutnya dengan dengung.",
  },
  idgham_wo_ghunnah: {
    label: "Idgham Bilaghunnah",
    color: "#169200",
    desc: "Nun sukun / tanwin dilebur tanpa dengung (ke huruf lam/ra').",
  },
  idgham_shafawi: {
    label: "Idgham Syafawi",
    color: "#169200",
    desc: "Mim sukun bertemu mim — dilebur disertai dengung.",
  },
  idgham_mutajanisayn: {
    label: "Idgham Mutajanisain",
    color: "#169200",
    desc: "Dua huruf sejenis makhraj dilebur menjadi satu.",
  },
  idgham_mutaqaribayn: {
    label: "Idgham Mutaqaribain",
    color: "#169200",
    desc: "Dua huruf berdekatan makhraj dilebur menjadi satu.",
  },
  iqlab: {
    label: "Iqlab",
    color: "#26BFFD",
    desc: "Nun sukun / tanwin bertemu ba' — diubah menjadi mim disertai dengung.",
  },
  ghunnah: {
    label: "Ghunnah",
    color: "#FF7E1E",
    desc: "Nun / mim bertasydid dibaca berdengung sekitar 2 harakat.",
  },
};

/** De-duplicated, ordered list for the legend (one entry per distinct color/meaning). */
export const TAJWID_LEGEND: TajwidRule[] = [
  "ham_wasl",
  "laam_shamsiyah",
  "ghunnah",
  "qalqalah",
  "madda_normal",
  "madda_permissible",
  "madda_obligatory",
  "madda_necessary",
  "ikhafa",
  "idgham_ghunnah",
  "iqlab",
].map((cls) => ({ cls, ...TAJWID_RULE_MAP[cls] }));

/** Look up a rule by its `tj-RULE` class key; falls back to a generic label. */
export function tajwidRule(cls: string): TajwidRule {
  const meta = TAJWID_RULE_MAP[cls];
  return meta
    ? { cls, ...meta }
    : { cls, label: "Kaidah Tajwid", color: "#475569", desc: "" };
}
