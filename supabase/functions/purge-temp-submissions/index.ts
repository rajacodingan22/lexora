import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

// Cron per jam: hapus file titipan (tanpa Drive) yang SUDAH dinilai + kedaluwarsa.
// File kedaluwarsa tapi BELUM dinilai ditahan (ditangani fungsi notify_temp_file_expiry).
// Nilai & feedback tidak pernah disentuh.
// Otorisasi: header x-cron-secret harus sama dengan env CRON_SECRET.

interface TempRow {
  id: string
  file_url: string | null
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      })
    }

    const configured = Deno.env.get("CRON_SECRET")
    if (!configured || req.headers.get("x-cron-secret") !== configured) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      })
    }

    const url = Deno.env.get("SUPABASE_URL")
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    if (!url || !serviceKey) {
      return new Response(JSON.stringify({ error: "Server misconfigured" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })
    }

    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: rows, error: listErr } = await admin
      .from("submissions")
      .select("id, file_url")
      .eq("storage_kind", "temp")
      .is("purged_at", null)
      .not("file_url", "is", null)
      .not("grade", "is", null)
      .lt("expires_at", new Date().toISOString())
      .limit(200)

    if (listErr) {
      console.error("[purge-temp] list failed", listErr.message)
      return new Response(JSON.stringify({ error: "List failed" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })
    }

    let purged = 0
    const failures: string[] = []
    for (const row of (rows ?? []) as TempRow[]) {
      const path = (row.file_url as string).replace(/^submissions\//, "")
      const { error: rmErr } = await admin.storage.from("submissions").remove([path])
      if (rmErr) {
        console.error("[purge-temp] remove failed", row.id, rmErr.message)
        failures.push(row.id)
        continue
      }
      const { error: updErr } = await admin
        .from("submissions")
        .update({ file_url: null, file_name: null, purged_at: new Date().toISOString() })
        .eq("id", row.id)
      if (updErr) {
        console.error("[purge-temp] update failed", row.id, updErr.message)
        failures.push(row.id)
        continue
      }
      purged += 1
    }

    return new Response(JSON.stringify({ purged, failures }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  } catch (e) {
    console.error("[purge-temp] error", e)
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
})
