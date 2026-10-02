import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const supabase = createClient(url, key, { auth: { persistSession: false } });

// Check import batches
const { data: batches, error: bErr } = await supabase
  .from("import_batches")
  .select("id, data_date, status, file_path, created_at, published_at")
  .order("created_at", { ascending: false });

console.log("=== IMPORT BATCHES ===", bErr || "");
console.log(batches);

// Check daily_metrics count
const { count: metricsCount, data: sampleMetrics, error: mErr } = await supabase
  .from("daily_metrics")
  .select("*", { count: "exact" })
  .limit(5);

console.log("=== DAILY METRICS COUNT ===", metricsCount, mErr || "");
console.log(sampleMetrics);
