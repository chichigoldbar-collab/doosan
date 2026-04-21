import { createClient } from "npm:@supabase/supabase-js@2";
import { getRequiredEnv, jsonResponse } from "../_shared/utils.ts";

function getSeoulReferenceDate(now = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(now);
}

function getSeoulHour(now = new Date()): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    hour12: false,
  });
  return Number(formatter.format(now));
}

function shiftDate(dateString: string, days: number): string {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

Deno.serve(async () => {
  try {
    const supabaseUrl = getRequiredEnv("SUPABASE_URL");
    const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const seoulToday = getSeoulReferenceDate();
    const seoulHour = getSeoulHour();
    const targetDate = seoulHour < 3 ? shiftDate(seoulToday, -1) : seoulToday;

    await fetch(`${supabaseUrl}/functions/v1/fetch-kbo-games`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ targetDate }),
    });

    const { data: games, error } = await supabase
      .from("games")
      .select("id, status, game_date")
      .eq("game_date", targetDate);

    if (error) {
      throw error;
    }

    const finishedGames = (games ?? []).filter((game) => game.status === "finished");
    const processedGameIds: string[] = [];

    for (const game of finishedGames) {
      const { data: existingPost } = await supabase
        .from("posts")
        .select("id")
        .eq("game_id", game.id)
        .maybeSingle();

      if (!existingPost) {
        await fetch(`${supabaseUrl}/functions/v1/generate-post`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({ gameId: game.id }),
        });
      }

      const { data: existingImages } = await supabase
        .from("image_candidates")
        .select("id")
        .eq("game_id", game.id)
        .limit(1);

      if (!existingImages || existingImages.length === 0) {
        await fetch(`${supabaseUrl}/functions/v1/fetch-image-candidates`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({ gameId: game.id }),
        });
      }

      processedGameIds.push(game.id);
    }

    return jsonResponse({
      ok: true,
      date: targetDate,
      processedGameIds,
    });
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});
