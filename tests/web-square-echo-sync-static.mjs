import assert from 'node:assert/strict';
import {existsSync, readFileSync, statSync} from 'node:fs';
import {resolve} from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = path => readFileSync(resolve(root, path), 'utf8');

const split = read('assets/web-square-split-20260914.js');
const square = read('assets/fw-square-ui-fix.js');
const social = read('assets/fw-social.js');
const stable = read('assets/fw-stable-core.js');
const jump = read('assets/fw-notification-jump.js');
const html = read('square.html');
const inlineEcho = read('assets/web-square-echo-20260914.js');
const database = read('assets/supabase-db.js');
const postMedia = read('assets/fw-post-media-tools.js');
const emojiPanel = read('assets/fw-emoji-panel.js');
const desktopApp = read('desktop-v11/src/app.js');

const webEmojiList = source => {
  const block = source.match(/var EMOJIS = \[([\s\S]*?)\n  \];/);
  assert.ok(block, '应能读取网页版小表情列表');
  return [...block[1].matchAll(/'([^']+)'/g)].map(match => match[1]);
};
const desktopEmojiBlock = desktopApp.match(/const EMOJIS=\[([\s\S]*?)\n\];/);
assert.ok(desktopEmojiBlock, '应能读取电脑软件版小表情列表');
const desktopEmojis = [...desktopEmojiBlock[1].matchAll(/\['([^']+)','[0-9a-f]+'\]/g)].map(match => match[1]);

assert.match(split, /window\.__FW_WEB_SQUARE_SELECT__\s*=\s*function/, '网页版广场应暴露统一选帖入口');
assert.match(split, /if\(!rows\.length\)\{[\s\S]*return false;/, '帖子尚未加载时不应丢失 URL 中的目标帖子');
assert.match(split, /history\.replaceState/, '手动切换帖子后应保存当前帖子地址');
assert.match(square, /window\.__FW_SQUARE_SHOW_POST__\s*=\s*function/, '广场应能按回声目标展开较早帖子');
assert.match(square, /\\\[伏伏1:\(0\[1-9\]\|1\[0-9\]\|2\[0-4\]\)\\\]/, '网页版精神广场应只读识别伏伏1的24个有效标记');
assert.match(square, /assets\/emoji\/fufu1\//, '网页版精神广场应从独立网页资源目录读取伏伏图片');
const contentBodySource = square.match(/function contentBody\(text\)\{[\s\S]*?\n  \}\n\n  function readRaw/);
assert.ok(contentBodySource, '应能提取网页版帖子内容渲染函数');
const contentBody = Function('decode', 'esc', `${contentBodySource[0].replace(/\n\n  function readRaw[\s\S]*$/, '')}; return contentBody;`)(
  value => Buffer.from(String(value || ''), 'base64').toString('utf8'),
  value => String(value == null ? '' : value).replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]))
);
const renderedFufu = contentBody('[伏伏1:11]');
assert.match(renderedFufu, /class="fw-square-img fw-square-fufu"/, '有效伏伏标记应渲染为伏伏图片');
assert.match(renderedFufu, /assets\/emoji\/fufu1\/11\.webp/, '伏伏编号应映射到对应的网页图片资源');
assert.doesNotMatch(renderedFufu, /\[伏伏1:11\]/, '有效伏伏标记不应作为文字残留');
assert.match(contentBody('[伏伏1:25]'), /\[伏伏1:25\]/, '超出24张范围的标记不应被误识别');

const selectCall = square.indexOf("window.__FW_WEB_SQUARE_SELECT__(postId");
const stopCall = square.indexOf('event.stopImmediatePropagation', selectCall);
assert.ok(selectCall >= 0 && stopCall > selectCall, '点赞或评论截断事件前必须先同步左侧选中框');

