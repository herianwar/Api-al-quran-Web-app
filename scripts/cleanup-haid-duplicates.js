/**
 * Bersihkan data siklus haid yang korup (Zona Muslimah).
 *
 * Sebelum validasi server ada, POST /muslimah/haid membuat periode baru tanpa
 * cek apa pun — satu user bisa punya banyak periode "berlangsung"
 * (selesai = NULL) sekaligus, dan periode-periode yang saling beririsan.
 * Akibatnya kartu status di app jadi tidak konsisten.
 *
 * Script ini merapikan data lama, per user, sehingga tersisa PALING BANYAK
 * SATU periode berlangsung:
 *   1. Duplikat persis (jenis + mulai sama, sama-sama berlangsung) → hanya
 *      yang paling awal dibuat (createdAt, lalu id) yang disimpan, sisanya
 *      DIHAPUS. Ini kasus data korup dari double-tap di app.
 *   2. Periode berlangsung dengan tanggal mulai berbeda → riwayatnya tidak
 *      dibuang: yang lebih awal DITUTUP di H-1 sebelum periode berikutnya
 *      mulai, dan hanya yang paling akhir yang tetap berlangsung (itulah
 *      kondisi user sekarang). Bila penutupan menghasilkan rentang tak valid
 *      (selesai < mulai) barulah baris itu dihapus.
 *   3. Periode yang masih beririsan setelah itu → hanya DILAPORKAN, tidak
 *      diubah otomatis; menggeser tanggal riwayat asli terlalu berisiko untuk
 *      dilakukan tanpa konfirmasi user.
 *
 * Idempotent: run kedua menghasilkan 0 perubahan.
 * Default DRY-RUN — tidak menulis apa pun sampai diberi --apply.
 *
 * Opsi:
 *   --apply        benar-benar tulis perubahan (default: dry-run)
 *   --user=<id>    batasi ke satu userId saja
 *   --verbose      cetak detail tiap periode yang disentuh
 *
 * Run:
 *   set -a; source .env; set +a; node scripts/cleanup-haid-duplicates.js
 *   set -a; source .env; set +a; node scripts/cleanup-haid-duplicates.js --apply
 */
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// ── argumen ────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = { apply: false, user: null, verbose: false };
  for (const a of argv.slice(2)) {
    if (a === '--apply') out.apply = true;
    else if (a === '--verbose' || a === '-v') out.verbose = true;
    else if (a.startsWith('--user=')) out.user = a.slice('--user='.length);
    else if (a === '--dry-run') out.apply = false;
    else {
      console.error(`Opsi tidak dikenal: ${a}`);
      process.exit(1);
    }
  }
  return out;
}

