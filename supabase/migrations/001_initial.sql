-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Games
create table public.games (
  id uuid primary key default uuid_generate_v4(),
  admin_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  status text not null default 'draft' check (status in ('draft', 'active', 'completed')),
  wrong_answer_penalty boolean not null default true,
  final_jeopardy_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Rounds
create table public.rounds (
  id uuid primary key default uuid_generate_v4(),
  game_id uuid references public.games(id) on delete cascade not null,
  name text not null default 'Round 1',
  "order" int not null default 0,
  created_at timestamptz not null default now()
);

-- Categories
create table public.categories (
  id uuid primary key default uuid_generate_v4(),
  round_id uuid references public.rounds(id) on delete cascade not null,
  name text not null,
  "order" int not null default 0,
  created_at timestamptz not null default now()
);

-- Questions
create table public.questions (
  id uuid primary key default uuid_generate_v4(),
  category_id uuid references public.categories(id) on delete cascade not null,
  points int not null default 100,
  text text not null default '',
  answer text not null default '',
  "order" int not null default 0,
  is_double boolean not null default false,
  double_type text check (double_type in ('wagerable', 'static_max')),
  double_max_wager int,
  is_final_jeopardy boolean not null default false,
  created_at timestamptz not null default now()
);

-- Teams
create table public.teams (
  id uuid primary key default uuid_generate_v4(),
  game_id uuid references public.games(id) on delete cascade not null,
  name text not null,
  color text not null default '#3B82F6',
  "order" int not null default 0,
  created_at timestamptz not null default now()
);

-- Game Sessions
create table public.game_sessions (
  id uuid primary key default uuid_generate_v4(),
  game_id uuid references public.games(id) on delete cascade not null,
  status text not null default 'active' check (status in ('active', 'final_jeopardy', 'completed')),
  current_round_id uuid references public.rounds(id),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  board_state jsonb not null default '{}'::jsonb
);

-- Session Teams (scores)
create table public.session_teams (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid references public.game_sessions(id) on delete cascade not null,
  team_id uuid references public.teams(id) on delete cascade not null,
  score int not null default 0,
  unique(session_id, team_id)
);

-- Question Attempts
create table public.question_attempts (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid references public.game_sessions(id) on delete cascade not null,
  question_id uuid references public.questions(id) not null,
  picking_team_id uuid references public.teams(id) not null,
  answering_team_id uuid references public.teams(id) not null,
  is_correct boolean not null,
  points_delta int not null,
  wager_amount int,
  attempted_at timestamptz not null default now()
);

-- Final Jeopardy Submissions
create table public.final_jeopardy_submissions (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid references public.game_sessions(id) on delete cascade not null,
  team_id uuid references public.teams(id) not null,
  wager_amount int not null default 0,
  is_correct boolean,
  submitted_at timestamptz not null default now(),
  unique(session_id, team_id)
);

-- Updated at trigger
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger games_updated_at
  before update on public.games
  for each row execute function update_updated_at();

-- RLS Policies
alter table public.games enable row level security;
alter table public.rounds enable row level security;
alter table public.categories enable row level security;
alter table public.questions enable row level security;
alter table public.teams enable row level security;
alter table public.game_sessions enable row level security;
alter table public.session_teams enable row level security;
alter table public.question_attempts enable row level security;
alter table public.final_jeopardy_submissions enable row level security;

-- Games: admin owns them
create policy "Admins manage own games" on public.games
  for all using (admin_id = auth.uid());

-- Rounds: via game ownership
create policy "Admins manage rounds" on public.rounds
  for all using (
    game_id in (select id from public.games where admin_id = auth.uid())
  );

-- Categories: via round -> game ownership
create policy "Admins manage categories" on public.categories
  for all using (
    round_id in (
      select r.id from public.rounds r
      join public.games g on g.id = r.game_id
      where g.admin_id = auth.uid()
    )
  );

-- Questions: via category -> round -> game ownership
create policy "Admins manage questions" on public.questions
  for all using (
    category_id in (
      select c.id from public.categories c
      join public.rounds r on r.id = c.round_id
      join public.games g on g.id = r.game_id
      where g.admin_id = auth.uid()
    )
  );

-- Teams: via game ownership
create policy "Admins manage teams" on public.teams
  for all using (
    game_id in (select id from public.games where admin_id = auth.uid())
  );

-- Sessions: admin manages, public can read (for presentation)
create policy "Admins manage sessions" on public.game_sessions
  for all using (
    game_id in (select id from public.games where admin_id = auth.uid())
  );

create policy "Public can read sessions" on public.game_sessions
  for select using (true);

-- Session teams: admin manages, public reads
create policy "Admins manage session teams" on public.session_teams
  for all using (
    session_id in (
      select gs.id from public.game_sessions gs
      join public.games g on g.id = gs.game_id
      where g.admin_id = auth.uid()
    )
  );

create policy "Public can read session teams" on public.session_teams
  for select using (true);

-- Question attempts: admin manages, public reads
create policy "Admins manage attempts" on public.question_attempts
  for all using (
    session_id in (
      select gs.id from public.game_sessions gs
      join public.games g on g.id = gs.game_id
      where g.admin_id = auth.uid()
    )
  );

create policy "Public can read attempts" on public.question_attempts
  for select using (true);

-- Final jeopardy: admin manages, public reads
create policy "Admins manage final jeopardy" on public.final_jeopardy_submissions
  for all using (
    session_id in (
      select gs.id from public.game_sessions gs
      join public.games g on g.id = gs.game_id
      where g.admin_id = auth.uid()
    )
  );

create policy "Public can read final jeopardy" on public.final_jeopardy_submissions
  for select using (true);

-- Public read for game structure (needed for presentation screen)
create policy "Public can read teams" on public.teams
  for select using (true);

create policy "Public can read questions" on public.questions
  for select using (true);

create policy "Public can read categories" on public.categories
  for select using (true);

create policy "Public can read rounds" on public.rounds
  for select using (true);

-- Enable Realtime for game_sessions and session_teams
alter publication supabase_realtime add table public.game_sessions;
alter publication supabase_realtime add table public.session_teams;
