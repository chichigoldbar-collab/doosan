import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { ImageCandidate, PostDetail } from "@/lib/types";
import { PostEditor } from "./editor";

export const dynamic = "force-dynamic";

function resultLabel(result: string | null) {
  if (result === "win") return "승리";
  if (result === "loss") return "패배";
  if (result === "draw") return "무승부";
  return "진행 상태 확인 필요";
}

export default async function PostDetailPage({ params }: { params: Promise<{ id: string }> }) {
  noStore();
  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { data: post, error: postError } = await supabase
    .from("posts")
    .select(`
      id,
      title,
      summary,
      body,
      editable_title,
      editable_body,
      editable_tags,
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
        venue,
        summary,
        metadata
      )
    `)
    .eq("id", id)
    .single();

  if (postError) {
    notFound();
  }

  const rawItem = post as Record<string, unknown>;
  const rawGame = Array.isArray(rawItem.games) ? rawItem.games[0] : rawItem.games;
  const game = rawGame as Record<string, unknown>;
  const item: PostDetail = {
    id: String(rawItem.id),
    title: (rawItem.title as string | null) ?? null,
    summary: (rawItem.summary as string | null) ?? null,
    body: (rawItem.body as string | null) ?? null,
    editable_title: (rawItem.editable_title as string | null) ?? null,
    editable_body: (rawItem.editable_body as string | null) ?? null,
    editable_tags: (rawItem.editable_tags as string | null) ?? null,
    status: String(rawItem.status),
    updated_at: String(rawItem.updated_at),
    games: {
      id: String(game.id),
      game_date: String(game.game_date),
      opponent_name: String(game.opponent_name),
      home_away: String(game.home_away),
      score_for: (game.score_for as number | null) ?? null,
      score_against: (game.score_against as number | null) ?? null,
      result: (game.result as string | null) ?? null,
      venue: (game.venue as string | null) ?? null,
      summary: (game.summary as string | null) ?? null,
      metadata: (game.metadata as PostDetail["games"]["metadata"]) ?? null,
    },
  };
  const { data: images, error: imagesError } = await supabase
    .from("image_candidates")
    .select("*")
    .eq("game_id", item.games.id);

  if (imagesError) {
    throw new Error(imagesError.message);
  }

  const imageItems = (images ?? []) as ImageCandidate[];

  return (
    <main className="shell">
      <section className="hero">
        <span className="eyebrow">Draft Detail</span>
        <h1>{item.games.opponent_name}전 초안 검토</h1>
        <p>
          경기 메타를 보면서 제목과 본문을 다듬고, 복사 버튼으로 바로 네이버 블로그 작성창에
          붙여넣을 수 있게 구성했습니다.
        </p>
      </section>

      <div className="detailGrid">
        <aside className="panel sidePanel">
          <Link href="/" className="button ghost" style={{ display: "inline-flex", marginBottom: 16 }}>
            목록으로
          </Link>
          <h2 style={{ marginTop: 0 }}>
            두산 vs {item.games.opponent_name} · {resultLabel(item.games.result)}
          </h2>
          <p className="meta">
            {item.games.game_date} · {item.games.home_away === "home" ? "홈" : "원정"} ·{" "}
            {item.games.venue ?? "구장 미확인"}
          </p>
          <p style={{ fontSize: 28, fontWeight: 800, margin: "10px 0" }}>
            {item.games.score_for ?? "?"}:{item.games.score_against ?? "?"}
          </p>
          <p>{item.summary ?? item.games.summary ?? "요약이 아직 없습니다."}</p>

          <div style={{ marginTop: 20 }}>
            <h3>메타 정보</h3>
            <p className="small">업데이트: {new Date(item.updated_at).toLocaleString("ko-KR")}</p>
            <p className="small">승리투수: {item.games.metadata?.winning_pitcher ?? "-"}</p>
            <p className="small">패전투수: {item.games.metadata?.losing_pitcher ?? "-"}</p>
            <p className="small">경기 시간: {item.games.metadata?.game_time ?? "-"}</p>
          </div>
        </aside>

        <section className="panel editorPanel">
          <PostEditor
            postId={item.id}
            initialTitle={item.editable_title ?? item.title ?? ""}
            initialBody={item.editable_body ?? item.body ?? ""}
            initialTags={item.editable_tags ?? ""}
            images={imageItems}
            initialStatus={item.status}
          />
        </section>
      </div>
    </main>
  );
}
