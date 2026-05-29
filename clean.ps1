New-Item -ItemType Directory -Force -Path legacy\scripts
New-Item -ItemType Directory -Force -Path legacy\backups
New-Item -ItemType Directory -Force -Path tests\fixtures
New-Item -ItemType Directory -Force -Path reports\dev-outputs
New-Item -ItemType Directory -Force -Path docs

$scripts = @("append.js", "insert.js", "patch.cjs", "exporter_fix.cjs", "exporter_update.cjs", "exporter_update.js", "fix.cjs", "fix_cp.mjs", "fix_final.mjs", "fix_si_spaces.mjs", "safe_fix.mjs", "fix_ts.cjs", "fix_ts.mjs", "fix_ts_2.cjs", "fix_ts_2.mjs", "fix_ts_3.cjs", "fix_ts_4.cjs", "test_export.js", "test_export.mjs", "test_real.mjs", "e2e_test.mjs", "test-debug-xml.js", "test-nueva-logica.js", "test-regex.js", "test-validation.js", "validate_excel.ts", "validate_final.mjs")
foreach ($f in $scripts) { if (Test-Path $f) { Move-Item -Path $f -Destination legacy\scripts\ -Force } }

$backups = @("backup", "backup_sentinel_express_2026-05-01", "backup_sentinel_express_2026-05-01_v2", "backup_sentinel_express_version_final", "backups", "backup_sentinel_express_version_final.zip", "netlify.toml.bak", "sentinel-express-landing.bak.html")
foreach ($f in $backups) { if (Test-Path $f) { Move-Item -Path $f -Destination legacy\backups\ -Force } }
Get-ChildItem -Path vite.config.ts.timestamp-*.mjs -ErrorAction SilentlyContinue | Move-Item -Destination legacy\backups\ -Force

$fixtures = @("Test_Final_Corregido.xlsx", "Test_Live_5XMLs.xlsx", "dashboard_real_export.xlsx", "SentinelExpress_Diagnostico_20260527.xlsx", "SentinelExpress_Diagnostico_20260527_Separado.xlsx", "stress_test_export_node.xlsx", "test_output.xlsx", "test-cfdi-cedular.xml", "test-cfdi-ejemplo.xml", "debug_before_export.png", "debug_enabled.png", "demo-xmls", "stress-xmls", "test-xmls")
foreach ($f in $fixtures) { if (Test-Path $f) { Move-Item -Path $f -Destination tests\fixtures\ -Force } }

$outputs = @("build_output.txt", "test_output.txt")
foreach ($f in $outputs) { if (Test-Path $f) { Move-Item -Path $f -Destination reports\dev-outputs\ -Force } }

$docs = @("CORRECCIONES_TECNICAS.md", "ESTADO_ACTUAL.md", "GUIA_PRUEBAS.md", "INFORME_SENTINEL_EXPRESS.md", "ideas.md")
foreach ($f in $docs) { if (Test-Path $f) { Move-Item -Path $f -Destination docs\ -Force } }

git add -A
git commit -m "chore: organize repository structure"
