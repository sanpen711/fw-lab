import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = path => readFileSync(resolve(root, path), 'utf8');

const config = JSON.parse(read('src-tauri/tauri.conf.json'));
assert.equal(config.productName, 'F.w 研究所');
assert.equal(config.identifier, 'com.fwyanjiusuo.desktop');
assert.equal(config.build.frontendDist, 'https://fwyanjiusuo.com/');
assert.deepEqual(config.bundle.targets, ['nsis']);
assert.equal(config.bundle.windows.nsis.installMode, 'currentUser');
assert.equal(config.version, '1.0.5');
assert.equal(config.app.windows[0].url, 'https://fwyanjiusuo.com/index.html');
assert.match(config.app.windows[0].userAgent, /FWYanjiusuoDesktop\/1\.0\.5/);
assert.equal(config.app.withGlobalTauri, true);
assert.deepEqual(config.app.security.capabilities[0].remote.urls, ['https://fwyanjiusuo.com/*']);
assert.deepEqual(config.app.security.capabilities[0].windows, ['main']);
assert.equal(config.app.windows[0].minWidth, 760);
assert.equal(config.app.windows[0].minHeight, 560);
assert.equal(config.bundle.createUpdaterArtifacts, true);
assert.match(config.plugins.updater.endpoints[0], /download\/windows-updater\.json$/);
assert.equal(config.plugins.updater.windows.installMode, 'basicUi');
assert.ok(config.plugins.updater.pubkey.length > 80);

const cargo = read('src-tauri/Cargo.toml');
assert.match(cargo, /tauri-plugin-single-instance/);
assert.match(cargo, /tauri-plugin-window-state/);
assert.match(cargo, /tauri-plugin-dialog/);
assert.match(cargo, /tauri-plugin-updater/);
assert.match(cargo, /serde = \{ version = "1", features = \["derive"\] \}/);

