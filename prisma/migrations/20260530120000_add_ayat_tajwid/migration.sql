-- Add optional colored-tajwid HTML markup column (sourced from Quran.com API v4)
ALTER TABLE "ayat" ADD COLUMN "teksArabTajwid" TEXT;
