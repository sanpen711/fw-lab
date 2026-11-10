import test from 'node:test';
import assert from 'node:assert/strict';
import {uiErrorMessage} from '../src/ui-errors.js';

test('network and provider diagnostics become helpful Chinese messages',()=>{
  assert.equal(uiErrorMessage(new Error('发送失败：TypeError: Failed to fetch')),'网络连接异常，请检查网络后重试。');
  assert.equal(uiErrorMessage({message:'permission denied for table private_messages'}),'当前账号没有操作权限，请重新登录后重试。');
  assert.equal(uiErrorMessage('读取帖子失败：upstream SQLSTATE 123'),'读取帖子失败，请稍后重试。');
  assert.equal(uiErrorMessage({message:'internal provider detail'}),'操作失败，请稍后重试。');
});
test('local validation and known file formats retain their exact guidance',()=>{
  for(const value of ['私聊最多 300 字。','请选择 JPG、PNG 或 WebP 图片。','已保存，本机立即生效。'])assert.equal(uiErrorMessage(value),value);
});
