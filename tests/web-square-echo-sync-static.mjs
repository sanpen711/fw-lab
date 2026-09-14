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
assert.match(html, /web-square-split-20260914\.js\?v=4/, '精神广场应刷新选中同步脚本缓存版本');

console.log('web square and echo sync checks passed');
