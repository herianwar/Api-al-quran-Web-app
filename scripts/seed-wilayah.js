/**
 * Seed Indonesian region tables (provinces > regencies > districts > villages)
 * from the Kemendagri/BPS dataset (dotted kode wilayah resmi).
 *
 * Source: cahyadsn/wilayah `db/wilayah.sql` — a single `wilayah(kode, nama)`
 * table where the region level is implied by the number of dot-separated
 * segments in `kode` (e.g. "32" province, "32.04" regency, "32.04.13"
 * district, "32.04.13.2001" village).
 *
 * Idempotent: uses createMany({ skipDuplicates }) keyed on the official code,
 * so re-running inserts nothing new. The villages table is ~84k rows, inserted
 * in batches.
 *
 * Run: set -a; source .env; set +a; node scripts/seed-wilayah.js
 *   Optional: WILAYAH_SQL_URL=<url>  or  WILAYAH_SQL_FILE=<local .sql path>
 */
const { PrismaClient } = require('@prisma/client');
const { promises: fsp } = require('fs');
const axios = require('axios');

const prisma = new PrismaClient();

const SQL_URL =
  process.env.WILAYAH_SQL_URL ||
  'https://raw.githubusercontent.com/cahyadsn/wilayah/master/db/wilayah.sql';
const SQL_FILE = process.env.WILAYAH_SQL_FILE || '';
const VILLAGE_BATCH = 2000;

/** Pull every ('kode','nama') tuple out of the SQL dump. Names embed literal
 * apostrophes as doubled '' (SQL escaping), which we unescape. */
function parseRows(sql) {
  const re = /\('([\d.]+)','((?:[^']|'')*)'\)/g;
  const rows = [];
  let m;
  while ((m = re.exec(sql)) !== null) {
    rows.push({ kode: m[1], nama: m[2].replace(/''/g, "'") });
  }
  return rows;
}

const parentOf = (kode) => kode.split('.').slice(0, -1).join('.');
const levelOf = (kode) => kode.split('.').length - 1; // dots count

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main() {
  console.log('[wilayah] loading dataset…');
  let sql;
  if (SQL_FILE) {
    sql = await fsp.readFile(SQL_FILE, 'utf-8');
    console.log(`[wilayah] read local file ${SQL_FILE} (${sql.length} bytes)`);
  } else {
    const res = await axios.get(SQL_URL, {
      timeout: 60000,
      responseType: 'text',
      transformResponse: [(d) => d],
      headers: { 'User-Agent': 'quran-api/1.0' },
    });
    sql = res.data;
    console.log(`[wilayah] downloaded ${SQL_URL} (${sql.length} bytes)`);
  }

  const rows = parseRows(sql);
  if (rows.length === 0) throw new Error('No rows parsed — dataset format changed?');

  const provinces = [];
  const regencies = [];
  const districts = [];
  const villages = [];
  for (const { kode, nama } of rows) {
    switch (levelOf(kode)) {
      case 0:
        provinces.push({ id: kode, nama });
        break;
      case 1:
        regencies.push({ id: kode, provinceId: parentOf(kode), nama });
        break;
      case 2:
        districts.push({ id: kode, regencyId: parentOf(kode), nama });
        break;
      case 3:
        villages.push({ id: kode, districtId: parentOf(kode), nama });
        break;
      default:
        break; // ignore deeper/unknown levels, if any
    }
  }
  console.log(
    `[wilayah] parsed: ${provinces.length} provinsi, ${regencies.length} kab/kota, ` +
      `${districts.length} kecamatan, ${villages.length} kelurahan`,
  );

  // Drop any orphan child whose parent is missing from the dataset so a single
  // bad row can't fail an entire FK-checked batch insert.
  const provIds = new Set(provinces.map((p) => p.id));
  const regIds = new Set(regencies.map((r) => r.id));
  const distIds = new Set(districts.map((d) => d.id));
  const dropOrphans = (list, parentSet, label) => {
    const kept = list.filter((x) => parentSet.has(x[label]));
    if (kept.length !== list.length) {
      console.warn(`[wilayah] dropped ${list.length - kept.length} orphan rows`);
    }
    return kept;
  };
  const regOk = dropOrphans(regencies, provIds, 'provinceId');
  const distOk = dropOrphans(districts, regIds, 'regencyId');
  const vilOk = dropOrphans(villages, distIds, 'districtId');

  // Insert parents before children (FK order). skipDuplicates → idempotent.
  const r1 = await prisma.province.createMany({ data: provinces, skipDuplicates: true });
  console.log(`[wilayah] provinces +${r1.count}`);
  const r2 = await prisma.regency.createMany({ data: regOk, skipDuplicates: true });
  console.log(`[wilayah] regencies +${r2.count}`);
  const r3 = await prisma.district.createMany({ data: distOk, skipDuplicates: true });
  console.log(`[wilayah] districts +${r3.count}`);

  let villageInserted = 0;
  const batches = chunk(vilOk, VILLAGE_BATCH);
  for (let i = 0; i < batches.length; i++) {
    const r = await prisma.village.createMany({ data: batches[i], skipDuplicates: true });
    villageInserted += r.count;
    if ((i + 1) % 10 === 0 || i === batches.length - 1) {
      console.log(`[wilayah] villages batch ${i + 1}/${batches.length} (+${villageInserted})`);
    }
  }

  const [pc, rc, dc, vc] = await Promise.all([
    prisma.province.count(),
    prisma.regency.count(),
    prisma.district.count(),
    prisma.village.count(),
  ]);
  console.log(
    `[wilayah] DONE. DB totals — provinsi=${pc} kab/kota=${rc} kecamatan=${dc} kelurahan=${vc}`,
  );
}

main()
  .catch((e) => {
    console.error('[wilayah] FAILED:', e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
