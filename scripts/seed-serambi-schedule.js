/**
 * Seed post Serambi TERJADWAL: 3 post per hari selama 1 tahun ke depan.
 *
 * Slot tayang (WIB / UTC+7) — dipilih di jam engagement tertinggi:
 *   05:30  setelah Subuh    → tema semangat awal hari, syukur, niat, rezeki
 *   12:15  istirahat siang  → tema akhlak, muamalah, sabar, kerja halal
 *   19:30  setelah Isya     → tema muhasabah, taubat, doa malam, tawakal
 *
 * Semua post di-insert dengan status "scheduled" + scheduledAt (UTC).
 * SerambiService.promoteDueScheduled() yang akan mempromosikannya jadi
 * "published" saat waktunya tiba (sweep di-trigger dari feed publik, throttle 30s)
 * sekaligus mengirim push notification ke topic "serambi".
 *
 * Idempotent — aman dijalankan berulang:
 *   1. Kutipan yang body-nya sudah ada di DB (status apa pun) dilewati.
 *   2. Slot waktu yang sudah terisi post "scheduled" lain dilewati.
 *   3. Slot yang waktunya sudah lewat (<= sekarang) dilewati.
 *
 * Opsi:
 *   --days=365            jumlah hari yang dijadwalkan (default 365)
 *   --start=YYYY-MM-DD    tanggal mulai dalam WIB (default: besok WIB)
 *   --author="Nama"       tautkan ke SerambiAuthor (nama harus persis ada)
 *   --dry-run             tampilkan rencana saja, tidak menulis ke DB
 *   --check               hanya validasi pool kutipan, tidak menyentuh DB
 *
 * Run:
 *   set -a; source .env; set +a; node scripts/seed-serambi-schedule.js --dry-run
 *   set -a; source .env; set +a; node scripts/seed-serambi-schedule.js
 */
const { PrismaClient } = require('@prisma/client');

const PAGI = require('./data/serambi-kutipan-pagi');
const SIANG = require('./data/serambi-kutipan-siang');
const MALAM = require('./data/serambi-kutipan-malam');

/** Slot harian dalam waktu WIB. `pool` = sumber kutipan untuk slot itu. */
const SLOTS = [
  { label: 'pagi', hour: 5, minute: 30, pool: PAGI },
  { label: 'siang', hour: 12, minute: 15, pool: SIANG },
  { label: 'malam', hour: 19, minute: 30, pool: MALAM },
];

const WIB_OFFSET_HOURS = 7;
const DEFAULT_AUTHOR_NAME = "Rumah Qur'an";
const INSERT_CHUNK = 200;

// ── argumen ────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = { days: 365, start: null, author: null, dryRun: false, check: false };
  for (const raw of argv.slice(2)) {
    const [key, ...rest] = raw.replace(/^--/, '').split('=');
    const val = rest.join('=');
    if (key === 'days') out.days = Number(val);
    else if (key === 'start') out.start = val;
    else if (key === 'author') out.author = val;
    else if (key === 'dry-run') out.dryRun = true;
    else if (key === 'check') out.check = true;
    else throw new Error(`Opsi tidak dikenal: --${key}`);
  }
  if (!Number.isInteger(out.days) || out.days < 1 || out.days > 1000) {
    throw new Error('--days harus bilangan bulat 1..1000');
  }
  if (out.start && !/^\d{4}-\d{2}-\d{2}$/.test(out.start)) {
    throw new Error('--start harus format YYYY-MM-DD');
  }
  return out;
}

// ── util tanggal WIB ───────────────────────────────────────────────────────
/** {y,m,d} tanggal kalender WIB dari sebuah instant. */
function wibParts(instant) {
  const shifted = new Date(instant.getTime() + WIB_OFFSET_HOURS * 3600_000);
  return {
    y: shifted.getUTCFullYear(),
    m: shifted.getUTCMonth() + 1,
    d: shifted.getUTCDate(),
  };
}

