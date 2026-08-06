import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync, readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const appDir = resolve(root, 'app');
const read = name => readFileSync(resolve(appDir, name), 'utf8');

const index = read('index.html');
const initialScripts = [...index.matchAll(/<script\s+src="([^"]+)"/g)].map(match => match[1]);
const deferredPattern = /buddy-chat-(?:tweaks|polish|bottom-fix|scroll-fix|entry-fix)|buddy-contacts-actions|mobile-buddy-chat-swipe|report\.js|bird-tweaks/;
assert.equal(initialScripts.filter(src => deferredPattern.test(src)).length, 0, '栏目增强脚本不应在首页常驻加载');
assert.ok(initialScripts.length <= 20, `手机首页脚本数量回升：${initialScripts.length}`);

const forbiddenIntervals = [500, 1200, 1500, 1600, 2000, 2500, 3000, 4500, 7500, 9000];
const runtimeFiles = [
  'buddy.js', 'buddy-read-tweaks.js', 'buddy-chat-read-fix.js', 'buddy-chat-tweaks.js',
  'buddy-chat-polish.js', 'buddy-chat-bottom-fix.js', 'buddy-chat-scroll-fix.js',
  'buddy-chat-entry-fix.js', 'buddy-contacts-actions.js', 'report.js', 'comment-thread-tidy.js'
];
for(const file of runtimeFiles){
  const source = read(file);
  for(const delay of forbiddenIntervals){
    assert.ok(!new RegExp(`setInterval\\s*\\([^\\n]*[, ]${delay}\\s*\\)`).test(source), `${file} 恢复了 ${delay}ms 高频轮询`);
  }
}

const core = read('mobile-core-fixes.js');
assert.match(core, /fw:app-viewchange/);
assert.match(core, /ensureSquareModules/);
assert.match(core, /ensureBuddyModules/);
assert.match(read('feed.js'), /dataset\.feedSignature/);
assert.match(read('feed.js'), /fw:feed-rendered/);

const activity = readFileSync(resolve(root, 'android-app/app/src/main/java/com/fwyanjiusuo/app/MainActivity.java'), 'utf8');
const androidBuild = readFileSync(resolve(root, 'android-app/app/build.gradle'), 'utf8');
assert.match(activity, /webView\.pauseTimers\(\)/);
assert.match(activity, /webView\.resumeTimers\(\)/);
assert.match(activity, /fw:app-native-lifecycle/);
assert.match(androidBuild, /versionCode\s*=\s*7/);
assert.match(androidBuild, /versionName\s*=\s*"1\.0\.6"/);

for(const file of readdirSync(appDir).filter(name => name.endsWith('.js'))){
  execFileSync(process.execPath, ['--check', resolve(appDir, file)], {stdio:'pipe'});
}

console.log(`mobile performance static checks passed (${initialScripts.length} initial scripts)`);
