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

type PostRow = {
  id: string;
  title: string | null;
  summary: string | null;
  body?: string | null;
  status: string;
};

type GameRow = {
  id: string;
  game_date: string;
  opponent_name: string;
  score_for: number | null;
  score_against: number | null;
  result: string | null;
};

function resultLabel(result: string | null): string {
  if (result === "win") return "승리";
  if (result === "loss") return "패배";
  if (result === "draw") return "무승부";
  return "결과 확인 필요";
}

async function sendDiscordNotification(post: PostRow, game: GameRow): Promise<void> {
  const webhookUrl = getRequiredEnv("DISCORD_WEBHOOK_URL");
  const appBaseUrl = Deno.env.get("APP_BASE_URL") ?? "https://doosan-opal.vercel.app";
  const alertTitle = Deno.env.get("DISCORD_ALERT_TITLE") ?? "두산 포스팅 초안 생성 완료";
  const mention = Deno.env.get("DISCORD_MENTION") ?? "@everyone";
  const reviewUrl = `${appBaseUrl.replace(/\/$/, "")}/posts/${post.id}`;
  const scoreLine = `${game.score_for ?? "?"}:${game.score_against ?? "?"} ${resultLabel(game.result)}`;
  const gameLine = `${game.game_date} 두산 vs ${game.opponent_name}`;

  const payload = {
    content: mention,
    embeds: [
      {
        title: alertTitle,
        color: 0x131230,
        fields: [
          { name: "경기", value: gameLine, inline: false },
          { name: "경기결과", value: scoreLine, inline: false },
          { name: "제목", value: post.title ?? "제목 없음", inline: false },
          { name: "요약", value: post.summary ?? "요약 없음", inline: false },
          { name: "링크", value: reviewUrl, inline: false },
        ],
        footer: {
          text: "doosan / draft generated",
        },
        timestamp: new Date().toISOString(),
      },
    ],
  };

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Discord notification failed: ${response.status} ${body}`);
  }
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function postSignature(post: PostRow | null | undefined): string {
  if (!post) return "";
  return [
    normalizeText(post.title),
    normalizeText(post.summary),
    normalizeText(post.body),
  ].join("||");
}

function isMeaningfullyDifferent(before: PostRow | null | undefined, after: PostRow | null | undefined): boolean {
  return postSignature(before) !== postSignature(after);
}

async function generatePostForGame(
  supabaseUrl: string,
  serviceRoleKey: string,
  gameId: string,
): Promise<void> {
  const generateResponse = await fetch(`${supabaseUrl}/functions/v1/generate-post`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({ gameId }),
  });

  if (!generateResponse.ok) {
    throw new Error(`generate-post failed for game ${gameId}: ${generateResponse.status}`);
  }
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
    const updatedGameIds: string[] = [];

    for (const game of finishedGames) {
      const { data: existingPost } = await supabase
        .from("posts")
        .select("id, title, summary, body, status")
        .eq("game_id", game.id)
        .maybeSingle();

      if (!existingPost) {
        await generatePostForGame(supabaseUrl, serviceRoleKey, game.id);

        const { data: createdPost, error: createdPostError } = await supabase
          .from("posts")
          .select("id, title, summary, body, status")
          .eq("game_id", game.id)
          .single();

        if (createdPostError) {
          throw createdPostError;
        }

        const { data: gameDetail, error: gameDetailError } = await supabase
          .from("games")
          .select("id, game_date, opponent_name, score_for, score_against, result")
          .eq("id", game.id)
          .single();

        if (gameDetailError) {
          throw gameDetailError;
        }

        await sendDiscordNotification(createdPost as PostRow, gameDetail as GameRow);
      } else {
        const previousPost = existingPost as PostRow;

        await generatePostForGame(supabaseUrl, serviceRoleKey, game.id);

        const { data: refreshedPost, error: refreshedPostError } = await supabase
          .from("posts")
          .select("id, title, summary, body, status")
          .eq("game_id", game.id)
          .single();

        if (refreshedPostError) {
          throw refreshedPostError;
        }

        if (isMeaningfullyDifferent(previousPost, refreshedPost as PostRow)) {
          const { data: gameDetail, error: gameDetailError } = await supabase
            .from("games")
            .select("id, game_date, opponent_name, score_for, score_against, result")
            .eq("id", game.id)
            .single();

          if (gameDetailError) {
            throw gameDetailError;
          }

          await sendDiscordNotification(
            {
              ...(refreshedPost as PostRow),
              title: `[업데이트] ${(refreshedPost as PostRow).title ?? "제목 없음"}`,
            },
            gameDetail as GameRow,
          );
          updatedGameIds.push(game.id);
        }
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
      updatedGameIds,
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
