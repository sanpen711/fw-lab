import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = path => fs.readFileSync(path, 'utf8');
const appLoader = read('assets/app.js');
const desktopClient = read('assets/fw-desktop-client.js');
const bird = read('assets/fw-bird.js');

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
assert.match(home, /data-web-home/, 'PC 网页首页应使用新的同步首页壳');
assert.match(home, /class="web-home-title"[^>]*>F\.w 研究所</, 'PC 网页首页应保留品牌主标题');
assert.match(home, /放下个人素质，享受缺德人生/, 'PC 网页首页应同步 Windows 当前主文案');
assert.match(home, /href="compose\.html">开始吐槽!/, 'PC 网页首页应保留发帖入口');
assert.match(home, /data-weather-open[\s\S]*data-offwork-open[\s\S]*data-feedback-open/, 'PC 网页首页应提供天气、下班倒计时和反馈三个工具');
assert.match(home, /desktop-v11\/public\/hero-office\.webp/, 'PC 网页首页应复用当前 Windows 场景图');

const compose = read('compose.html');
const square = read('square.html');
assert.match(compose, /data-post-form data-post-redirect="square\.html"/);
assert.match(compose, /class="hero-title">发牢骚</);
assert.match(square, /data-web-square-list/, '精神广场 PC 网页应提供左侧帖子列表');
assert.match(square, /class="web-square-detail"/, '精神广场 PC 网页应提供右侧帖子详情区');
assert.match(square, /class="feed-list" data-feed/, '精神广场详情区仍应复用真实帖子数据源');
assert.match(square, /href="compose\.html">发牢骚/, '精神广场发帖应跳转独立发帖页');
assert.match(square, /href="echo\.html">回声/, '精神广场应保留回声入口');
assert.match(read('assets/web-square-split-20260914.js'), /MutationObserver/, '左右双栏控制器应跟随现有帖子渲染更新');
assert.match(desktopClient, /function removeSquareComposer\(\)/);
assert.match(desktopClient, /form\.closest\('\.square-hero-compose-slot'\)/);
assert.match(appLoader, /'compose\.html':'square'/);
assert.match(appLoader, /form\.dataset\.postRedirect/);
assert.match(appLoader, /desktop-social-unread-20260811-1/);
assert.match(appLoader, /fw-desktop-client\.js\?v=desktop-badge-zero-20260811-1/);
assert.match(read('assets/supabase-auth-clean.js'), /form\.dataset\.postRedirect/);
assert.match(read('assets/supabase-live.js'), /ui-consistency-20260811-1/);
assert.match(read('assets/supabase-auth-clean.js'), /fw-desktop-login-required/);
const siteFinalTweaks = read('assets/fw-site-final-tweaks.js');
assert.match(siteFinalTweaks, /if\(\/FWYanjiusuoDesktop\\\/\/i\.test\(navigator\.userAgent \|\| ''\)\) return/, 'Windows 端必须停用会恢复私聊未读并全量轮询的旧补丁');
assert.match(read('assets/fw-home-feed-preview.js'), /FWYanjiusuoDesktop/);

const webTheme = read('assets/web-sync-20260914.css');
const webSync = read('assets/web-sync-20260914.js');
assert.match(webTheme, /--web-pink:#ff969e/, 'PC 网页视觉层应使用 Windows 当前粉色强调色');
assert.match(webSync, /play\.html/, 'PC 网页导航应包含下班开黑');
assert.match(webSync, /games\.html/, 'PC 网页导航应包含小游戏');
assert.match(webSync, /membership\.html/, 'PC 网页导航应包含会员中心');
assert.match(read('play.html'), /fw_create_game_party/, '下班开黑网页应接入真实创建组队 RPC');
assert.match(read('membership.html'), /fw_get_active_membership_styles/, '会员中心网页应读取真实会员装扮');
assert.match(read('games.html'), /desktop-v11\/public\/games\/2048\/index\.html/, '小游戏网页应复用当前 Windows 游戏资源');

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

console.log('desktop app static checks passed');