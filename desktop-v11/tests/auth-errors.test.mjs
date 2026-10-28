import {test} from 'node:test';
import assert from 'node:assert/strict';
import {authErrorMessage} from '../../assets/fw-auth-errors.mjs';

test('same-password reason is Chinese for SDK codes and wrapped legacy messages',()=>{
  const expected='新密码不能与原密码相同，请换一个新密码。';
  assert.equal(authErrorMessage({code:'same_password',message:'A changed provider message'}),expected);
  assert.equal(authErrorMessage(new Error('密码保存失败：New password should be different from the old password.')),expected);
});
test('password requirements retain the actual minimum and weak-password reason',()=>{
  assert.equal(authErrorMessage({code:'weak_password',message:'Password should be at least 12 characters.'}),'密码至少需要 12 位，请重新设置。');
  assert.match(authErrorMessage({code:'weak_password',reasons:['pwned'],message:'Weak password'}),/已泄露/);
});
test('common account errors and unknown provider details never expose English',()=>{
  for(const error of [
    {code:'otp_expired',message:'Token has expired or is invalid'},
    {code:'over_email_send_rate_limit',message:'Email rate limit exceeded'},
    {code:'invalid_credentials',message:'Invalid login credentials'},
    {code:'reauthentication_needed',message:'Reauthentication is required'},
    {code:'session_not_found',message:'Session not found'},
    new Error('Failed to fetch'),new Error('密码保存失败：Unexpected internal provider diagnostic')
  ]){
    const message=authErrorMessage(error);assert.match(message,/[\u3400-\u9fff]/);assert.doesNotMatch(message,/[A-Za-z]/);
  }
  assert.equal(authErrorMessage(new Error('Internal provider detail'),'密码修改失败，请稍后重试。'),'密码修改失败，请稍后重试。');
});
test('local Chinese validation and familiar image formats are preserved',()=>{
  assert.equal(authErrorMessage(new Error('密码保存失败：新密码不能与原密码相同，请换一个新密码。')),'密码保存失败：新密码不能与原密码相同，请换一个新密码。');
  assert.equal(authErrorMessage(new Error('两次密码不一致。')),'两次密码不一致。');
  assert.equal(authErrorMessage(new Error('头像仅支持 JPG、PNG 或 WebP。')),'头像仅支持 JPG、PNG 或 WebP。');
});
