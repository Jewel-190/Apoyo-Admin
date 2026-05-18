-- Superadmin: registered voters (mockdata.xlsx shape; voter_id Philippine-style segments).

begin;

set search_path = public;

create table if not exists public.registered_voters (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  middle_name text not null default '',
  last_name text not null,
  suffix text not null default '',
  age smallint not null,
  sex char(1) not null,
  birth_date date not null,
  barangay text not null,
  voter_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint registered_voters_age_chk check (age >= 1 and age <= 120),
  constraint registered_voters_sex_chk check (sex in ('M', 'F')),
  constraint registered_voters_voter_id_key unique (voter_id),
  constraint registered_voters_voter_id_format_chk check (
    voter_id ~ '^[0-9A-Za-z]{4}-[0-9A-Za-z]{5}-[0-9A-Za-z]{13}-[0-9A-Za-z]$'
  )
);

create index if not exists registered_voters_barangay_idx on public.registered_voters (barangay);
create index if not exists registered_voters_last_name_idx on public.registered_voters (last_name);
create index if not exists registered_voters_birth_date_idx on public.registered_voters (birth_date desc);

create or replace function public.set_registered_voters_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_registered_voters_updated_at on public.registered_voters;
create trigger trg_registered_voters_updated_at
  before update on public.registered_voters
  for each row
  execute function public.set_registered_voters_updated_at();

alter table public.registered_voters enable row level security;

drop policy if exists registered_voters_superadmin_all on public.registered_voters;
create policy registered_voters_superadmin_all on public.registered_voters
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.admins a
      where a.user_id = auth.uid()
        and lower(trim(coalesce(a.role, ''))) = 'super_admin'
    )
  )
  with check (
    exists (
      select 1
      from public.admins a
      where a.user_id = auth.uid()
        and lower(trim(coalesce(a.role, ''))) = 'super_admin'
    )
  );

grant select, insert, update, delete on public.registered_voters to authenticated;

comment on table public.registered_voters is
  'Voter registry for superadmin data management; RLS restricted to admins.role = super_admin.';
