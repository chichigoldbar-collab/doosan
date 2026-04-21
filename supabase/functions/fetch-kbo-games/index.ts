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
  top_players?: string[];
  poor_players?: string[];
  key_moments?: string[];
  metadata: Record<string, unknown>;
  raw_payload: Record<string, unknown>;
};

type GameListItem = {
  LE_ID: number;
  SR_ID: number;
  SEASON_ID: number;
  G_ID: string;
  AWAY_ID: string;
  HOME_ID: string;
  AWAY_NM: string;
  HOME_NM: string;
  S_NM: string;
  T_SCORE_CN: string;
  B_SCORE_CN: string;
  W_PIT_P_NM: string;
  SV_PIT_P_NM: string;
  L_PIT_P_NM: string;
  START_PIT_CK: number;
  IE_ENTRY_CK: number;
  VOD_CK: number;
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

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&lsquo;|&rsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, "\"")
    .replace(/&hellip;/g, "...");
}

function parseGridJson(raw: string): Record<string, unknown> {
  return JSON.parse(raw) as Record<string, unknown>;
}

function rowTexts(grid: Record<string, unknown>): string[][] {
  const rows = Array.isArray(grid.rows) ? grid.rows : [];
  return rows.map((row) => {
    const cells = Array.isArray((row as Record<string, unknown>).row)
      ? ((row as Record<string, unknown>).row as Record<string, unknown>[])
      : [];
    return cells.map((cell) => stripTags(String(cell.Text ?? "")).replace(/\s+/g, " ").trim());
  });
}

function safeNumber(value: string): number | null {
  const parsed = Number.parseFloat(value.replace(/,/g, ""));
  return Number.isNaN(parsed) ? null : parsed;
}

function parseInningsToOuts(value: string): number {
  const normalized = value.trim();
  if (!normalized) return 0;
  const wholeAndFraction = normalized.match(/^(\d+)\s+(\d)\/3$/);
  if (wholeAndFraction) {
    return Number.parseInt(wholeAndFraction[1], 10) * 3 + Number.parseInt(wholeAndFraction[2], 10);
  }
  const wholeOnly = normalized.match(/^(\d+)$/);
  if (wholeOnly) {
    return Number.parseInt(wholeOnly[1], 10) * 3;
  }
  return 0;
}

async function postFormJson<T>(url: string, form: URLSearchParams): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "User-Agent": "Mozilla/5.0",
    },
    body: form.toString(),
  });

  if (!response.ok) {
    throw new Error(`Failed request: ${url} (${response.status})`);
  }

  return await response.json() as T;
}

function normalizeGameId(officialGameId: string): string {
  const date = officialGameId.slice(0, 8);
  const away = officialGameId.slice(8, 10);
  const home = officialGameId.slice(10, 12);
  const tail = officialGameId.slice(12);
  return `${date}${away}${home}${tail}`;
}

function extractGameEtc(tableEtcRaw: string): Record<string, string> {
  const grid = parseGridJson(tableEtcRaw);
  const rows = rowTexts(grid);
  const result: Record<string, string> = {};

  for (const row of rows) {
    if (row.length >= 2) {
      result[row[0]] = row[1];
    }
  }

  return result;
}

function extractHitterSummaries(teamBox: Record<string, unknown>): Record<string, unknown>[] {
  const rows1 = rowTexts(parseGridJson(String(teamBox.table1 ?? "{}")));
  const rows3 = rowTexts(parseGridJson(String(teamBox.table3 ?? "{}")));
  const count = Math.min(rows1.length, rows3.length);
  const hitters: Record<string, unknown>[] = [];

  for (let index = 0; index < count; index += 1) {
    const info = rows1[index];
    const stat = rows3[index];
    if (info.length < 3 || stat.length < 5) continue;

    hitters.push({
      order: info[0],
      position: info[1],
      name: info[2],
      at_bats: safeNumber(stat[0]),
      hits: safeNumber(stat[1]),
      rbi: safeNumber(stat[2]),
      runs: safeNumber(stat[3]),
      average: stat[4],
    });
  }

  return hitters;
}

function extractPitcherSummaries(teamBox: Record<string, unknown>): Record<string, unknown>[] {
  const rows = rowTexts(parseGridJson(String(teamBox.table ?? "{}")));
  return rows
    .filter((row) => row.length >= 17)
    .map((row) => ({
      name: row[0],
      appearance: row[1],
      result: row[2],
      wins: safeNumber(row[3]),
      losses: safeNumber(row[4]),
      saves: safeNumber(row[5]),
      innings: row[6],
      batters: safeNumber(row[7]),
      pitches: safeNumber(row[8]),
      at_bats: safeNumber(row[9]),
      hits_allowed: safeNumber(row[10]),
      home_runs_allowed: safeNumber(row[11]),
      walks: safeNumber(row[12]),
      strikeouts: safeNumber(row[13]),
      runs_allowed: safeNumber(row[14]),
      earned_runs: safeNumber(row[15]),
      era: row[16],
    }));
}

