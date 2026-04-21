import { createClient } from "npm:@supabase/supabase-js@2";
import { getRequiredEnv, jsonResponse } from "../_shared/utils.ts";

type FetchPayload = {
  targetDate?: string;
};

function getSeoulDateString(now = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(now);
}

type ParsedGame = {
  external_game_id: string;
  game_date: string;
  season: number;
  team_name: string;
  opponent_name: string;
  home_away: "home" | "away";
  status: "scheduled" | "in_progress" | "finished" | "cancelled";
  venue: string | null;
  score_for: number | null;
  score_against: number | null;
  result: "win" | "loss" | "draw" | null;
  summary: string;
  metadata: Record<string, unknown>;
  raw_payload: Record<string, unknown>;
};

function normalizeStatus(rawState: string): ParsedGame["status"] {
  const upper = rawState.trim().toUpperCase();
  if (upper === "FINAL") return "finished";
  if (upper.includes("CANCEL")) return "cancelled";
  if (upper.includes(":")) return "scheduled";
  return "in_progress";
}

function computeResult(
  status: ParsedGame["status"],
  scoreFor: number | null,
  scoreAgainst: number | null,
): ParsedGame["result"] {
  if (status !== "finished" || scoreFor === null || scoreAgainst === null) return null;
  if (scoreFor > scoreAgainst) return "win";
  if (scoreFor < scoreAgainst) return "loss";
  return "draw";
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function parseGamesFromHtml(html: string, targetDate: string): ParsedGame[] {
  const blockRegex =
    /<div class="scoreboard_time">([\s\S]*?)<\/div>\s*<div class="scoreboard_local">([\s\S]*?)<\/div>\s*<div class="tbl_common tbl_scoreboard">([\s\S]*?)<\/table>[\s\S]*?<\/div>/g;

  const games: ParsedGame[] = [];
  const season = Number(targetDate.slice(0, 4));

  for (const match of html.matchAll(blockRegex)) {
    const scoreboardHtml = match[1];
    const localHtml = match[2];
    const tableHtml = match[3];

    const spans = [...scoreboardHtml.matchAll(/<span class="team_name">([^<]+)<\/span>/g)].map((m) =>
      stripTags(m[1])
    );
    const scoreSpans = [...scoreboardHtml.matchAll(/<span class="team_score"><span[^>]*>([^<]*)<\/span><\/span>/g)]
      .map((m) => stripTags(m[1]));
    const stateMatch = scoreboardHtml.match(/<span class="timer"><span[^>]*>([^<]+)<\/span><\/span>/);
    const localTimeMatch = localHtml.match(/<span class="local_time">([^<]+)<\/span>/);
    const rowMatches = [...tableHtml.matchAll(/<tr>\s*<th scope="row">([^<]+)<\/th>([\s\S]*?)<\/tr>/g)];

    if (spans.length < 2 || scoreSpans.length < 2 || !stateMatch) {
      continue;
    }

    const awayTeam = spans[0];
    const homeTeam = spans[1];
    if (awayTeam !== "DOOSAN" && homeTeam !== "DOOSAN") {
      continue;
    }

    const awayScore = Number.parseInt(scoreSpans[0], 10);
    const homeScore = Number.parseInt(scoreSpans[1], 10);
    const status = normalizeStatus(stripTags(stateMatch[1]));
    const venueTime = localTimeMatch ? stripTags(localTimeMatch[1]) : "";
    const [venue = null, gameTime = null] = venueTime ? venueTime.split(/\s+/) : [null, null];

    const isDoosanHome = homeTeam === "DOOSAN";
    const opponentName = isDoosanHome ? awayTeam : homeTeam;
    const scoreFor = Number.isNaN(isDoosanHome ? homeScore : awayScore)
      ? null
      : (isDoosanHome ? homeScore : awayScore);
    const scoreAgainst = Number.isNaN(isDoosanHome ? awayScore : homeScore)
      ? null
      : (isDoosanHome ? awayScore : homeScore);
    const result = computeResult(status, scoreFor, scoreAgainst);

    const inningRows = rowMatches.map((rowMatch) => ({
      team: stripTags(rowMatch[1]),
      cells: [...rowMatch[2].matchAll(/<td>([^<]*)<\/td>/g)].map((cell) => stripTags(cell[1])),
    }));

    const winningPitcherMatch = localHtml.match(/local_w'?>W:\s*([^<]+)/);
    const savePitcherMatch = localHtml.match(/local_s'?>S:\s*([^<]+)/);
    const losingPitcherMatch = localHtml.match(/local_l'?>L:\s*([^<]+)/);

    games.push({
      external_game_id: `kbo-${targetDate}-${isDoosanHome ? "home" : "away"}-${opponentName.toLowerCase()}`,
      game_date: targetDate,
      season,
      team_name: "두산베어스",
      opponent_name: opponentName,
      home_away: isDoosanHome ? "home" : "away",
      status,
      venue,
      score_for: scoreFor,
      score_against: scoreAgainst,
      result,
      summary:
        status === "finished" && scoreFor !== null && scoreAgainst !== null
          ? `${opponentName}전 ${scoreFor}:${scoreAgainst} ${result === "win" ? "승리" : result === "loss" ? "패배" : "무승부"}`
          : `${opponentName}전 ${status}`,
      metadata: {
        source: "KBO official English scoreboard",
        source_url: `https://eng.koreabaseball.com/Schedule/Scoreboard.aspx?searchDate=${targetDate}`,
        game_state: stripTags(stateMatch[1]),
        game_time: gameTime,
        winning_pitcher: winningPitcherMatch ? stripTags(winningPitcherMatch[1]) : null,
        save_pitcher: savePitcherMatch ? stripTags(savePitcherMatch[1]) : null,
        losing_pitcher: losingPitcherMatch ? stripTags(losingPitcherMatch[1]) : null,
      },
      raw_payload: {
        inning_rows: inningRows,
        scoreboard_html: scoreboardHtml,
        local_html: localHtml,
      },
    });
  }

  return games;
}

Deno.serve(async (req) => {
  try {
    const payload = (await req.json().catch(() => ({}))) as FetchPayload;
    const targetDate = payload.targetDate ?? getSeoulDateString();

    const supabaseUrl = getRequiredEnv("SUPABASE_URL");
    const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const sourceBaseUrl = Deno.env.get("KBO_SOURCE_BASE_URL") ?? "";

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const scoreboardUrl = sourceBaseUrl || `https://eng.koreabaseball.com/Schedule/Scoreboard.aspx?searchDate=${targetDate}`;
    const response = await fetch(scoreboardUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch KBO scoreboard: ${response.status}`);
    }

    const html = await response.text();
    const normalizedGames = parseGamesFromHtml(html, targetDate);

    const { error } = await supabase.from("games").upsert(normalizedGames, {
      onConflict: "external_game_id",
    });

    if (error) {
      throw error;
    }

    return jsonResponse({
      ok: true,
      targetDate,
      sourceUrl: scoreboardUrl,
      count: normalizedGames.length,
      games: normalizedGames,
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
