const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'index.html');
const appIconSource = path.join(root, 'assets', 'app-icon.svg');
const xlsxSource = path.join(root, 'vendor', 'xlsx.full.min.js');
const argon2Source = path.join(root, 'vendor', 'argon2-bundled.min.js');
const jszipSource = path.join(root, 'vendor', 'jszip.min.js');
const echartsSource = path.join(root, 'vendor', 'echarts.min.js');
const cwbCollectionsSource = path.join(root, 'src', 'core', 'cwb-collections.js');
const v4RuntimeSource = path.join(root, 'src', 'core', 'v4-runtime.js');
const v8MigrationSource = path.join(root, 'src', 'core', 'v8-migration.js');
const v8WorkspaceRuntimeSource = path.join(root, 'src', 'core', 'v8-workspace-runtime.js');
const v8PersistenceProtocolSource = path.join(root, 'src', 'core', 'v8-persistence-protocol.js');
const v8BackupCodecSource = path.join(root, 'src', 'core', 'v8-backup-codec.js');
const cwbAiSource = path.join(root, 'src', 'core', 'cwb-ai.js');
const cwbAiWorkflowSource = path.join(root, 'src', 'core', 'cwb-ai-workflow.js');
const cwbEmploymentSource = path.join(root, 'src', 'core', 'cwb-employment.js');
const cwbEmploymentResourcesSource = path.join(root, 'src', 'core', 'cwb-employment-resources.js');
const cwbBusinessSource = path.join(root, 'src', 'core', 'cwb-business.js');
const cwbExportPolicySource = path.join(root, 'src', 'core', 'cwb-export-policy.js');
const cwbV46Source = path.join(root, 'src', 'core', 'cwb-v46.js');
const v9MigrationSource = path.join(root, 'src', 'core', 'v9-migration.js');
const v10MigrationSource = path.join(root, 'src', 'core', 'v10-migration.js');
const v11MigrationSource = path.join(root, 'src', 'core', 'v11-migration.js');
const cwbLicenseSource = path.join(root, 'src', 'core', 'cwb-license.js');
const cwbUpdateSource = path.join(root, 'src', 'core', 'cwb-update.js');
const cwbTelemetrySource = path.join(root, 'src', 'core', 'cwb-telemetry.js');
const cwbV48Source = path.join(root, 'src', 'core', 'cwb-v48.js');
const cwbV46UiSource = path.join(root, 'src', 'core', 'cwb-v46-ui.js');
const cwbV47Source = path.join(root, 'src', 'core', 'cwb-v47.js');
const cwbV47UiSource = path.join(root, 'src', 'core', 'cwb-v47-ui.js');
const cwbV48UiSource = path.join(root, 'src', 'core', 'cwb-v48-ui.js');
const importWorkerSource = path.join(root, 'src', 'core', 'import-worker.js');
const welcomeEducationSceneSource = path.join(root, 'assets', 'welcome-education-scene-v2.png');
const welcomeMorningSceneSource = path.join(root, 'assets', 'welcome-morning.png');
const packageVersion = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const target = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(root, 'output', `学工智伴-v${packageVersion}.html`);