function extractTopPlayerNames(
  doosanHitters: Record<string, unknown>[],
  doosanPitchers: Record<string, unknown>[],
): string[] {
  const hitterNames = [...doosanHitters]
    .sort((a, b) => {
      const hitDiff = Number((b.hits as number | null) ?? 0) - Number((a.hits as number | null) ?? 0);
      if (hitDiff !== 0) return hitDiff;
      const rbiDiff = Number((b.rbi as number | null) ?? 0) - Number((a.rbi as number | null) ?? 0);
      if (rbiDiff !== 0) return rbiDiff;
      return Number((b.runs as number | null) ?? 0) - Number((a.runs as number | null) ?? 0);
    })
    .filter((item) => Number((item.hits as number | null) ?? 0) > 0 || Number((item.rbi as number | null) ?? 0) > 0)
    .slice(0, 2)
    .map((item) => String(item.name));

  const pitcherNames = [...doosanPitchers]
    .sort((a, b) => {
      const outsDiff = parseInningsToOuts(String(b.innings ?? "")) - parseInningsToOuts(String(a.innings ?? ""));
      if (outsDiff !== 0) return outsDiff;
      return Number((b.strikeouts as number | null) ?? 0) - Number((a.strikeouts as number | null) ?? 0);
    })
    .filter((item) => parseInningsToOuts(String(item.innings ?? "")) > 0)
    .slice(0, 2)
    .map((item) => String(item.name));

  return [...new Set([...hitterNames, ...pitcherNames])].slice(0, 4);
}

function extractKeyMoments(gameEtc: Record<string, string>): string[] {
  const mapping = [
    ["결승타", "결승타"],
    ["홈런", "홈런"],
    ["2루타", "2루타"],
    ["3루타", "3루타"],
    ["도루", "도루"],
  ] as const;

  return mapping
    .filter(([key]) => gameEtc[key])
    .map(([key, label]) => `${label}: ${gameEtc[key]}`)
    .slice(0, 4);
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

async function fetchKboGameList(targetDate: string): Promise<GameListItem[]> {
  const payload = await postFormJson<{ game: GameListItem[] }>(
    "https://www.koreabaseball.com/ws/Main.asmx/GetKboGameList",
    new URLSearchParams({
      leId: "1",
      srId: "0,1,3,4,5,6,7,8,9",
      date: targetDate.replaceAll("-", ""),
    }),
  );

  return payload.game ?? [];
}

type NewsListItem = {
  title: string;
  summary: string;
  url: string;
  published_date: string;
};

function parseBreakingNewsList(html: string): NewsListItem[] {
  const items: NewsListItem[] = [];
  const blockRegex =
    /<li>\s*<span class="photo">[\s\S]*?<strong><a href="([^"]+)">([\s\S]*?)<\/a><\/strong>\s*<p>([\s\S]*?)<span class="date">([^<]+)<\/span>/g;

  for (const match of html.matchAll(blockRegex)) {
    const [, href, rawTitle, rawSummary, rawDate] = match;
    items.push({
      title: decodeHtmlEntities(stripTags(rawTitle)),
      summary: decodeHtmlEntities(stripTags(rawSummary)),
      url: new URL(href, "https://www.koreabaseball.com/MediaNews/News/BreakingNews/").toString(),
      published_date: rawDate.trim().replaceAll(".", "-").replace(/-$/, ""),
    });
  }

  return items;
}

async function fetchBreakingNewsForGame(game: ParsedGame): Promise<NewsListItem | null> {
  const response = await fetch("https://www.koreabaseball.com/MediaNews/News/BreakingNews/List.aspx", {
    headers: {
      "User-Agent": "Mozilla/5.0",
    },
  });

  if (!response.ok) {
    return null;
  }

  const html = await response.text();
  const items = parseBreakingNewsList(html);
  const targetDate = game.game_date.replaceAll("-", ".");
  const candidates = items.filter((item) =>
    item.published_date.replaceAll("-", ".") === targetDate &&
    item.title.includes("두산") &&
    (item.title.toUpperCase().includes(game.opponent_name.toUpperCase()) ||
      item.summary.toUpperCase().includes(game.opponent_name.toUpperCase()))
  );

  return candidates[0] ?? null;
}