/** Date (UTC) untuk jam:menit WIB pada tanggal WIB tertentu. */
function wibToUtc(y, m, d, hour, minute) {
  return new Date(Date.UTC(y, m - 1, d, hour - WIB_OFFSET_HOURS, minute, 0, 0));
}

/** Label "YYYY-MM-DD HH:mm WIB" untuk logging. */
function fmtWib(instant) {
  const s = new Date(instant.getTime() + WIB_OFFSET_HOURS * 3600_000);
  const p = (n) => String(n).padStart(2, '0');
  return (
    `${s.getUTCFullYear()}-${p(s.getUTCMonth() + 1)}-${p(s.getUTCDate())} ` +
    `${p(s.getUTCHours())}:${p(s.getUTCMinutes())} WIB`
  );
}

// ── validasi pool ──────────────────────────────────────────────────────────
function validatePools(days) {
  const all = [];
  for (const slot of SLOTS) {
    if (slot.pool.length < days) {
      throw new Error(
        `Pool "${slot.label}" hanya punya ${slot.pool.length} kutipan, butuh ${days}. ` +
          `Tambah entri di scripts/data/serambi-kutipan-${slot.label}.js`,
      );
    }
    const uniq = new Set(slot.pool);
    if (uniq.size !== slot.pool.length) {
      throw new Error(`Pool "${slot.label}" mengandung kutipan duplikat.`);
    }
    all.push(...slot.pool.slice(0, days));
  }
  const uniqAll = new Set(all);
  if (uniqAll.size !== all.length) {
    throw new Error('Ada kutipan yang sama dipakai di lebih dari satu slot.');
  }
  return all.length;
}

// ── rencana jadwal ─────────────────────────────────────────────────────────
/**
 * Susun daftar {body, scheduledAt, slot} untuk `days` hari mulai `startWib`.
 * Slot yang waktunya sudah lewat otomatis dilewati.
 */
function buildPlan(days, startWib, now) {
  const plan = [];
  let skippedPast = 0;
  for (let i = 0; i < days; i++) {
    const base = wibToUtc(startWib.y, startWib.m, startWib.d + i, 0, 0);
    const cal = wibParts(base);
    for (const slot of SLOTS) {
      const at = wibToUtc(cal.y, cal.m, cal.d, slot.hour, slot.minute);
      if (at.getTime() <= now.getTime()) {
        skippedPast++;
        continue;
      }
      plan.push({ body: slot.pool[i], scheduledAt: at, slot: slot.label });
    }
  }
  return { plan, skippedPast };
}