-- Seed from mockdata.xlsx (108 rows)
insert into public.registered_voters (first_name, middle_name, last_name, suffix, age, sex, birth_date, barangay, voter_id)
values
  ('Ryan', 'Flores', 'Yumul', 'Jr.', 46, 'M'::char(1), '1979-05-28'::date, 'San Agustin I', '2109-9793C-00001ZON84631-6'),
  ('Christine', 'Santos', 'Bermudez', '', 54, 'F'::char(1), '1971-05-29'::date, 'Zone I-B', '2109-6223A-00002SJO10675-7'),
  ('Clarisse', 'Ferrer', 'Arceo', '', 22, 'F'::char(1), '2004-04-23'::date, 'Salitran IV', '2110-7828D-00003PSM08268-1'),
  ('Shaira', 'Dela Cruz', 'Lopez', '', 21, 'F'::char(1), '2004-09-24'::date, 'Zone IV', '2108-8463B-00004SJO54427-9'),
  ('Joanna', '', 'Rosales', 'Sr.', 66, 'F'::char(1), '1959-12-27'::date, 'Salawag', '2108-4149A-00005BUL19234-4'),
  ('Joanna', '', 'Pineda', 'III', 29, 'F'::char(1), '1996-07-15'::date, 'Sta. Cristina I', '2108-5917A-00006SAG07793-5'),
  ('Nicole', 'Aguilar', 'Padilla', '', 57, 'F'::char(1), '1968-06-28'::date, 'Paliparan III', '2108-1093C-00007STC77481-6'),
  ('Liezl', 'Morales', 'De Vera', 'Jr.', 39, 'F'::char(1), '1987-01-14'::date, 'Zone IV', '2108-4685B-00008ZON41939-4'),
  ('Mae Ann', 'Dela Cruz', 'Dimaculangan', '', 69, 'F'::char(1), '1956-06-26'::date, 'San Agustin I', '2108-8149B-00009SAB08487-3'),
  ('John Mark', 'Salazar', 'Fernandez', '', 60, 'M'::char(1), '1965-09-23'::date, 'San Jose', '2109-5164A-00010PSM12890-8'),
  ('Daniel', 'Aguilar', 'Santiago', 'III', 67, 'M'::char(1), '1959-01-23'::date, 'Sampaloc II', '2111-1116D-00011BUL57024-5'),
  ('Jessa', 'Navarro', 'Dimaculangan', '', 70, 'F'::char(1), '1956-02-26'::date, 'Paliparan II', '2109-3414A-00012LNK51778-7'),
  ('Raymond', '', 'Del Rosario', '', 43, 'M'::char(1), '1982-11-17'::date, 'Salitran IV', '2109-5068C-00013STC17217-4'),
  ('Harold', 'Valdez', 'Lim', 'Jr.', 29, 'M'::char(1), '1996-12-02'::date, 'Sampaloc II', '2109-8373A-00014PSM62750-5'),
  ('Jayson', 'Garcia', 'Manansala', '', 35, 'M'::char(1), '1991-03-27'::date, 'Zone I-B', '2109-1260C-00015STC52609-7'),
  ('Albert', 'Salazar', 'Padilla', 'Sr.', 24, 'M'::char(1), '2002-01-02'::date, 'Salitran IV', '2111-0667A-00016BUL70363-9'),
  ('Neil', 'Pascual', 'Arceo', 'Sr.', 57, 'M'::char(1), '1968-08-03'::date, 'Paliparan I', '2111-1071B-00017ZON98149-7'),
  ('Kristine', 'Pascual', 'Dela Cruz', 'Sr.', 48, 'F'::char(1), '1977-11-23'::date, 'Sta. Cristina I', '2111-0390A-00018PAL96962-5'),
  ('Jayson', 'Flores', 'Macaraig', '', 20, 'M'::char(1), '2005-07-16'::date, 'Paliparan II', '2108-1094C-00019ZON90024-4'),
  ('Katrina', 'Ferrer', 'Lazaro', '', 60, 'F'::char(1), '1965-11-08'::date, 'Zone III', '2111-5784B-00020SMG72088-9'),
  ('Patricia', 'Mercado', 'Abad', '', 49, 'F'::char(1), '1976-05-25'::date, 'Langkaan II', '2110-9811B-00021SMG08644-6'),
  ('Rafael', 'Cruz', 'Lorenzo', '', 22, 'M'::char(1), '2003-07-06'::date, 'Burol I', '2108-0815A-00022STC29013-6'),
  ('Rhea Mae', 'Mendoza', 'Malabanan', '', 31, 'F'::char(1), '1994-09-23'::date, 'Salawag', '2110-4034C-00023PSM74367-5'),
  ('Angelo', 'Ferrer', 'Bermudez', '', 49, 'M'::char(1), '1977-01-09'::date, 'Sampaloc V', '2111-8115C-00024PSM25803-2'),
  ('Francis', 'Ferrer', 'Lazaro', '', 37, 'M'::char(1), '1989-01-08'::date, 'Zone I-B', '2111-9529C-00025ZON79101-1'),
  ('Neil', 'Mercado', 'Tuazon', '', 52, 'M'::char(1), '1974-03-26'::date, 'Zone III', '2108-9158A-00026SAG63375-3'),
  ('Glaiza', 'Domingo', 'Cabrera', '', 31, 'F'::char(1), '1995-01-29'::date, 'Paliparan I', '2110-5203C-00027PAL89635-3'),
  ('Shaira', 'Flores', 'Rosales', '', 56, 'F'::char(1), '1969-12-28'::date, 'Zone I-A', '2111-8806C-00028SAG38256-2'),
  ('Aldrin', 'Mendoza', 'Canlas', '', 32, 'M'::char(1), '1993-11-06'::date, 'San Agustin I', '2108-8655B-00029ZON24302-4'),
  ('Kenneth', 'Santos', 'Luna', '', 44, 'M'::char(1), '1982-04-28'::date, 'Salitran IV', '2110-5192C-00030PAL55707-4'),
  ('Shaira', '', 'Magtibay', '', 22, 'F'::char(1), '2004-01-15'::date, 'San Agustin II', '2108-6471A-00031SMG23767-3'),
  ('Rose Ann', 'Aquino', 'Ocampo', '', 61, 'F'::char(1), '1965-01-21'::date, 'Paliparan II', '2109-0243C-00032PSM50446-1'),
  ('Liezl', 'Ramos', 'Natividad', '', 37, 'F'::char(1), '1988-06-05'::date, 'San Agustin I', '2108-9439D-00033PSM35050-9'),
  ('Alyssa', 'Gutierrez', 'Cabrera', '', 31, 'F'::char(1), '1994-06-06'::date, 'Burol I', '2110-7153C-00034STC73759-0'),
  ('Raymond', 'Salazar', 'Macaraig', '', 67, 'M'::char(1), '1959-01-25'::date, 'Sampaloc IV', '2111-1349C-00035SJO16446-7'),
  ('Charmaine', 'Ramos', 'Javier', 'Sr.', 53, 'F'::char(1), '1972-07-29'::date, 'Zone I', '2111-0149B-00036SAB27410-1'),
  ('Kristine', 'Morales', 'Dimaculangan', '', 59, 'F'::char(1), '1966-11-05'::date, 'Paliparan III', '2109-2097C-00037ZON84532-9'),
  ('Louie', '', 'Macaraig', '', 28, 'M'::char(1), '1997-09-01'::date, 'San Jose', '2108-6482A-00038LNK46979-4'),
  ('Bianca', 'Villanueva', 'Alcantara', 'III', 26, 'F'::char(1), '1999-06-17'::date, 'Sampaloc IV', '2109-5463D-00039PSM55427-6'),
  ('Faith', '', 'Santiago', '', 29, 'F'::char(1), '1996-08-17'::date, 'Sta. Cristina II', '2109-5164C-00040ZON98468-5'),
  ('Aldrin', 'Santos', 'Marquez', '', 40, 'M'::char(1), '1985-09-01'::date, 'San Agustin I', '2109-0938C-00041LNK38526-4'),
  ('Andrea', '', 'Tuazon', '', 39, 'F'::char(1), '1986-12-02'::date, 'Zone III', '2108-5996D-00042ZON12525-5'),
  ('Joshua', 'Navarro', 'Quiambao', 'Jr.', 67, 'M'::char(1), '1958-11-15'::date, 'Sampaloc II', '2110-3489B-00043PSM95057-0'),
  ('Alyssa', 'Domingo', 'Abad', 'III', 30, 'F'::char(1), '1995-08-01'::date, 'Zone IV', '2111-7313D-00044SJO93128-7'),
  ('Daniel', 'Soriano', 'Arceo', '', 42, 'M'::char(1), '1984-01-30'::date, 'Salitran II', '2109-0225D-00045PAL98671-9'),
  ('Renz', '', 'Manansala', '', 23, 'M'::char(1), '2002-06-16'::date, 'Sta. Cristina II', '2110-3584C-00046PAL66089-2'),
  ('Gabriel', 'Gonzales', 'Evangelista', '', 65, 'M'::char(1), '1961-03-18'::date, 'Zone III', '2110-6807D-00047ZON96075-0'),
  ('Janelle', 'Santos', 'Del Rosario', '', 22, 'F'::char(1), '2004-04-05'::date, 'Salitran IV', '2108-9163B-00048STC39971-4'),
  ('Cedrick', 'Ramos', 'Luna', '', 63, 'M'::char(1), '1963-02-26'::date, 'Zone III', '2109-2256A-00049STC57880-0'),
  ('Gabriel', 'Gonzales', 'Santiago', 'Jr.', 55, 'M'::char(1), '1970-06-26'::date, 'San Jose', '2109-0345C-00050LNK20413-7'),
  ('Shaira', 'Castillo', 'Dimaculangan', 'Jr.', 18, 'F'::char(1), '2008-02-13'::date, 'San Miguel I', '2108-7814B-00051STC97260-2'),
  ('Rafael', 'Villanueva', 'Dimaculangan', '', 48, 'M'::char(1), '1978-03-23'::date, 'Burol III', '2111-0147D-00052ZON16316-9'),
  ('Cedrick', 'Ferrer', 'Magtibay', 'Sr.', 62, 'M'::char(1), '1963-07-14'::date, 'Salawag', '2109-4213C-00053LNK46205-4'),
  ('Kevin', 'Mercado', 'Dimaculangan', '', 55, 'M'::char(1), '1970-05-17'::date, 'San Miguel I', '2108-3542D-00054BUL00549-8'),
  ('Rodel', 'Panganiban', 'Beltran', '', 45, 'M'::char(1), '1981-01-08'::date, 'Sampaloc II', '2109-2923C-00055SAG11050-8'),
  ('Cedrick', 'Marquez', 'Lazaro', '', 62, 'M'::char(1), '1963-07-05'::date, 'Burol I', '2110-2673C-00056ZON72212-4'),
  ('Shaira', '', 'Reyes', '', 21, 'F'::char(1), '2004-06-23'::date, 'Paliparan II', '2109-4892A-00057LNK70997-8'),
  ('Catherine', 'Panganiban', 'Hernandez', '', 69, 'F'::char(1), '1956-12-22'::date, 'Paliparan III', '2111-8450D-00058SAG07130-6'),
  ('Rafael', 'Torres', 'Espiritu', '', 58, 'M'::char(1), '1967-05-27'::date, 'Paliparan III', '2111-3515D-00059SAG49861-9'),
  ('Shaira', 'Gonzales', 'Marquez', '', 51, 'F'::char(1), '1974-06-16'::date, 'Sampaloc III', '2110-1937B-00060LNK35895-1'),
  ('Liezl', 'Tolentino', 'Arceo', 'III', 36, 'F'::char(1), '1990-02-28'::date, 'Paliparan II', '2110-8287C-00061SAB03777-8'),
  ('Erwin', 'Ramos', 'Solis', '', 35, 'M'::char(1), '1990-12-22'::date, 'San Agustin I', '2109-4834B-00062SJO98799-9'),
  ('Allan', '', 'Bernardo', 'III', 59, 'M'::char(1), '1967-04-26'::date, 'Zone I-B', '2111-5494C-00063ZON10293-4'),
  ('Renz', 'Gutierrez', 'Ilustre', '', 52, 'M'::char(1), '1974-03-17'::date, 'Sta. Cristina I', '2109-3061B-00064ZON02345-6'),
  ('Janelle', 'Gutierrez', 'Dela Cruz', '', 30, 'F'::char(1), '1995-11-14'::date, 'San Agustin I', '2111-5427C-00065STC79438-0'),
  ('Julius', 'Castillo', 'Dela Cruz', '', 29, 'M'::char(1), '1997-03-09'::date, 'Salitran II', '2108-3054A-00066SJO20457-8'),
  ('Julius', 'Santos', 'Lim', '', 68, 'M'::char(1), '1958-01-05'::date, 'Langkaan II', '2111-4901D-00067STC22861-5'),
  ('Renz', 'Bautista', 'Pineda', 'Sr.', 69, 'M'::char(1), '1956-05-21'::date, 'Sampaloc V', '2108-7850C-00068LNK00931-5'),
  ('Joshua', '', 'Solis', '', 53, 'M'::char(1), '1972-06-23'::date, 'San Jose', '2108-4422C-00069SAB87763-6'),
  ('Christian', 'Rivera', 'Arceo', '', 25, 'M'::char(1), '2000-10-08'::date, 'Salawag', '2109-9834A-00070PSM16063-4'),
  ('Karen', 'Tolentino', 'Magtibay', '', 28, 'F'::char(1), '1997-11-11'::date, 'San Miguel I', '2111-3401C-00071LNK07680-0'),
  ('Janelle', 'Villanueva', 'Salazar', '', 61, 'F'::char(1), '1964-09-11'::date, 'Sta. Cristina I', '2108-5017B-00072SJO49472-5'),
  ('Maricel', 'Flores', 'Bernardo', 'Sr.', 19, 'F'::char(1), '2007-04-05'::date, 'Sampaloc V', '2111-3960D-00073SAL58304-9'),
  ('Princess', 'Santos', 'De Vera', '', 69, 'F'::char(1), '1956-06-07'::date, 'Sampaloc IV', '2111-9352B-00074SJO55022-8'),
  ('Daniel', 'Francisco', 'Rosales', '', 53, 'M'::char(1), '1972-05-30'::date, 'San Jose', '2111-6692C-00075LNK34164-3'),
  ('Michael', 'Castillo', 'Abad', '', 67, 'M'::char(1), '1958-07-19'::date, 'Sta. Cristina II', '2110-1317A-00076SAG73650-6'),
  ('Gabriel', 'Domingo', 'Manalo', '', 65, 'M'::char(1), '1960-09-23'::date, 'Sta. Cristina I', '2108-9435A-00077PSM53147-2'),
  ('Andrea', 'Navarro', 'Luna', 'III', 67, 'F'::char(1), '1959-02-24'::date, 'San Miguel I', '2108-4964A-00078PAL21145-2'),
  ('Rafael', 'Garcia', 'Dingcong', '', 41, 'M'::char(1), '1985-03-02'::date, 'Sta. Cristina II', '2108-5693A-00079SMG73122-6'),
  ('Erika', 'Villanueva', 'Lopez', '', 21, 'F'::char(1), '2004-05-26'::date, 'Burol III', '2109-8805C-00080PSM82824-0'),
  ('Janelle', 'Domingo', 'Dimaculangan', '', 45, 'F'::char(1), '1980-06-11'::date, 'Salitran IV', '2110-5027D-00081SMG01121-5'),
  ('Liezl', 'Marquez', 'Yumul', '', 32, 'F'::char(1), '1994-05-13'::date, 'Sampaloc I', '2108-2401D-00082PSM76721-6'),
  ('Karen', 'Francisco', 'Lopez', 'III', 45, 'F'::char(1), '1980-11-22'::date, 'Zone I-B', '2109-0473B-00083LNK93112-6'),
  ('Raymond', 'Castillo', 'Solis', '', 25, 'M'::char(1), '2001-02-22'::date, 'San Agustin III', '2110-1982A-00084BUL88919-3'),
  ('Mark Anthony', 'Flores', 'Del Rosario', '', 69, 'M'::char(1), '1956-05-20'::date, 'San Miguel II', '2108-1388C-00085SAB51643-8'),
  ('Angelo', 'Flores', 'Beltran', '', 19, 'M'::char(1), '2006-11-15'::date, 'Paliparan II', '2109-5842B-00086SAG48758-8'),
  ('Daniel', 'Bautista', 'Canlas', '', 39, 'M'::char(1), '1986-10-09'::date, 'Salawag', '2108-7885D-00087SAL16722-1'),
  ('Angelo', '', 'De Vera', '', 70, 'M'::char(1), '1955-05-15'::date, 'Zone IV', '2108-0490B-00088SAL72853-6'),
  ('Dianne', 'Reyes', 'Lopez', '', 18, 'F'::char(1), '2007-10-21'::date, 'Sta. Cristina I', '2109-9979D-00089PSM51319-9'),
  ('Renz', 'Bautista', 'Santiago', '', 69, 'M'::char(1), '1957-04-28'::date, 'Zone IV', '2111-4802C-00090LNK50084-3'),
  ('Mae Ann', 'Valdez', 'Macaraig', '', 33, 'F'::char(1), '1992-06-24'::date, 'San Miguel I', '2111-2703C-00091PAL10022-9'),
  ('Jericho', 'Morales', 'Espiritu', 'III', 43, 'M'::char(1), '1983-02-05'::date, 'Sampaloc IV', '2110-1486B-00092SMG08951-8'),
  ('Jericho', 'Aguilar', 'Bermudez', 'Sr.', 28, 'M'::char(1), '1998-01-29'::date, 'San Agustin II', '2109-2464C-00093SMG23117-6'),
  ('Daniel', 'Gonzales', 'Lopez', '', 39, 'M'::char(1), '1986-11-27'::date, 'San Miguel I', '2109-9453D-00094SMG85222-9'),
  ('Kenneth', 'Marquez', 'Tuazon', '', 29, 'M'::char(1), '1996-06-28'::date, 'Zone I-A', '2108-1667A-00095ZON55924-6'),
  ('Allan', 'Mercado', 'Luna', 'III', 57, 'M'::char(1), '1968-11-22'::date, 'San Agustin II', '2111-2205B-00096BUL38852-2'),
  ('Regine', 'Valdez', 'Santiago', '', 34, 'F'::char(1), '1992-04-18'::date, 'Zone II', '2109-7976D-00097SAG75716-6'),
  ('Maricel', 'Villanueva', 'Ilustre', '', 55, 'F'::char(1), '1970-10-08'::date, 'Zone III', '2108-1357B-00098SJO59348-2'),
  ('Jessa', 'Aquino', 'Lazaro', '', 49, 'F'::char(1), '1976-11-24'::date, 'San Miguel II', '2109-6626D-00099SJO14611-9'),
  ('Christian', 'Mendoza', 'Luna', '', 25, 'M'::char(1), '2001-04-23'::date, 'Salitran I', '2108-3224C-00100SAB60984-5'),
  ('Vincent Nohlan', 'Agustin', 'Solis', '', 19, 'M'::char(1), '2007-03-29'::date, 'Salawag', '2111-6951A-00101LNK00217-8'),
  ('Pharrell Calvin', 'Lumabi', 'De Guzman', '', 19, 'M'::char(1), '2007-01-15'::date, 'Sampaloc I', '2111-5687C-00102STC49695-6'),
  ('Malfoy', 'Valdez', 'De Vera', '', 21, 'M'::char(1), '2004-10-16'::date, 'Zone I-B', '2111-8204B-00103PAL82501-9'),
  ('Janlyn Mar', 'Barrios', 'Antonio', '', 21, 'F'::char(1), '2004-10-22'::date, 'Salitran II', '2109-5921A-00104PSM27319-5'),
  ('Clarence', '', 'Dingcong', '', 19, 'M'::char(1), '2007-02-13'::date, 'Sabang', '2108-4230D-00105PAL51570-3'),
  ('Elisha Joey', 'Ferenal', 'Bayona', '', 18, 'M'::char(1), '2007-05-30'::date, 'Zone IV', '2111-9383C-00106PSM46412-8'),
  ('Gwen Elisha', '', 'Cipriano', '', 20, 'F'::char(1), '2005-07-11'::date, 'Salitran IV', '2110-5763C-00107SAB48974-2'),
  ('Sean Alaine', 'Cerera', 'Gumiran', '', 22, 'M'::char(1), '2003-07-28'::date, 'Paliparan II', '2108-0728C-00108PAL20030-3')

on conflict (voter_id) do nothing;

commit;
