import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const root = resolve(import.meta.dirname, '..');
const mobile = readFileSync(resolve(root, 'app/echo.js'), 'utf8');
const stable = readFileSync(resolve(root, 'assets/fw-stable-core.js'), 'utf8');
const social = readFileSync(resolve(root, 'assets/fw-social.js'), 'utf8');
const appIndex = readFileSync(resolve(root, 'app/index.html'), 'utf8');
const serviceWorker = readFileSync(resolve(root, 'app/sw.js'), 'utf8');

function functionBody(source, start, end){
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `找不到函数范围：${start}`);
  return source.slice(from, to);
}

const mobileLoad = functionBody(mobile, 'async function load(force)', 'function flattenComments');
assert.ok(mobileLoad.indexOf('list.innerHTML = toolbar') < mobileLoad.indexOf('await markRead(unreadIds)'), '手机端必须先成功展示提醒，再把当前快照标为已读');
assert.match(mobileLoad, /if\(unreadIds\.length\) await markRead\(unreadIds\)/, '手机端打开回声后应自动清除当前未读');
assert.match(mobile, /function ensureLoaded\(\)\{ load\(true\); \}/, '手机端每次进入回声都应读取最新快照');

const stableOpen = functionBody(stable, 'async function openEcho()', 'window.fwOpenStableEcho = openEcho');
assert.ok(stableOpen.indexOf('body.innerHTML = toolbar + rows.map') < stableOpen.indexOf('await markEchoRead(unread)'), '电脑稳定面板必须先展示成功，再自动已读');
assert.match(stableOpen, /if\(unread\.length\) await markEchoRead\(unread\)/, '电脑稳定面板打开后应自动清除当前未读');

const socialOpen = functionBody(social, 'async function openEcho()', 'async function getFriendships');
assert.ok(socialOpen.indexOf('body.innerHTML = toolbar') < socialOpen.indexOf('await markEchoRead(unreadIds)'), '电脑社交面板必须先展示成功，再自动已读');
assert.match(socialOpen, /if\(unreadIds\.length\) await markEchoRead\(unreadIds\)/, '电脑社交面板打开后应自动清除当前未读');

assert.match(appIndex, /echo\.js\?v=echo-auto-read-20260808-1/, '手机端 echo.js 应刷新缓存版本');
assert.match(serviceWorker, /fw-mobile-app-pwa-windows-download-20260810-1/, 'PWA 缓存名应刷新');

console.log('echo open auto-read checks passed');
