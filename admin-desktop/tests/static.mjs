import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const root=resolve(import.meta.dirname,'..');
const read=file=>readFileSync(resolve(root,file),'utf8');
const html=read('index.html');
const app=read('src/app.js');
const api=read('src/admin-api.js');
const css=read('styles.css');
const tauri=JSON.parse(read('src-tauri/tauri.conf.json'));

assert.match(html,/FW管理台/,'页面必须使用独立管理台名称');
assert.match(app,/举报中心/,'管理台必须提供举报中心');
assert.match(app,/问题反馈/,'管理台必须提供问题反馈');
assert.match(app,/用户管理/,'管理台必须提供用户管理');
assert.match(app,/内容管理/,'管理台必须提供内容管理');
assert.match(app,/处理记录/,'管理台必须提供处理记录');
assert.match(app,/删除被举报内容/,'举报必须支持内容处理');
assert.match(app,/禁言 30 天/,'用户处罚必须支持明确时长');
assert.match(app,/同步到公开处理公告/,'管理操作必须允许选择是否公开');
assert.match(api,/fw_get_current_profile/,'登录后必须从数据库确认管理员角色');
assert.match(api,/admin_list_feedback_tickets/,'反馈必须从正式后台工单读取');
assert.match(api,/admin_moderate_user/,'用户操作必须走受控管理员 RPC');
assert.doesNotMatch(api,/service[_-]?role/i,'安装包不得包含 service role 密钥');
assert.match(css,/--bg:#f4f5f7/,'管理台必须使用白色浅灰管理界面');
assert.equal(tauri.productName,'FW管理台');
assert.equal(tauri.identifier,'com.fwyanjiusuo.admin');
assert.equal(tauri.app.windows[0].minWidth,1080);
assert.notEqual(tauri.identifier,'com.fwyanjiusuo.desktop','管理台必须使用独立应用标识');

console.log('FW管理台静态检查通过。');
