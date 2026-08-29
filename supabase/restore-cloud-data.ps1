# Restore cloud data dumps into local Postgres. Run after `npx supabase start`.
$ErrorActionPreference = "Stop"
$dumpDir = Join-Path $PSScriptRoot "tmp_cloud_dump"
$container = "supabase_db_ApoyoAdmin"
$work = "/tmp/apoyo_cloud_restore"

function Strip-Dump([string]$src, [string]$dst) {
  $text = [System.IO.File]::ReadAllText($src)
  $text = [regex]::Replace($text, '(?m)^\\restrict .*\r?\n', '')
  $text = [regex]::Replace($text, '(?m)^\\unrestrict.*\r?\n', '')
  $text = [regex]::Replace($text, '(?m)^SET transaction_timeout = 0;\r?\n', '')
  [System.IO.File]::WriteAllText($dst, $text)
}

function Extract-CopyBlocks([string]$src, [string]$dst, [string[]]$tables) {
  $text = [System.IO.File]::ReadAllText($src)
  $text = [regex]::Replace($text, '(?m)^\\restrict .*\r?\n', '')
  $text = [regex]::Replace($text, '(?m)^\\unrestrict.*\r?\n', '')
  $text = [regex]::Replace($text, '(?m)^SET transaction_timeout = 0;\r?\n', '')
  $sb = New-Object System.Text.StringBuilder
  [void]$sb.AppendLine("SET session_replication_role = replica;")
  [void]$sb.AppendLine("SET client_min_messages = warning;")
  foreach ($table in $tables) {
    $escaped = [regex]::Escape($table)
    $m = [regex]::Match($text, "(?s)COPY $escaped .*?^\\\.\r?\n")
    if (-not $m.Success) {
      Write-Host "WARN: no COPY block for $table"
      continue
    }
    [void]$sb.AppendLine($m.Value)
  }
  [void]$sb.AppendLine("SET session_replication_role = origin;")
  [System.IO.File]::WriteAllText($dst, $sb.ToString())
}

$clean = Join-Path $dumpDir "clean"
New-Item -ItemType Directory -Force -Path $clean | Out-Null

Extract-CopyBlocks (Join-Path $dumpDir "auth.sql") (Join-Path $clean "auth.sql") @(
  '"auth"."users"',
  '"auth"."identities"'
)
Strip-Dump (Join-Path $dumpDir "public.sql") (Join-Path $clean "public.sql")
Strip-Dump (Join-Path $dumpDir "private.sql") (Join-Path $clean "private.sql")
Strip-Dump (Join-Path $dumpDir "storage.sql") (Join-Path $clean "storage.sql")

docker exec $container bash -lc "rm -rf $work && mkdir -p $work"
docker cp (Join-Path $clean "auth.sql") "${container}:${work}/auth.sql"
docker cp (Join-Path $clean "public.sql") "${container}:${work}/public.sql"
docker cp (Join-Path $clean "private.sql") "${container}:${work}/private.sql"
docker cp (Join-Path $clean "storage.sql") "${container}:${work}/storage.sql"

$prep = @"
SET session_replication_role = replica;
TRUNCATE TABLE auth.identities, auth.users CASCADE;
DO `$`$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT format('%I.%I', schemaname, tablename) AS fq
    FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    EXECUTE 'TRUNCATE TABLE ' || r.fq || ' CASCADE';
  END LOOP;
  FOR r IN
    SELECT format('%I.%I', schemaname, tablename) AS fq
    FROM pg_tables
    WHERE schemaname = 'private'
  LOOP
    EXECUTE 'TRUNCATE TABLE ' || r.fq || ' CASCADE';
  END LOOP;
END
`$`$;
TRUNCATE TABLE storage.objects CASCADE;
DELETE FROM storage.buckets;
SET session_replication_role = origin;
"@

$prep | docker exec -i $container psql -U postgres -d postgres -v ON_ERROR_STOP=1
if ($LASTEXITCODE -ne 0) { throw "prep failed" }

docker exec $container psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f "$work/auth.sql"
if ($LASTEXITCODE -ne 0) { throw "auth restore failed" }
docker exec $container psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f "$work/public.sql"
if ($LASTEXITCODE -ne 0) { throw "public restore failed" }
docker exec $container psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f "$work/private.sql"
if ($LASTEXITCODE -ne 0) { throw "private restore failed" }
docker exec $container psql -U postgres -d postgres -v ON_ERROR_STOP=0 -f "$work/storage.sql"
Write-Host "restore finished"