fs.mkdirSync(path.dirname(target), { recursive:true });
const html = fs.readFileSync(source, 'utf8');
// SheetJS carries legacy code-page tables as raw bytes. A base64 data script
// retains those bytes exactly and keeps the HTML parser out of the source.
const xlsxBytes = fs.readFileSync(xlsxSource);
const xlsx = xlsxBytes.toString('utf8');
const xlsxDataUrl = `data:application/javascript;base64,${xlsxBytes.toString('base64')}`;
const appIconDataUrl = `data:image/svg+xml;base64,${fs.readFileSync(appIconSource).toString('base64')}`;
const argon2 = fs.readFileSync(argon2Source, 'utf8');
const jszip = fs.readFileSync(jszipSource, 'utf8');
const echarts = fs.readFileSync(echartsSource, 'utf8');
const cwbCollections = fs.readFileSync(cwbCollectionsSource, 'utf8');
const v4Runtime = fs.readFileSync(v4RuntimeSource, 'utf8');
const v8Migration = fs.readFileSync(v8MigrationSource, 'utf8');
const v8WorkspaceRuntime = fs.readFileSync(v8WorkspaceRuntimeSource, 'utf8');
const v8PersistenceProtocol = fs.readFileSync(v8PersistenceProtocolSource, 'utf8');
const v8BackupCodec = fs.readFileSync(v8BackupCodecSource, 'utf8');
const cwbAi = fs.readFileSync(cwbAiSource, 'utf8');
const cwbAiWorkflow = fs.readFileSync(cwbAiWorkflowSource, 'utf8');
const cwbEmployment = fs.readFileSync(cwbEmploymentSource, 'utf8');
const cwbEmploymentResources = fs.readFileSync(cwbEmploymentResourcesSource, 'utf8');
const cwbBusiness = fs.readFileSync(cwbBusinessSource, 'utf8');
const cwbExportPolicy = fs.readFileSync(cwbExportPolicySource, 'utf8');
const cwbV46 = fs.readFileSync(cwbV46Source, 'utf8');
const v9Migration = fs.readFileSync(v9MigrationSource, 'utf8');
const v10Migration = fs.readFileSync(v10MigrationSource, 'utf8');
const v11Migration = fs.readFileSync(v11MigrationSource, 'utf8');
const cwbLicense = fs.readFileSync(cwbLicenseSource, 'utf8');
const cwbUpdate = fs.readFileSync(cwbUpdateSource, 'utf8');
const cwbTelemetry = fs.readFileSync(cwbTelemetrySource, 'utf8');
const cwbV48 = fs.readFileSync(cwbV48Source, 'utf8');
const cwbV46Ui = fs.readFileSync(cwbV46UiSource, 'utf8');
const cwbV47 = fs.readFileSync(cwbV47Source, 'utf8');
const cwbV47Ui = fs.readFileSync(cwbV47UiSource, 'utf8');
const cwbV48Ui = fs.readFileSync(cwbV48UiSource, 'utf8');
const importWorker = fs.readFileSync(importWorkerSource, 'utf8').replace('/*__XLSX_SOURCE__*/', xlsx);
const portableWelcomeAssets = {
  'welcome-education-scene-v2.png': `data:image/png;base64,${fs.readFileSync(welcomeEducationSceneSource).toString('base64')}`,
  'welcome-morning.png': `data:image/png;base64,${fs.readFileSync(welcomeMorningSceneSource).toString('base64')}`
};
let licensePublicKeys = {};
if (process.env.CWB_LICENSE_PUBLIC_KEYS_JSON) {
  try { licensePublicKeys = JSON.parse(process.env.CWB_LICENSE_PUBLIC_KEYS_JSON); }
  catch (error) { throw new Error(`CWB_LICENSE_PUBLIC_KEYS_JSON is not valid JSON: ${error.message}`); }
}
const purchaseUrl = String(process.env.CWB_PURCHASE_URL || '').trim();
const downloadCenterUrl = String(process.env.CWB_DOWNLOAD_CENTER_URL || '').trim();
const managedRelayUrl = String(process.env.CWB_AI_MANAGED_RELAY_URL || '').trim();
const managedRelayBaseUrl = String(process.env.CWB_AI_MANAGED_BASE_URL || '').trim();
const managedRelayModel = String(process.env.CWB_AI_MANAGED_MODEL || '').trim();
const paymentReady = ['1', 'true', 'yes', 'on'].includes(String(process.env.CWB_PAYMENT_READY || '').trim().toLowerCase());
const licenseConfig = `<script data-cwb-license-config>window.CWB_LICENSE_MODE=${JSON.stringify(String(process.env.CWB_LICENSE_MODE || 'development').trim().toLowerCase())};window.CWB_LICENSE_SERVICE_URL=${JSON.stringify(String(process.env.CWB_LICENSE_SERVICE_URL || '').trim())};window.CWB_LICENSE_PUBLIC_KEYS=${JSON.stringify(licensePublicKeys)};window.CWB_PAYMENT_READY=${JSON.stringify(paymentReady)};window.CWB_PURCHASE_URL=${JSON.stringify(purchaseUrl)};window.CWB_DOWNLOAD_CENTER_URL=${JSON.stringify(downloadCenterUrl)};window.CWB_AI_MANAGED_RELAY_URL=${JSON.stringify(managedRelayUrl)};window.CWB_AI_MANAGED_BASE_URL=${JSON.stringify(managedRelayBaseUrl)};window.CWB_AI_MANAGED_MODEL=${JSON.stringify(managedRelayModel)};</script>`;
const portable = html.replace(/<link rel="icon" type="image\/svg\+xml" href="assets\/app-icon\.svg">/,
  () => `<link rel="icon" type="image/svg+xml" href="${appIconDataUrl}">`)
  .replace(/<script defer src="vendor\/xlsx\.full\.min\.js" data-offline-xlsx><\/script>/,
  () => `<script data-offline-xlsx src="${xlsxDataUrl}"></script>`)
  .replace(/<script data-cwb-collections>[\s\S]*?<\/script>/,
    () => `<script data-cwb-collections>\n${cwbCollections}\n</script>`)
  .replace(/<script data-cwb-license-config>[\s\S]*?<\/script>/,
    () => licenseConfig)
  .replace(/<script defer src="vendor\/argon2-bundled\.min\.js" data-offline-argon2><\/script>/,
    () => `<script data-offline-argon2>\n${argon2}\n</script>`)
  .replace(/<script defer src="vendor\/jszip\.min\.js" data-offline-jszip><\/script>/,
    () => `<script data-offline-jszip>\n${jszip}\n</script>`)
  .replace(/<script defer src="vendor\/echarts\.min\.js" data-offline-echarts><\/script>/,
    () => `<script data-offline-echarts>\n${echarts}\n</script>`)
  .replace(/<script defer src="src\/core\/v4-runtime\.js" data-v4-runtime><\/script>/,
    () => `<script data-v4-runtime>\n${v4Runtime}\n</script>`)
  .replace(/<script defer src="src\/core\/v8-migration\.js" data-v8-migration><\/script>/,
    () => `<script data-v8-migration>\n${v8Migration}\n</script>`)
  .replace(/<script defer src="src\/core\/v8-persistence-protocol\.js" data-v8-persistence><\/script>/,
    () => `<script data-v8-persistence>\n${v8PersistenceProtocol}\n</script>`)
  .replace(/<script defer src="src\/core\/v8-workspace-runtime\.js" data-v8-runtime><\/script>/,
    () => `<script data-v8-runtime>\n${v8WorkspaceRuntime}\n</script>`)
  .replace(/<script defer src="src\/core\/v8-backup-codec\.js" data-v8-backup-codec><\/script>/,
    () => `<script data-v8-backup-codec>\n${v8BackupCodec}\n</script>`)
  .replace(/<script defer src="src\/core\/cwb-ai\.js" data-cwb-ai><\/script>/,
    () => `<script data-cwb-ai>\n${cwbAi}\n</script>`)
  .replace(/<script defer src="src\/core\/cwb-ai-workflow\.js" data-cwb-ai-workflow><\/script>/,
    () => `<script data-cwb-ai-workflow>\n${cwbAiWorkflow}\n</script>`)
  .replace(/<script defer src="src\/core\/cwb-employment\.js" data-cwb-employment><\/script>/,
    () => `<script data-cwb-employment>\n${cwbEmployment}\n</script>`)
  .replace(/<script defer src="src\/core\/cwb-employment-resources\.js" data-cwb-employment-resources><\/script>/,
    () => `<script data-cwb-employment-resources>\n${cwbEmploymentResources}\n</script>`)
  .replace(/<script defer src="src\/core\/cwb-business\.js" data-cwb-business><\/script>/,
    () => `<script data-cwb-business>\n${cwbBusiness}\n</script>`)
  .replace(/<script defer src="src\/core\/cwb-export-policy\.js" data-cwb-export-policy><\/script>/,
    () => `<script data-cwb-export-policy>\n${cwbExportPolicy}\n</script>`)
  .replace(/<script defer src="src\/core\/cwb-v46\.js" data-cwb-v46><\/script>/,
    () => `<script data-cwb-v46>\n${cwbV46}\n</script>`)
  .replace(/<script defer src="src\/core\/v9-migration\.js" data-v9-migration><\/script>/,
    () => `<script data-v9-migration>\n${v9Migration}\n</script>`)
  .replace(/<script defer src="src\/core\/v10-migration\.js" data-v10-migration><\/script>/,
    () => `<script data-v10-migration>\n${v10Migration}\n</script>`)
  .replace(/<script defer src="src\/core\/v11-migration\.js" data-v11-migration><\/script>/,
    () => `<script data-v11-migration>\n${v11Migration}\n</script>`)
  .replace(/<script defer src="src\/core\/cwb-license\.js" data-cwb-license><\/script>/,
    () => `<script data-cwb-license>\n${cwbLicense}\n</script>`)
  .replace(/<script defer src="src\/core\/cwb-update\.js" data-cwb-update><\/script>/,
    () => `<script data-cwb-update>\n${cwbUpdate}\n</script>`)
  .replace(/<script defer src="src\/core\/cwb-telemetry\.js" data-cwb-telemetry><\/script>/,
    () => `<script data-cwb-telemetry>\n${cwbTelemetry}\n</script>`)
  .replace(/<script defer src="src\/core\/cwb-v47\.js" data-cwb-v47><\/script>/,
    () => `<script data-cwb-v47>\n${cwbV47}\n</script>`)
  .replace(/<script defer src="src\/core\/cwb-v48\.js" data-cwb-v48><\/script>/,
    () => `<script data-cwb-v48>\n${cwbV48}\n</script>`)
  .replace(/<script(?: defer)? src="src\/core\/cwb-v46-ui\.js" data-cwb-v46-ui><\/script>/,
    () => `<script data-cwb-v46-ui>\n${cwbV46Ui}\n</script>`)
  .replace(/<script(?: defer)? src="src\/core\/cwb-v47-ui\.js" data-cwb-v47-ui><\/script>/,
    () => `<script data-cwb-v47-ui>\n${cwbV47Ui}\n</script>`)
  .replace(/<script(?: defer)? src="src\/core\/cwb-v48-ui\.js" data-cwb-v48-ui><\/script>/,
    () => `<script data-cwb-v48-ui>\n${cwbV48Ui}\n</script>`)
  .replace(/<script type="text\/plain" id="cwb-import-worker-source" data-cwb-import-worker><\/script>/,
    () => `<script type="text/plain" id="cwb-import-worker-source" data-cwb-import-worker>${importWorker.replace(/<\//g, '<\\/')}</script>`)
  .replace('</head>', () => `<script>window.__CWB_PORTABLE_ASSETS__=${JSON.stringify(portableWelcomeAssets).replace(/<\//g, '<\\/')}</script></head>`);