const main = read('src-tauri/src/main.rs');
assert.match(main, /get_webview_window\("main"\)/);
assert.match(main, /window\.unminimize\(\)/);
assert.match(main, /window\.set_focus\(\)/);
assert.match(main, /check_for_updates/);
assert.match(main, /update\.download\(/);
assert.match(main, /update\.install\(bytes\)/);
assert.match(main, /app\.restart\(\)/);
assert.match(main, /账号和缓存都会保留/);
assert.match(main, /app_cache_dir\(\)/);
assert.match(main, /content-cache/);
assert.doesNotMatch(main, /CACHE_MAX_FILE_BYTES|CACHE_MAX_TOTAL_BYTES|CACHE_MAX_AGE|cleanup_cache_dir/);
assert.match(main, /desktop_cache_read/);
assert.match(main, /desktop_cache_write/);
assert.match(main, /desktop_cache_remove/);
assert.match(main, /desktop_cache_status/);
assert.match(main, /valid_cache_key/);

const downloadClient = read('assets/fw-download-client.js');
assert.match(downloadClient, /FWYanjiusuoDesktop/);
assert.match(downloadClient, /download\/fw-lab-windows-latest\.exe/);

const appLoader = read('assets/app.js');
assert.match(appLoader, /isWindowsDesktopApp = \/FWYanjiusuoDesktop/);
assert.match(appLoader, /assets\/fw-desktop-cache\.js\?v=desktop-cache-all-20260811-1/);
assert.match(appLoader, /assets\/fw-stable-core\.js\?v=desktop-social-unread-20260811-1/);
assert.match(appLoader, /assets\/fw-buddy-wechat\.js\?v=desktop-social-unread-20260811-1/);
assert.match(appLoader, /assets\/fw-desktop-client\.css/);
assert.match(appLoader, /assets\/fw-desktop-client\.js/);
assert.match(appLoader, /ui-consistency-20260811-1/);
assert.match(appLoader, /isDedicatedWindowsSocialPage/);
assert.match(appLoader, /if\(!isDedicatedWindowsSocialPage\) loadJs\("assets\/fw-social\.js/);

const desktopClient = read('assets/fw-desktop-client.js');
assert.match(desktopClient, /fw-desktop-sidebar/);
assert.match(desktopClient, /'index\.html': \{key:'home'/);
assert.match(desktopClient, /'compose\.html': \{key:'compose'/);
assert.match(desktopClient, /href:'index\.html', label:'首页'/);
assert.match(desktopClient, /href="compose\.html" data-fw-desktop-compose/);
assert.match(desktopClient, /location\.href = 'compose\.html'/);
assert.doesNotMatch(desktopClient, /square\.html\?compose=1/);
assert.match(desktopClient, /fwOpenStableEcho/);
assert.match(desktopClient, /FWMobileActions\.openBuddy/);
assert.doesNotMatch(desktopClient, /location\.replace\('square\.html'\)/);
assert.match(desktopClient, /fw:desktop:scroll:/);
assert.match(desktopClient, /rel = 'prefetch'/);
assert.doesNotMatch(desktopClient, /fw:desktop:last-route|fw:desktop:session-started|resumeLastRoute|openHomeAfterUpgrade/);
assert.match(desktopClient, /markPageReady/);
assert.match(desktopClient, /beforeunload/);
assert.doesNotMatch(desktopClient, /setTimeout\(prefetchRoutes/);
assert.doesNotMatch(desktopClient, /observer\.observe\(document\.body/);
assert.doesNotMatch(desktopClient, /fw-desktop-page-title|data-fw-desktop-title/);
assert.match(desktopClient, /checkLegacyUpdater/);
assert.match(desktopClient, /fw-lab-windows-latest\.exe/);
assert.match(desktopClient, /microsoft-edge:/);
assert.doesNotMatch(desktopClient, /data-fw-legacy-download download/);
assert.match(desktopClient, /不需要卸载/);
assert.match(desktopClient, /data-fw-desktop-more/);
assert.match(desktopClient, /aria-expanded/);
assert.match(desktopClient, /href="rules\.html"/);
assert.match(desktopClient, /href="admin\.html"/);
assert.match(desktopClient, /setupMoreMenu/);
assert.doesNotMatch(desktopClient, /parentElement\.classList\.contains\('fw-has-badge'\)/, '仅具备角标能力不能被误判为存在未读');
assert.match(desktopClient, /\^\\d\+\$\/\.test\(value\) && Number\(value\) > 0/, '桌面侧栏红点必须有大于零的真实未读数');

const desktopCache = read('assets/fw-desktop-cache.js');
assert.match(desktopCache, /FWYanjiusuoDesktop/);
assert.match(desktopCache, /__TAURI__.*core.*invoke/);
assert.match(desktopCache, /desktop_cache_read/);
assert.match(desktopCache, /desktop_cache_write/);
assert.match(desktopCache, /desktop_cache_remove/);
assert.match(desktopCache, /desktop_cache_status/);
assert.match(desktopCache, /\^\[a-z0-9\]/);

const safePostLoader = read('assets/fw-load-posts-safe.js');
assert.match(safePostLoader, /loadIncremental/);
assert.match(safePostLoader, /selectActive/);
assert.match(safePostLoader, /\.gt\('id', maxReactionId\)/);
assert.match(safePostLoader, /__lastPostCacheMeta/);

const squareUi = read('assets/fw-square-ui-fix.js');
assert.match(squareUi, /square-feed-v1/);
assert.match(squareUi, /hydrateDesktopCache/);
assert.match(squareUi, /cachedReactions:cacheEnvelope\.reactions/);
assert.match(squareUi, /publicCachePosts/);

const polls = read('assets/fw-polls.js');
assert.match(polls, /rooms-polls-v1/);
assert.match(polls, /hydrateDesktopCache/);
assert.match(polls, /missingPollIds/);
assert.match(polls, /missingOptionIds/);
assert.match(polls, /delete copy\.myVote/);

const bird = read('assets/fw-bird.js');
assert.match(bird, /bird-feed-v1/);
assert.match(bird, /hydrateDesktopCache/);
assert.match(bird, /changedPostIds/);
assert.match(bird, /missingCommentIds/);
assert.match(bird, /delete copy\.myReactions/);

const archive = read('archive.html');
assert.match(archive, /archive-rankings-v1/);
assert.match(archive, /rangeSignature/);
assert.match(archive, /hydrateArchiveCache/);

const admin = read('assets/fw-admin.js');
assert.match(admin, /admin-public-logs-v1/);
assert.match(admin, /hydratePublicLogs/);
assert.doesNotMatch(admin, /write\([^)]*(users|reports|comments|posts)/);

const desktopCss = read('assets/fw-desktop-client.css');
assert.match(desktopCss, /--fw-desktop-rail/);
assert.match(desktopCss, /fw-route-home #live/);
assert.doesNotMatch(desktopCss, /fw-desktop-home/);
assert.match(desktopCss, /fw-route-compose \.compose-hero/);
assert.match(desktopCss, /fw-route-compose \.compose-page-form/);
assert.match(desktopCss, /fw-route-echo \.fw-stable-echo-modal/);
assert.match(desktopCss, /fw-route-buddy \.fw-wx-shell/);
assert.match(desktopCss, /fw-desktop-preparing body/);
assert.match(desktopCss, /body\.fw-desktop-navigating:before/);
assert.match(desktopCss, /grid-template-columns:330px minmax\(0,1fr\)/);
assert.match(desktopCss, /fw-desktop-account/);
assert.match(desktopCss, /fw-desktop-more-menu/);
assert.match(desktopCss, /fw-route-archive \.archive-hero/);
assert.match(desktopCss, /fw-desktop-login-required/);
assert.match(desktopCss, /fw-desktop-compose-disabled/);
assert.match(desktopCss, /fw-route-rooms \.polls-hero/);
assert.match(desktopCss, /fw-route-bird \.bird-hero/);
assert.doesNotMatch(desktopCss, /\.fw-desktop-page-title/);

for(const page of ['index.html','compose.html','square.html','rooms.html','bird.html','echo.html','buddy.html','archive.html','rules.html','admin.html']){
  const html = read(page);
  assert.match(html, /fw-desktop-preparing/, `${page} 应在首屏绘制前隐藏网页原始版式`);
  assert.match(html, /fw-desktop-client\.css\?v=ui-consistency-20260811-1/, `${page} 应在 head 中预载桌面壳样式`);
  assert.match(html, /assets\/app\.js\?v=desktop-badge-zero-20260811-1/, `${page} 应刷新桌面红点修复入口脚本`);
}

const home = read('index.html');
assert.doesNotMatch(home, /class="fw-desktop-home"/);
assert.match(home, /class="hero bg-night home-hero"/);
assert.match(home, /class="hero-title">F\.w 研究所</);
assert.match(home, /href="compose\.html">去发一句牢骚/);

const compose = read('compose.html');
const square = read('square.html');
assert.match(compose, /data-post-form data-post-redirect="square\.html"/);
assert.match(compose, /class="hero-title">发牢骚</);
assert.match(square, /data-post-form/);
assert.match(desktopClient, /function removeSquareComposer\(\)/);
assert.match(desktopClient, /form\.closest\('\.square-hero-compose-slot'\)/);
assert.match(square, /class="feed-list" data-feed/);
assert.match(appLoader, /'compose\.html':'square'/);
assert.match(appLoader, /form\.dataset\.postRedirect/);
assert.match(appLoader, /desktop-social-unread-20260811-1/);
assert.match(appLoader, /fw-desktop-client\.js\?v=desktop-badge-zero-20260811-1/);
assert.match(read('assets/supabase-auth-clean.js'), /form\.dataset\.postRedirect/);
assert.match(read('assets/supabase-live.js'), /ui-consistency-20260811-1/);
assert.match(read('assets/supabase-auth-clean.js'), /fw-desktop-login-required/);
const siteFinalTweaks = read('assets/fw-site-final-tweaks.js');
assert.match(siteFinalTweaks, /if\(\/FWYanjiusuoDesktop\\\/\/i\.test\(navigator\.userAgent \|\| ''\)\) return/, 'Windows 端必须停用会恢复私聊未读并全量轮询的旧补丁');
assert.match(home, /id="live"/);
assert.match(read('assets/fw-home-feed-preview.js'), /FWYanjiusuoDesktop/);


const buddy = read('assets/fw-buddy-wechat.js');
assert.match(buddy, /lastMessageSignature/);
assert.match(buddy, /data-fw-wx-retry-chat/);
assert.match(buddy, /syncDesktopComposer/);
assert.match(buddy, /fw-desktop-compose-disabled/);
assert.match(buddy, /\}, 6000\)/);
assert.doesNotMatch(buddy, /\}, 4500\)/);
assert.match(buddy, /buddy-list-v2-/);
assert.match(buddy, /hydrateBuddyCache/);
assert.match(buddy, /unread:lastUnreadMap/);
assert.match(buddy, /renderCachedBuddyState\(false\)/, '搭子缓存首屏不能用旧未读数重新制造红点');
assert.match(buddy, /lastUnreadMap\[String\(userId\)\] = 0/, '打开私聊后应立即清空本地未读摘要');
assert.match(buddy, /locallyReadBuddyIds\.forEach\(id => \{ map\[id\] = 0; \}\)/, '并发未读查询不能把刚清掉的搭子红点写回来');
assert.match(buddy, /query\.gt\('id', lastMessageId\)/, '私聊轮询应只拉取上次消息之后的新增内容');
assert.match(buddy, /Date\.now\(\) - lastFullMessageSyncAt > 60000/, '私聊应保留低频完整校准');
assert.match(buddy, /hasInitialMessageSync = true/, '空会话完成首次同步后不应每 6 秒继续全量读取');
assert.doesNotMatch(buddy, /await markPrivateReadFrom\(activeTargetId\)/, '私聊打开不应等待已读写回后才渲染');
assert.doesNotMatch(buddy, /private_messages[^]*fwDesktopCache\.write/);

const stableCore = read('assets/fw-stable-core.js');
assert.match(stableCore, /isDedicatedDesktopEcho \|\| isDedicatedDesktopBuddy/);
assert.match(stableCore, /data-fw-stable-refresh>重新加载/);
assert.match(stableCore, /echo-v2-/);
assert.match(stableCore, /missingIds/);
assert.match(stableCore, /cache\.write\(key/);
assert.match(stableCore, /saved\.rows\.map\(row => \(\{\.\.\.row, is_read:true\}\)\)/, '回声缓存只负责首屏内容，不能恢复旧红点');
assert.match(stableCore, /window\.fwRefreshDesktopBadges = refreshBadges/, '回声和搭子必须共享单一顶部未读刷新器');
assert.match(stableCore, /if\(state\.badgePromise\)\{[^]*if\(!force\) return state\.badgePromise/, '并发未读刷新应合并为一次数据库请求');
assert.match(stableCore, /await refreshBadges\(true\)/, '已读写回后应强制丢弃旧角标请求并读取最新状态');
const badgeRefresh = stableCore.slice(stableCore.indexOf('async function refreshBadges'), stableCore.indexOf('function ensureEchoPanel'));
assert.doesNotMatch(badgeRefresh, /FWCommentReplyEcho\.merge/, '周期红点刷新不应扫描评论兜底并制造幽灵未读');

const workflow = read('.github/workflows/build-windows-app.yml');
assert.match(workflow, /windows-latest/);
assert.match(workflow, /npm --prefix desktop-v11 run test:static/, '正式构建必须先验证 Windows 1.1 本地前端');
assert.match(workflow, /npx tauri build --config src-tauri\/tauri\.v11\.conf\.json --bundles nsis/, '正式构建必须使用 Windows 1.1 本地前端配置');
assert.match(workflow, /fw-lab-windows-latest\.exe/);
assert.match(workflow, /TAURI_SIGNING_PRIVATE_KEY/);
assert.match(workflow, /fw-lab-windows-1\.1\.17/);
assert.match(workflow, /version = '1\.1\.17'/);
assert.match(workflow, /fw-lab-windows-1\.0\.5-setup\.exe/, '正式发布必须保留 Windows 1.0.5 回退安装包');
assert.match(workflow, /rollbackVersion = '1\.0\.5'/);
assert.match(workflow, /fw-lab-windows-latest\.exe\.sig/);
assert.doesNotMatch(workflow, /\.nsis\.zip/);
assert.match(workflow, /windows-updater\.json/);

const pagesWorkflow = read('.github/workflows/pages.yml');
assert.match(pagesWorkflow, /workflow_run:/);
assert.match(pagesWorkflow, /Build Windows App/);

console.log('desktop app static checks passed');