async function enrichGameWithOfficialDetails(game: ParsedGame): Promise<ParsedGame> {
  const officialGames = await fetchKboGameList(game.game_date);
  const officialGame = officialGames.find((item) => {
    const doosanMatches = game.home_away === "home" ? item.HOME_ID === "OB" : item.AWAY_ID === "OB";
    const opponentMatches = game.home_away === "home"
      ? item.AWAY_NM.toUpperCase() === game.opponent_name.toUpperCase()
      : item.HOME_NM.toUpperCase() === game.opponent_name.toUpperCase();
    return doosanMatches && opponentMatches;
  }) ?? officialGames.find((item) => item.AWAY_ID === "OB" || item.HOME_ID === "OB");

  if (!officialGame) {
    return game;
  }

  const gameId = normalizeGameId(officialGame.G_ID);
  const commonForm = new URLSearchParams({
    leId: String(officialGame.LE_ID),
    srId: String(officialGame.SR_ID),
    seasonId: String(officialGame.SEASON_ID),
    gameId,
  });

  const [scoreboardDetail, boxScoreDetail, pitcherKey, hitterKey, breakingNews] = await Promise.all([
    postFormJson<Record<string, unknown>>(
      "https://www.koreabaseball.com/ws/Schedule.asmx/GetScoreBoardScroll",
      commonForm,
    ),
    postFormJson<Record<string, unknown>>(
      "https://www.koreabaseball.com/ws/Schedule.asmx/GetBoxScoreScroll",
      commonForm,
    ),
    postFormJson<{ record: Record<string, unknown>[] }>(
      "https://www.koreabaseball.com/ws/Schedule.asmx/GetKeyPlayerPitcher",
      new URLSearchParams({
        leId: String(officialGame.LE_ID),
        srId: String(officialGame.SR_ID),
        gameId,
        groupSc: "INN2_CN",
        sort: "DESC",
      }),
    ),
    postFormJson<{ record: Record<string, unknown>[] }>(
      "https://www.koreabaseball.com/ws/Schedule.asmx/GetKeyPlayerHitter",
      new URLSearchParams({
        leId: String(officialGame.LE_ID),
        srId: String(officialGame.SR_ID),
        gameId,
        groupSc: "HIT_CN",
        sort: "DESC",
      }),
    ),
    fetchBreakingNewsForGame(game),
  ]);

  const arrHitter = Array.isArray(boxScoreDetail.arrHitter)
    ? boxScoreDetail.arrHitter as Record<string, unknown>[]
    : [];
  const arrPitcher = Array.isArray(boxScoreDetail.arrPitcher)
    ? boxScoreDetail.arrPitcher as Record<string, unknown>[]
    : [];
  const isDoosanHome = game.home_away === "home";
  const doosanHitters = extractHitterSummaries(arrHitter[isDoosanHome ? 1 : 0] ?? {});
  const doosanPitchers = extractPitcherSummaries(arrPitcher[isDoosanHome ? 1 : 0] ?? {});
  const gameEtc = extractGameEtc(String(boxScoreDetail.tableEtc ?? "{}"));
  const topPlayers = extractTopPlayerNames(doosanHitters, doosanPitchers);
  const keyMoments = extractKeyMoments(gameEtc);

  return {
    ...game,
    top_players: topPlayers,
    poor_players: [],
    key_moments: keyMoments,
    metadata: {
      ...game.metadata,
      official_game_id: gameId,
      le_id: officialGame.LE_ID,
      sr_id: officialGame.SR_ID,
      season_id: officialGame.SEASON_ID,
      crowd: scoreboardDetail.CROWD_CN ?? null,
      start_time: scoreboardDetail.START_TM ?? null,
      end_time: scoreboardDetail.END_TM ?? null,
      run_time: scoreboardDetail.USE_TM ?? null,
      full_home_name: scoreboardDetail.FULL_HOME_NM ?? null,
      full_away_name: scoreboardDetail.FULL_AWAY_NM ?? null,
      game_etc: gameEtc,
      doosan_top_hitters: doosanHitters,
      doosan_pitchers: doosanPitchers,
      official_key_pitchers: pitcherKey.record ?? [],
      official_key_hitters: hitterKey.record ?? [],
      breaking_news: breakingNews,
    },
    raw_payload: {
      ...game.raw_payload,
      official_game_list_item: officialGame,
      official_scoreboard_detail: scoreboardDetail,
      official_boxscore_detail: boxScoreDetail,
      official_breaking_news: breakingNews,
    },
  };
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
    const parsedGames = parseGamesFromHtml(html, targetDate);
    const normalizedGames = await Promise.all(parsedGames.map((game) => enrichGameWithOfficialDetails(game)));

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
