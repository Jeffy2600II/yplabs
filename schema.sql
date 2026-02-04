-- council_users: link to supabase auth user via auth_uid
create table council_users (
  id uuid default gen_random_uuid() primary key,
  auth_uid uuid, -- supabase auth user id
  full_name text not null,
  student_id varchar(10) not null,
  year int not null,
  role text default 'member',
  approved boolean default false,
  disabled boolean default false,
  created_at timestamptz default now()
);

create unique index council_users_student_id_idx on council_users(student_id);
create index council_users_auth_uid_idx on council_users(auth_uid);

create table council_user_requests (
  id uuid default gen_random_uuid() primary key,
  full_name text not null,
  student_id varchar(10) not null,
  year int not null,
  email text,
  message text,
  created_at timestamptz default now()
);