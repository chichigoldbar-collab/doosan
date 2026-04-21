export type PostListItem = {
  id: string;
  title: string | null;
  summary: string | null;
  status: string;
  updated_at: string;
  games: {
    id: string;
    game_date: string;
    opponent_name: string;
    home_away: string;
    score_for: number | null;
    score_against: number | null;
    result: string | null;
    venue: string | null;
  };
};

export type PostDetail = {
  id: string;
  title: string | null;
  summary: string | null;
  body: string | null;
  editable_title: string | null;
  editable_body: string | null;
  editable_tags: string | null;
  status: string;
  updated_at: string;
  games: {
    id: string;
    game_date: string;
    opponent_name: string;
    home_away: string;
    score_for: number | null;
    score_against: number | null;
    result: string | null;
    venue: string | null;
    summary: string | null;
    metadata: {
      winning_pitcher?: string | null;
      losing_pitcher?: string | null;
      game_time?: string | null;
    } | null;
  };
};

export type ImageCandidate = {
  id: string;
  source_name: string;
  source_url: string | null;
  image_url: string;
  thumbnail_url: string | null;
  credit_note: string | null;
  is_official: boolean;
};