assert.match(social, /const ECHO_TYPES = \['like','same','tissue','comment','comment_reply','chat_agree','system'\]/, '回声类型不能混入搭子和私聊提醒');
assert.match(social, /Math\.max\(\(f\.count \|\| 0\), friendNoticeCount\)/, '搭子红点应合并申请和通过提醒且避免重复计数');
assert.match(stable, /FWCommentReplyEcho\) echoRows = await window\.FWCommentReplyEcho\.merge/, '电脑端回声红点应包含旧回复兜底数据');
assert.match(stable, /\.in\('type', ECHO_TYPES\)/, '电脑端回声列表只应查询回声类型');
assert.match(jump, /__FW_SQUARE_SHOW_POST__/, '回声跳转应能展示分页之外的帖子');
assert.match(jump, /__FW_WEB_SQUARE_SELECT__/, '回声跳转应同步右侧详情与左侧选中框');
assert.match(html, /web-square-split-20260914\.js\?v=6/, '精神广场应刷新选中同步脚本缓存版本');
assert.match(html, /fw-square-ui-fix\.js\?v=fw-web-fufu-read-20260921-1/, '精神广场应刷新伏伏只读渲染脚本缓存版本');
assert.match(html, /web-square-list \.fw-square-fufu\{width:136px!important;height:136px!important/, '网页版帖子列表中的伏伏应使用136像素预览');
assert.match(html, /web-square-detail-card \.fw-square-fufu\{width:180px!important;height:180px!important/, '网页版帖子详情中的伏伏应使用180像素预览');
assert.match(html, /data-web-square-echo-toggle/, '网页版精神广场应在左栏提供回声切换按钮');
assert.match(html, /data-web-square-echo-panel/, '网页版精神广场应内嵌回声列表');
assert.doesNotMatch(html, /href="echo\.html">回声/, '网页版精神广场不应再跳转到独立回声页');
assert.match(inlineEcho, /feedPanel\.hidden=showingEcho;echoPanel\.hidden=!showingEcho/, '回声按钮应在帖子与回声列表之间原位切换');
assert.match(inlineEcho, /__FW_SQUARE_OPEN_POST_BY_ID__/, '点击回声应能读取不在首批列表中的旧帖子');
assert.match(inlineEcho, /data-web-square-echo-open/, '回声列表应提供直接查看右侧帖子的入口');
assert.match(database, /async function loadPostById\(postId\)/, '数据层应支持按回声目标读取单条帖子');
assert.match(split, /dataset\.webSquareDetailReport='1'/, '帖子举报入口应移动到详情标题栏');
assert.match(html, /web-square-detail-report/, '精神广场应提供详情标题栏举报按钮样式');
assert.doesNotMatch(square, /发送回声/, '评论提交按钮不应继续使用回声文案');
assert.match(square, />发表评论<\/button>/, '评论提交按钮应显示“发表评论”');
assert.ok(desktopEmojis.length >= 80, '电脑软件版应保留完整常用小表情');
assert.deepEqual(webEmojiList(postMedia), desktopEmojis, '网页版发帖和评论小表情应与电脑软件版完全一致');
assert.deepEqual(webEmojiList(emojiPanel), desktopEmojis, '网页版聊天小表情应与电脑软件版完全一致');
assert.match(postMedia, /insertAtCursor\(activeTarget,[\s\S]*?closeEmoji\(\)/, '选择小表情后应自动关闭面板');
assert.doesNotMatch(postMedia, /伏伏1/, '网页版发帖和评论面板不应增加伏伏发送入口');
assert.doesNotMatch(emojiPanel, /伏伏1/, '网页版聊天面板不应增加伏伏发送入口');
for(let index = 1; index <= 24; index += 1){
  const number = String(index).padStart(2, '0');
  const asset = resolve(root, 'assets/emoji/fufu1', `${number}.webp`);
  assert.ok(existsSync(asset), `网页版应包含伏伏1图片 ${number}.webp`);
  assert.ok(statSync(asset).size > 10000, `伏伏1图片 ${number}.webp 不应是空文件或低清占位图`);
}

console.log('web square and echo sync checks passed');
