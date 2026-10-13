import test from 'node:test';
import assert from 'node:assert/strict';
import {webUrl,renderWebLinks} from '../src/external-links.js';

test('web links preserve query parameters and support www and international addresses',()=>{
  assert.equal(webUrl('https://example.com/watch?v=one&lang=zh#comments'),'https://example.com/watch?v=one&lang=zh#comments');
  assert.equal(webUrl('www.example.com/path'),'https://www.example.com/path');
  assert.equal(webUrl('http://example.com:8080/path'),'http://example.com:8080/path');
  assert.ok(webUrl('https://例子.中国/页面').startsWith('https://xn--'));
});

test('sentence punctuation stays outside links while balanced URL brackets remain',()=>{
  const html=renderWebLinks('看看：https://example.com/a(b))。另一个 www.example.org/path!');
  assert.ok(html.includes('href="https://example.com/a(b)"'));
  assert.ok(html.includes('https://example.com/a(b)</a>)。'));
  assert.ok(html.includes('www.example.org/path</a>!'));
  assert.equal((html.match(/<a /g)||[]).length,2);
  assert.ok(renderWebLinks('IPv6 http://[::1]:8080/path').includes('href="http://[::1]:8080/path"'));
});

test('HTML is escaped and query ampersands do not change their address',()=>{
  const html=renderWebLinks('<img src=x onerror=alert(1)> https://example.com/?a=1&b=2');
  assert.ok(html.startsWith('&lt;img'));
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('href="https://example.com/?a=1&amp;b=2"'));
});

test('unsupported protocols, credentials and ambiguous whitespace are not active links',()=>{
  for(const value of ['javascript:alert(1)','file:///C:/Windows/cmd.exe','data:text/html,test','ftp://example.com/file','https://user:pass@example.com/','https://example.com\n','https://example.com/white space','https://example.com\\path','https://'])assert.equal(webUrl(value),'',value);
  const html=renderWebLinks('javascript:alert(1) file:///tmp/x https://user:pass@example.com/ 联系 me@www.example.com');
  assert.ok(!html.includes('<a '));
  assert.equal(webUrl('https://example.com/'+'x'.repeat(4096)),'');
});
