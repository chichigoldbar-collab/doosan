import { createClient } from "npm:@supabase/supabase-js@2";
import { getRequiredEnv, jsonResponse } from "../_shared/utils.ts";

type GeneratePayload = {
  gameId: string;
};

function toArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item)).filter(Boolean);
}

function hashString(input: string): number {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function pickBySeed<T>(items: T[], seed: number, offset = 0): T {
  return items[(seed + offset) % items.length];
}

function buildRuleBasedPost(game: Record<string, unknown>) {
  const opponent = String(game.opponent_name ?? "상대팀");
  const result = String(game.result ?? "");
  const scoreFor = game.score_for ?? "?";
  const scoreAgainst = game.score_against ?? "?";
  const venue = String(game.venue ?? "");
  const gameDate = String(game.game_date ?? "");
  const seed = hashString(`${gameDate}-${opponent}-${scoreFor}-${scoreAgainst}-${result}`);
  const metadata = (game.metadata as Record<string, unknown> | null) ?? {};
  const winningPitcher = String(metadata.winning_pitcher ?? "").trim();
  const savePitcher = String(metadata.save_pitcher ?? "").trim();
  const losingPitcher = String(metadata.losing_pitcher ?? "").trim();
  const keyMoments = toArray(game.key_moments);
  const topPlayers = toArray(game.top_players);
  const poorPlayers = toArray(game.poor_players);

  const winSummaries = [
    "승부처에서 흐름을 잘 챙기면서 기분 좋게 잡아낸 경기였던 것 같습니다.",
    "전체적으로는 두산 쪽으로 분위기를 잘 끌고 온 경기였던 것 같습니다.",
    "팬 입장에서는 꽤 반갑게 볼 수 있었던 승리였던 것 같습니다.",
    "필요한 순간마다 점수를 내주면서 흐름을 잡은 경기로 보입니다.",
  ];
  const lossSummaries = [
    "아쉬움은 남았지만 그래도 돌아볼 장면은 분명히 있었던 경기였던 것 같습니다.",
    "결과는 아쉬웠지만 내용까지 완전히 나빴다고 보기는 어려운 경기였습니다.",
    "한 끗 차이로 흐름을 놓친 느낌이 강했던 경기였던 것 같습니다.",
    "팬 입장에서는 답답함도 있었지만 얻은 장면도 있었던 경기였습니다.",
  ];
  const drawSummaries = [
    "경기 흐름을 두고 여러 생각이 남는 경기였던 것 같습니다.",
    "쉽게 정리하기 어려운, 묘하게 여운이 남는 경기였습니다.",
    "결과만으로 딱 잘라 말하기 어려운 경기였던 것 같습니다.",
  ];

  const winTitles = [
    `두산 ${opponent}전 리뷰, ${scoreFor}:${scoreAgainst} 승리로 흐름을 잡아준 경기였습니다`,
    `두산 ${opponent}전 리뷰, ${scoreFor}:${scoreAgainst} 승리가 반가웠던 경기였습니다`,
    `두산 ${opponent}전 총평, ${scoreFor}:${scoreAgainst}로 기분 좋게 잡았습니다`,
    `두산베어스 ${opponent}전 리뷰, ${scoreFor}:${scoreAgainst} 승리로 분위기를 살렸습니다`,
  ];
  const lossTitles = [
    `두산 ${opponent}전 리뷰, ${scoreFor}:${scoreAgainst} 아쉬움이 남았던 경기였습니다`,
    `두산 ${opponent}전 총평, ${scoreFor}:${scoreAgainst} 한 끗이 부족했던 경기였습니다`,
    `두산베어스 ${opponent}전 리뷰, ${scoreFor}:${scoreAgainst} 패배가 아쉬웠습니다`,
    `두산 ${opponent}전 리뷰, 결과보다 더 아쉽게 느껴졌던 경기였습니다`,
  ];
  const drawTitles = [
    `두산 ${opponent}전 리뷰, 끝까지 쉽게 흘러가지 않았던 경기였습니다`,
    `두산 ${opponent}전 총평, 여러 생각이 남는 경기였습니다`,
    `두산베어스 ${opponent}전 리뷰, 흐름이 묘했던 경기였습니다`,
  ];

  const introOpeners = [
    `오늘 두산 ${opponent}전 보신 분들 많으시죠??`,
    `오늘 경기 챙겨보신 분들 많으셨을 것 같은데요, 두산 ${opponent}전 이야기 조금 해보려고 합니다.`,
    `두산 ${opponent}전 보면서 이것저것 생각 많아지신 분들도 계셨을 것 같습니다.`,
    `오늘은 두산 ${opponent}전 얘기를 안 하고 넘어가기가 어렵겠더라고요 ㅎㅎ`,
  ];
  const scoreFlowSentences = [
    "점수 흐름만 보면 간단해 보여도 경기 안에서는 여러 번 분위기가 흔들렸던 것 같습니다.",
    "스코어만 놓고 보면 정리가 쉬워 보이지만, 실제로는 흐름이 꽤 여러 번 바뀌었던 경기였습니다.",
    "결과만 보면 깔끔해 보여도 중간중간 긴장되는 장면이 분명히 있었던 경기였는데요.",
    "숫자만 보면 편하게 이긴 듯해도, 경기 안쪽 분위기는 생각보다 출렁였던 것 같습니다.",
  ];
  const praiseSentences = [
    "좋았던 장면들이 이어지면서 팀이 조금 더 편하게 경기를 풀어간 느낌도 있었습니다.",
    "결정적인 순간에 집중력이 나와준 점은 확실히 반가운 부분이었습니다.",
    "전체적으로는 두산이 흐름을 쥐고 간다는 느낌이 조금 더 강했던 것 같습니다.",
    "팬 입장에서는 이런 식으로 경기 운영이 되는 날이 참 반갑게 느껴지네요.",
  ];
  const neutralConcernSentences = [
    "아쉬운 장면도 없지는 않았지만, 전체적으로는 다음 경기를 기대하게 만드는 내용이었습니다.",
    "물론 완벽했다고 보기는 어렵지만, 그래도 얻어가는 부분은 분명해 보였습니다.",
    "보완할 점은 있었어도 전체적인 인상은 나쁘지 않았던 경기였다고 생각합니다.",
    "세세하게 보면 아쉬운 부분도 있었지만, 팬 입장에서는 충분히 반가운 내용이었습니다.",
  ];
  const closingSentences = [
    "다음 경기에서는 조금 더 좋은 내용이 나와주길 기대해보겠습니다. 오늘도 두산 응원하신 분들 고생 많으셨습니다!",
    "이 분위기 잘 이어가면 다음 경기 더 기대해봐도 되지 않을까 싶습니다. 오늘도 응원하신 분들 정말 고생 많으셨습니다!",
    "이런 경기들이 쌓이면 시즌 흐름도 달라질 수 있을 것 같습니다. 다음 경기에서도 좋은 모습 기대해보겠습니다!",
    "팬 입장에서는 이런 흐름을 계속 보고 싶네요 ㅎㅎ 다음 경기에서도 좋은 내용 나와주면 좋겠습니다!",
  ];

  const summary =
    result === "win"
      ? pickBySeed(winSummaries, seed, 1)
      : result === "loss"
      ? pickBySeed(lossSummaries, seed, 2)
      : pickBySeed(drawSummaries, seed, 3);
  const title =
    result === "win"
      ? pickBySeed(winTitles, seed, 4)
      : result === "loss"
      ? pickBySeed(lossTitles, seed, 5)
      : pickBySeed(drawTitles, seed, 6);

  const flowSentence =
    keyMoments.length > 0
      ? `${keyMoments.slice(0, 2).join(", ")} 같은 장면들이 전체 분위기를 좌우했던 것 같습니다.`
      : pickBySeed(scoreFlowSentences, seed, 7);

  const playerSentence =
    topPlayers.length > 0
      ? `${topPlayers.join(", ")} 쪽은 좋은 흐름을 보여줬다고 볼 수 있겠는데요.`
      : winningPitcher
      ? `투수 쪽에서는 ${winningPitcher}${savePitcher ? `, ${savePitcher}` : ""} 이름이 눈에 들어왔던 경기였습니다.`
      : `눈에 띄는 장면을 만든 선수들이 있어서 경기 보는 맛이 있었던 것 같습니다.`;

  const concernSentence =
    poorPlayers.length > 0
      ? `반대로 ${poorPlayers.join(", ")} 쪽은 조금 더 보완이 필요해 보이기도 했습니다.`
      : result === "loss" && losingPitcher
      ? `${losingPitcher} 쪽 결과가 아쉽게 남은 것도 사실인데요.`
      : pickBySeed(neutralConcernSentences, seed, 8);

  const body = `안녕하세요 토끼돼지입니다~~~!

${pickBySeed(introOpeners, seed, 9)} ${venue ? `${venue}에서 열린 경기였는데요, ` : ""}${summary} ㅎㅎ

최종 스코어는 ${scoreFor}:${scoreAgainst}였는데, ${flowSentence} ${pickBySeed(praiseSentences, seed, 10)}

${playerSentence} ${concernSentence}

그래도 한 경기 한 경기 보면서 다음 경기 기대를 해보게 되는 것 같습니다. 너무 단정적으로 보기보다는, 지금 팀이 올라갈 수 있는 흐름을 만드는 과정이라고 생각하고 싶네요 ㅎㅎㅎ

${pickBySeed(closingSentences, seed, 11)}`;
  return {
    title,
    summary,
    body,
    tags: ["#두산베어스", "#두산경기리뷰", "#KBO리그", `#두산대${opponent}`],
    generation_model: "rule-based-template",
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

    const generated = buildRuleBasedPost({
      ...(game as Record<string, unknown>),
      style_prompt: stylePrompt,
    });
    const generationModel = "rule-based-template";

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
