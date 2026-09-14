import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
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

console.log('web square and echo sync checks passed');
