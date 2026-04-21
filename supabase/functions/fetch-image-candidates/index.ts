import { createClient } from "npm:@supabase/supabase-js@2";
import { getRequiredEnv, jsonResponse } from "../_shared/utils.ts";

type ImagePayload = {
  gameId: string;
};

Deno.serve(async (req) => {
  try {
    const { gameId } = (await req.json()) as ImagePayload;
    if (!gameId) {
      return jsonResponse({ ok: false, error: "gameId is required" }, 400);
    }

    const supabaseUrl = getRequiredEnv("SUPABASE_URL");
    const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: game } = await supabase
      .from("games")
      .select("id, game_date, opponent_name")
      .eq("id", gameId)
      .single();

    if (!game) {
      return jsonResponse({ ok: false, error: "Game not found" }, 404);
    }

    // TODO: 공식 채널 기준의 실제 이미지 후보 수집 로직으로 교체합니다.
    const candidates = [
      {
        game_id: gameId,
        source_name: "두산베어스 공식 채널",
        source_url: "https://www.instagram.com/doosanbears.1982/",
        image_url: "https://example.com/doosan-placeholder-image.jpg",
        thumbnail_url: "https://example.com/doosan-placeholder-thumb.jpg",
        credit_note: "공식 채널 여부와 사용 범위를 직접 확인 후 사용",
        is_official: true,
      },
    ];

    const { error } = await supabase.from("image_candidates").upsert(candidates);
    if (error) {
      throw error;
    }

    return jsonResponse({
      ok: true,
      gameId,
      count: candidates.length,
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
