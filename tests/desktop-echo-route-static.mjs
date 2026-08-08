import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = name => readFileSync(resolve(root, name), 'utf8');

const app = read('assets/app.js');
const route = read('assets/fw-echo-stable-route.js');
const square = read('square.html');

assert.match(app, /if\(!isSquare\) loadJs\("assets\/fw-stable-core\.js/, '精神广场不应恢复首屏预载稳定核心');
assert.match(route, /stableCoreSrc\s*=\s*'assets\/fw-stable-core\.js\?v=/, '回声入口应能按需加载稳定核心');
assert.match(route, /loadStableEcho\(\)\.then/, '点击回声应等待稳定核心后再打开');
assert.doesNotMatch(route, /setInterval\s*\(/, '回声按需加载不应引入常驻轮询');
assert.match(square, /assets\/app\.js\?v=comment-reply-echo-20260808-1/, '精神广场应刷新 app.js 缓存版本');

execFileSync(process.execPath, ['--check', resolve(root, 'assets/fw-echo-stable-route.js')], {stdio:'pipe'});

let clickHandler = null;
let appendedCoreCount = 0;
let openedCount = 0;
const fakeDocument = {
  scripts: [],
  querySelector(){ return null; },
  createElement(tag){
    assert.equal(tag, 'script');
    return {src:'', async:false, dataset:{}, addEventListener(){}};
  },
  body: {
    appendChild(script){
      appendedCoreCount += 1;
      fakeDocument.scripts.push(script);
      setTimeout(() => { sandbox.window.fwOpenStableEcho = () => { openedCount += 1; }; }, 0);
    }
  },
  addEventListener(type, handler){
    if(type === 'click') clickHandler = handler;
  }
};
const sandbox = {
  window: {},
  document: fakeDocument,
  Promise,
  Date,
  Error,
  Array,
  setTimeout,
  clearTimeout
};
vm.runInNewContext(route, sandbox, {filename:'fw-echo-stable-route.js'});
assert.equal(typeof clickHandler, 'function', '回声入口应注册点击处理');

const clickEvent = {
  target:{closest:selector => selector === '[data-fw-open-echo]' ? {} : null},
  preventDefault(){},
  stopPropagation(){},
  stopImmediatePropagation(){}
};
clickHandler(clickEvent);
await new Promise(resolveWait => setTimeout(resolveWait, 160));
assert.equal(appendedCoreCount, 1, '首次点击应加载一次稳定核心');
assert.equal(openedCount, 1, '稳定核心就绪后应自动打开回声');

clickHandler(clickEvent);
await new Promise(resolveWait => setTimeout(resolveWait, 20));
assert.equal(appendedCoreCount, 1, '后续点击不应重复加载稳定核心');
assert.equal(openedCount, 2, '后续点击应直接打开回声');

console.log('desktop echo on-demand route checks passed');
