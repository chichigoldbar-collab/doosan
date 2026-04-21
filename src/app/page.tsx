import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { PostListItem } from "@/lib/types";

export const dynamic = "force-dynamic";

function statusLabel(status: string) {
  switch (status) {
    case "needs_review":
      return "검토 필요";
    case "published":
      return "발행 완료";
    case "generation_failed":
      return "생성 실패";
    default:
      return "초안 생성";
  }
}

export default async function HomePage() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("posts")
    .select(`
      id,
      title,
      summary,
      status,
      updated_at,
      games (
        id,
        game_date,
        opponent_name,
        home_away,
        score_for,
        score_against,
        result,
        venue
      )
    `)
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const posts = ((data ?? []) as Array<Record<string, unknown>>)
    .map((post) => {
      const games = Array.isArray(post.games) ? post.games[0] : post.games;
      if (!games) return null;

      return {
        id: String(post.id),
        title: (post.title as string | null) ?? null,
        summary: (post.summary as string | null) ?? null,
        status: String(post.status),
        updated_at: String(post.updated_at),
        games: {
          id: String((games as Record<string, unknown>).id),
          game_date: String((games as Record<string, unknown>).game_date),
          opponent_name: String((games as Record<string, unknown>).opponent_name),
          home_away: String((games as Record<string, unknown>).home_away),
          score_for: ((games as Record<string, unknown>).score_for as number | null) ?? null,
          score_against: ((games as Record<string, unknown>).score_against as number | null) ?? null,
          result: ((games as Record<string, unknown>).result as string | null) ?? null,
          venue: ((games as Record<string, unknown>).venue as string | null) ?? null,
        },
      } satisfies PostListItem;
    })
    .filter((item): item is PostListItem => item !== null);

  return (
    <main className="shell">
      <section className="hero">
        <span className="eyebrow">Doosan Bears x Naver Blog MVP</span>
        <h1>경기 끝나고 바로 보는 블로그 초안 보드</h1>
        <p>
          Supabase에서 수집한 경기 데이터와 생성된 포스트 초안을 한곳에서 확인하고, 수정하고,
          복사할 수 있게 만든 운영용 화면입니다. 검토 후 네이버 블로그에 붙여넣는 흐름을
          기준으로 잡았습니다.
        </p>
      </section>

      <section className="panel listPanel">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 16 }}>
          <div>
            <h2 style={{ margin: 0 }}>최근 생성된 포스트</h2>
            <p className="notice">자동 생성 결과를 먼저 보고, 상세 화면에서 제목과 본문을 다듬으면 됩니다.</p>
          </div>
        </div>

        <div className="cards">
          {posts.length === 0 ? (
            <div className="card">
              <strong>아직 생성된 포스트가 없습니다.</strong>
              <p className="meta">Cron이 돌아가거나 함수를 수동 호출하면 카드가 채워집니다.</p>
            </div>
          ) : (
            posts.map((post) => (
              <Link key={post.id} href={`/posts/${post.id}`} className="card">
                <span className={`status ${post.status}`}>{statusLabel(post.status)}</span>
                <h3 style={{ margin: "0 0 8px" }}>{post.title ?? `${post.games.opponent_name}전 초안`}</h3>
                <p className="meta" style={{ marginTop: 0 }}>
                  {post.games.game_date} · {post.games.home_away === "home" ? "홈" : "원정"} ·{" "}
                  {post.games.score_for ?? "?"}:{post.games.score_against ?? "?"}
                </p>
                <p style={{ marginBottom: 0, lineHeight: 1.6 }}>
                  {post.summary ?? "한줄 요약이 아직 없습니다."}
                </p>
              </Link>
            ))
          )}
        </div>
      </section>
    </main>
  );
}