if (portable === html) throw new Error('Offline Excel placeholder was not found in index.html');
if (portable.includes('src/core/v4-runtime.js')) throw new Error('v4 runtime was not inlined');
if (portable.includes('href="assets/app-icon.svg"')) throw new Error('offline favicon was not inlined');
if (portable.includes('src/core/cwb-collections.js')) throw new Error('collection manifest was not inlined');
if (portable.includes('src/core/v8-migration.js')) throw new Error('v8 migration runtime was not inlined');
if (portable.includes('src/core/v8-workspace-runtime.js')) throw new Error('v8 workspace runtime was not inlined');
if (portable.includes('src/core/v8-persistence-protocol.js')) throw new Error('v8 persistence protocol was not inlined');
if (portable.includes('src/core/v8-backup-codec.js')) throw new Error('v8 backup codec was not inlined');
if (portable.includes('src/core/cwb-ai.js')) throw new Error('AI governance runtime was not inlined');
if (portable.includes('src/core/cwb-ai-workflow.js')) throw new Error('AI workflow runtime was not inlined');
if (portable.includes('src/core/cwb-employment.js')) throw new Error('Employment runtime was not inlined');
if (portable.includes('src/core/cwb-employment-resources.js')) throw new Error('Employment resources runtime was not inlined');
if (portable.includes('src/core/cwb-business.js')) throw new Error('Business runtime was not inlined');
if (portable.includes('src/core/cwb-export-policy.js')) throw new Error('Export policy runtime was not inlined');
if (portable.includes('src/core/cwb-v46.js')) throw new Error('v4.6 business runtime was not inlined');
if (portable.includes('src/core/v9-migration.js')) throw new Error('v9 migration runtime was not inlined');
if (portable.includes('src/core/v10-migration.js')) throw new Error('v10 migration runtime was not inlined');
if (portable.includes('src/core/v11-migration.js')) throw new Error('v11 migration runtime was not inlined');
if (portable.includes('src/core/cwb-license.js')) throw new Error('license runtime was not inlined');
if (portable.includes('src/core/cwb-update.js')) throw new Error('update runtime was not inlined');
if (portable.includes('src/core/cwb-telemetry.js')) throw new Error('telemetry runtime was not inlined');
if (portable.includes('src/core/cwb-v46-ui.js')) throw new Error('v4.6 UI runtime was not inlined');
if (portable.includes('src/core/cwb-v47.js')) throw new Error('v4.7 business runtime was not inlined');
if (portable.includes('src/core/cwb-v48.js')) throw new Error('v4.8 business runtime was not inlined');
if (portable.includes('src/core/cwb-v47-ui.js')) throw new Error('v4.7 UI runtime was not inlined');
if (portable.includes('src/core/cwb-v48-ui.js')) throw new Error('v4.8 UI runtime was not inlined');
if (portable.includes('vendor/argon2-bundled.min.js')) throw new Error('Argon2 runtime was not inlined');
if (portable.includes('vendor/jszip.min.js')) throw new Error('JSZip runtime was not inlined');
if (portable.includes('vendor/echarts.min.js')) throw new Error('ECharts runtime was not inlined');
if (!portable.includes('data-cwb-import-worker')) throw new Error('Import worker was not embedded');
fs.writeFileSync(target, portable, 'utf8');
console.log(`Release file created: ${target}`);