// ── main ───────────────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs(process.argv);
  const total = validatePools(args.days);
  console.log(
    `Pool OK: ${SLOTS.map((s) => `${s.label}=${s.pool.length}`).join(', ')} ` +
      `→ ${total} kutipan unik dipakai untuk ${args.days} hari.`,
  );
  if (args.check) return;

  const prisma = new PrismaClient();
  try {
    const now = new Date();
    const startWib = args.start
      ? (() => {
          const [y, m, d] = args.start.split('-').map(Number);
          return { y, m, d };
        })()
      : (() => {
          const t = wibParts(new Date(now.getTime() + 24 * 3600_000));
          return t;
        })();

    const { plan, skippedPast } = buildPlan(args.days, startWib, now);
    if (plan.length === 0) {
      console.log('Tidak ada slot di masa depan untuk dijadwalkan.');
      return;
    }

    // Penulis: tautkan ke SerambiAuthor bila diminta, jika tidak pakai default.
    let authorName = DEFAULT_AUTHOR_NAME;
    let authorId = null;
    let authorAvatarUrl = null;
    if (args.author) {
      const found = await prisma.serambiAuthor.findUnique({ where: { name: args.author } });
      if (!found) {
        const list = await prisma.serambiAuthor.findMany({ select: { name: true } });
        throw new Error(
          `Penulis "${args.author}" tidak ditemukan. Yang tersedia: ` +
            (list.length ? list.map((a) => a.name).join(', ') : '(belum ada)'),
        );
      }
      authorName = found.name;
      authorId = found.id;
      authorAvatarUrl = found.avatarUrl;
    }

    // Idempotensi 1: buang kutipan yang body-nya sudah ada di DB.
    const bodies = plan.map((p) => p.body);
    const existingBodies = new Set();
    for (let i = 0; i < bodies.length; i += 500) {
      const rows = await prisma.serambiPost.findMany({
        where: { body: { in: bodies.slice(i, i + 500) } },
        select: { body: true },
      });
      rows.forEach((r) => existingBodies.add(r.body));
    }

    // Idempotensi 2: buang slot waktu yang sudah terisi post terjadwal.
    const firstAt = plan[0].scheduledAt;
    const lastAt = plan[plan.length - 1].scheduledAt;
    const takenRows = await prisma.serambiPost.findMany({
      where: { status: 'scheduled', scheduledAt: { gte: firstAt, lte: lastAt } },
      select: { scheduledAt: true },
    });
    const takenSlots = new Set(takenRows.map((r) => r.scheduledAt.toISOString()));

    const fresh = plan.filter(
      (p) => !existingBodies.has(p.body) && !takenSlots.has(p.scheduledAt.toISOString()),
    );

    const dupBody = plan.filter((p) => existingBodies.has(p.body)).length;
    const dupSlot = plan.filter((p) => takenSlots.has(p.scheduledAt.toISOString())).length;
    console.log(
      `Rencana: ${plan.length} slot (${args.days} hari x ${SLOTS.length} slot` +
        (skippedPast ? `, ${skippedPast} slot lampau dilewati` : '') +
        ')',
    );
    console.log(`  - body sudah ada    : ${dupBody}`);
    console.log(`  - slot sudah terisi : ${dupSlot}`);
    console.log(`  - akan di-insert    : ${fresh.length}`);
    console.log(`Penulis: ${authorName}${authorId ? ` (id ${authorId})` : ' (tanpa relasi)'}`);
    if (fresh.length) {
      console.log(`Slot pertama: ${fmtWib(fresh[0].scheduledAt)} — "${fresh[0].body.slice(0, 60)}…"`);
      const last = fresh[fresh.length - 1];
      console.log(`Slot terakhir: ${fmtWib(last.scheduledAt)} — "${last.body.slice(0, 60)}…"`);
    }

    if (args.dryRun) {
      console.log('\n--dry-run: tidak ada yang ditulis ke database.');
      return;
    }
    if (fresh.length === 0) {
      console.log('Tidak ada yang perlu di-insert.');
      return;
    }

    let inserted = 0;
    for (let i = 0; i < fresh.length; i += INSERT_CHUNK) {
      const chunk = fresh.slice(i, i + INSERT_CHUNK).map((p) => ({
        body: p.body,
        authorName,
        authorAvatarUrl,
        authorId,
        verified: true,
        status: 'scheduled',
        scheduledAt: p.scheduledAt,
      }));
      const res = await prisma.serambiPost.createMany({ data: chunk });
      inserted += res.count;
      process.stdout.write(`  insert ${inserted}/${fresh.length}\r`);
    }
    console.log(`\nSelesai: ${inserted} post terjadwal dibuat.`);

    const [scheduled, totalPosts] = await Promise.all([
      prisma.serambiPost.count({ where: { status: 'scheduled' } }),
      prisma.serambiPost.count(),
    ]);
    console.log(`Total post Serambi: ${totalPosts} (terjadwal: ${scheduled}).`);
  } finally {
    await prisma.$disconnect();
  }
}

// Diekspor agar logika tanggal bisa diuji tanpa menyentuh database.
module.exports = { SLOTS, wibParts, wibToUtc, fmtWib, buildPlan, validatePools };

if (require.main === module) {
  main().catch((e) => {
    console.error('Seed gagal:', e.message || e);
    process.exitCode = 1;
  });
}
