create extension if not exists pgcrypto;

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  external_game_id text not null unique,
  game_date date not null,
  season integer not null,
  team_name text not null default '두산베어스',
  opponent_name text not null,
  home_away text not null check (home_away in ('home', 'away')),
  status text not null check (status in ('scheduled', 'in_progress', 'finished', 'cancelled')),
  venue text,
  score_for integer,
  score_against integer,
  result text check (result in ('win', 'loss', 'draw')),
  summary text,
  starter_name text,
  top_players jsonb not null default '[]'::jsonb,
  poor_players jsonb not null default '[]'::jsonb,
  key_moments jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  title text,
  summary text,
  body text,
  tags jsonb not null default '[]'::jsonb,
  status text not null default 'draft_generated'
    check (status in ('draft_generated', 'needs_review', 'published', 'generation_failed')),
  generated_by text not null default 'openai',
  generation_model text,
  prompt_version text,
  editable_title text,
  editable_body text,
  editable_tags text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (game_id)
);

create table if not exists public.image_candidates (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  source_name text not null,
  source_url text,
  image_url text not null,
  thumbnail_url text,
  credit_note text,
  is_official boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.settings (key, value)
values (
  'blog_config',
  jsonb_build_object(
    'team_name', '두산베어스',
    'blog_owner_name', '토끼돼지',
    'timezone', 'Asia/Seoul',
    'style_prompt', '안녕하세요 토끼돼지입니다~~~! 로 자주 시작하고, 존댓말 기반에 팬 감정이 자연스럽게 섞인 블로그 톤으로 작성합니다. ~인데요, ~같습니다, ~보입니다, ㅎㅎ, ㅎㅎㅎ 표현을 자연스럽게 사용합니다.'
  )
)
on conflict (key) do nothing;

create index if not exists idx_games_game_date on public.games(game_date desc);
create index if not exists idx_games_status on public.games(status);
create index if not exists idx_posts_status on public.posts(status);
create index if not exists idx_image_candidates_game_id on public.image_candidates(game_id);