// ── util tanggal (date-only, bebas timezone) ───────────────────────────────
const iso = (d) => (d === null ? null : d.toISOString().slice(0, 10));
const toDate = (s) => new Date(`${s}T00:00:00.000Z`);
const addDays = (s, n) => {
  const d = toDate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const overlaps = (aM, aS, bM, bS) =>
  aM <= (bS ?? '9999-12-31') && bM <= (aS ?? '9999-12-31');

async function main() {
  const args = parseArgs(process.argv);
  const mode = args.apply ? 'APPLY' : 'DRY-RUN';
  console.log(`\n🩸 Cleanup periode haid — mode ${mode}\n`);

  const where = args.user ? { userId: args.user } : {};
  const rows = await prisma.haidPeriod.findMany({
    where,
    orderBy: [{ userId: 'asc' }, { mulai: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      userId: true,
      jenis: true,
      mulai: true,
      selesai: true,
      createdAt: true,
    },
  });

  // Kelompokkan per user.
  const byUser = new Map();
  for (const r of rows) {
    if (!byUser.has(r.userId)) byUser.set(r.userId, []);
    byUser.get(r.userId).push({
      ...r,
      mulai: iso(r.mulai),
      selesai: iso(r.selesai),
    });
  }

  const toDelete = [];
  const toClose = []; // { id, selesai }
  const overlapReports = [];
  let usersWithMultiActive = 0;

  for (const [userId, periods] of byUser) {
    const active = periods
      .filter((p) => p.selesai === null)
      .sort((a, b) => {
        if (a.mulai !== b.mulai) return a.mulai < b.mulai ? -1 : 1;
        const dt = a.createdAt.getTime() - b.createdAt.getTime();
        return dt !== 0 ? dt : a.id < b.id ? -1 : 1;
      });

    if (active.length > 1) {
      usersWithMultiActive += 1;

      // (1) Duplikat persis: jenis + mulai sama → sisakan yang pertama dibuat.
      const seen = new Map(); // "jenis|mulai" → periode yang disimpan
      const distinct = [];
      for (const p of active) {
        const key = `${p.jenis}|${p.mulai}`;
        if (seen.has(key)) {
          toDelete.push({
            ...p,
            alasan: `duplikat persis dari ${seen.get(key).id}`,
          });
        } else {
          seen.set(key, p);
          distinct.push(p);
        }
      }

      // (2) Sisa periode berlangsung dengan mulai berbeda: tutup semua kecuali
      //     yang terakhir, di H-1 sebelum periode sesudahnya.
      for (let i = 0; i < distinct.length - 1; i++) {
        const p = distinct[i];
        const berikutnya = distinct[i + 1];
        const selesai = addDays(berikutnya.mulai, -1);
        if (selesai < p.mulai) {
          toDelete.push({
            ...p,
            alasan: `tidak bisa ditutup sebelum ${berikutnya.mulai}`,
          });
        } else {
          toClose.push({
            ...p,
            selesai,
            alasan: `ditutup sebelum ${berikutnya.mulai}`,
          });
        }
      }

      if (args.verbose) {
        const tetap = distinct[distinct.length - 1];
        console.log(
          `user ${userId}: ${active.length} periode berlangsung — tetap berlangsung: ${tetap.id} (${tetap.jenis} ${tetap.mulai})`,
        );
      }
    }

    // Laporan irisan antar periode yang tersisa SETELAH rencana di atas
    // diterapkan (tidak diubah otomatis).
    const sisa = periods
      .filter((p) => !toDelete.some((d) => d.id === p.id))
      .map((p) => {
        const closed = toClose.find((c) => c.id === p.id);
        return closed ? { ...p, selesai: closed.selesai } : p;
      });
    for (let i = 0; i < sisa.length; i++) {
      for (let j = i + 1; j < sisa.length; j++) {
        const a = sisa[i];
        const b = sisa[j];
        if (overlaps(a.mulai, a.selesai, b.mulai, b.selesai)) {
          overlapReports.push({ userId, a, b });
        }
      }
    }
  }

  console.log(`Total user dengan data siklus : ${byUser.size}`);
  console.log(`User dengan >1 periode aktif  : ${usersWithMultiActive}`);
  console.log(`Periode akan dihapus          : ${toDelete.length}`);
  console.log(`Periode akan ditutup          : ${toClose.length}`);
  console.log(
    `Irisan tersisa (perlu ditinjau manual): ${overlapReports.length}`,
  );

  if (args.verbose) {
    for (const d of toDelete) {
      console.log(
        `  ✗ ${d.id} user=${d.userId} ${d.jenis} ${d.mulai} — ${d.alasan}`,
      );
    }
    for (const c of toClose) {
      console.log(
        `  🔒 ${c.id} user=${c.userId} ${c.jenis} ${c.mulai} → selesai ${c.selesai} — ${c.alasan}`,
      );
    }
    for (const o of overlapReports) {
      console.log(
        `  ⚠ user=${o.userId} ${o.a.jenis} ${o.a.mulai}..${o.a.selesai ?? '∞'} ↔ ${o.b.jenis} ${o.b.mulai}..${o.b.selesai ?? '∞'}`,
      );
    }
  }

  if (!args.apply) {
    console.log(
      '\nDRY-RUN — tidak ada perubahan ditulis. Jalankan ulang dengan --apply.\n',
    );
    return;
  }

  if (toDelete.length === 0 && toClose.length === 0) {
    console.log('\n✅ Tidak ada yang perlu dibersihkan.\n');
    return;
  }

  await prisma.$transaction(async (tx) => {
    if (toDelete.length) {
      const res = await tx.haidPeriod.deleteMany({
        where: { id: { in: toDelete.map((d) => d.id) } },
      });
      console.log(`\n🗑️  Dihapus: ${res.count} periode`);
    }
    for (const c of toClose) {
      await tx.haidPeriod.update({
        where: { id: c.id },
        data: { selesai: toDate(c.selesai) },
      });
    }
    if (toClose.length) console.log(`🔒 Ditutup: ${toClose.length} periode`);
  });

  console.log('\n✅ Selesai.\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

module.exports = { addDays, overlaps };
