import OpenAI from "npm:openai@4";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getRequiredEnv, jsonResponse } from "../_shared/utils.ts";

type GeneratePayload = {
  gameId: string;
};

function buildFallbackPost(game: Record<string, unknown>) {
  const opponent = String(game.opponent_name ?? "상대팀");
  const result = String(game.result ?? "");
  const scoreFor = game.score_for ?? "?";
  const scoreAgainst = game.score_against ?? "?";
  const venue = String(game.venue ?? "");
  const summary =
    result === "win"
      ? `끝까지 집중력이 살아 있으면서 기분 좋게 잡아낸 경기였던 것 같습니다.`
      : result === "loss"
      ? `아쉬움은 남았지만 그래도 돌아볼 장면은 분명히 있었던 경기였던 것 같습니다.`
      : `경기 흐름을 두고 여러 생각이 남는 경기였던 것 같습니다.`;
  const title =
    result === "win"
      ? `두산 ${opponent}전 리뷰, ${scoreFor}:${scoreAgainst} 승리로 분위기를 살렸습니다`
      : result === "loss"
      ? `두산 ${opponent}전 리뷰, ${scoreFor}:${scoreAgainst} 아쉬움이 남았던 경기였습니다`
      : `두산 ${opponent}전 리뷰, 끝까지 쉽지 않았던 경기였습니다`;
  const body = `안녕하세요 토끼돼지입니다~~~!

오늘 두산 ${opponent}전 보신 분들 많으시죠?? ${venue ? `${venue}에서 열린 경기였는데요, ` : ""}${summary} ㅎㅎ

최종 스코어는 ${scoreFor}:${scoreAgainst}였는데, 숫자만 보면 간단해 보여도 경기 안에 여러 흐름이 있었던 것 같습니다. 좋았던 장면도 있었고, 또 조금 더 잡아줬으면 했던 순간도 있었는데요.

그래도 한 경기 한 경기 보면서 다음 경기 기대를 해보게 되는 것 같습니다. 너무 단정적으로 보기보다는, 지금 팀이 올라갈 수 있는 흐름을 만드는 과정이라고 생각하고 싶네요 ㅎㅎㅎ

다음 경기에서는 조금 더 좋은 내용이 나와주길 기대해보겠습니다. 오늘도 두산 응원하신 분들 고생 많으셨습니다!`;
  return {
    title,
    summary,
    body,
    tags: ["#두산베어스", "#두산경기리뷰", "#KBO리그", `#두산대${opponent}`],
    generation_model: "template-fallback",
  };
}

Deno.serve(async (req) => {
  try {
    const { gameId } = (await req.json()) as GeneratePayload;
    if (!gameId) {
      return jsonResponse({ ok: false, error: "gameId is required" }, 400);
    }

    const supabaseUrl = getRequiredEnv("SUPABASE_URL");
    const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const openAiKey = Deno.env.get("OPENAI_API_KEY");

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const [{ data: game }, { data: settings }] = await Promise.all([
      supabase.from("games").select("*").eq("id", gameId).single(),
      supabase.from("settings").select("value").eq("key", "blog_config").single(),
    ]);

    if (!game) {
      return jsonResponse({ ok: false, error: "Game not found" }, 404);
    }

    const stylePrompt =
      settings?.value?.style_prompt ??
      "안녕하세요 토끼돼지입니다~~~!로 시작하는, 존댓말 기반의 자연스러운 두산 팬 블로그 톤으로 작성합니다.";

    const prompt = `
너는 두산베어스 팬 블로거 글쓰기 보조 도구다.

스타일 규칙:
- 존댓말 사용
- "~인데요", "~같습니다", "~보입니다"를 자연스럽게 사용
- "ㅎㅎ", "ㅎㅎㅎ"를 과하지 않게 삽입
- 기사체 금지
- 지나치게 템플릿처럼 보이지 않게 작성
- 사실이 불명확한 내용은 단정하지 말 것

추가 스타일:
${stylePrompt}

반드시 JSON으로만 응답:
{
  "title": "...",
  "summary": "...",
  "body": "...",
  "tags": ["#두산베어스", "#두산경기리뷰"]
}

경기 데이터:
${JSON.stringify(game, null, 2)}
`;

    let generated;
    let generationModel = "template-fallback";

    if (openAiKey) {
      const openai = new OpenAI({ apiKey: openAiKey });
      const response = await openai.responses.create({
        model: "gpt-5-mini",
        input: prompt,
      });

      const text = response.output_text?.trim();
      if (!text) {
        throw new Error("Model returned empty output");
      }

      generated = JSON.parse(text);
      generationModel = "gpt-5-mini";
    } else {
      generated = buildFallbackPost(game as Record<string, unknown>);
    }

    const { error } = await supabase.from("posts").upsert(
      {
        game_id: gameId,
        title: generated.title,
        summary: generated.summary,
        body: generated.body,
        tags: generated.tags ?? [],
        editable_title: generated.title,
        editable_body: generated.body,
        editable_tags: Array.isArray(generated.tags) ? generated.tags.join(" ") : "",
        generation_model: generationModel,
        prompt_version: "v1",
        status: "needs_review",
      },
      { onConflict: "game_id" },
    );

    if (error) {
      throw error;
    }

    return jsonResponse({ ok: true, gameId, generated });
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
