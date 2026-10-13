import test from 'node:test';
import assert from 'node:assert/strict';
import {POST_TEXT_LIMIT,COMMENT_TEXT_LIMIT,mediaKind,validateAttachments,composeContent,parseContent} from '../src/square-media.js';

const image=i=>({kind:'image',url:`https://example.com/photo${i}.jpg`});
test('post and comment text limits are 300, separate from attachment markers',()=>{
  assert.equal(POST_TEXT_LIMIT,300);assert.equal(COMMENT_TEXT_LIMIT,300);
  const text='字'.repeat(300),content=composeContent(text,{attachments:Array.from({length:4},(_,i)=>image(i))});
  assert.ok(content.length>300);assert.equal(parseContent(content).text,text);
});
test('four photos, GIFs and custom stickers share a limit, with no silent truncation',()=>{
  const items=[image(1),{kind:'image',file:{name:'a.gif',type:'image/gif',size:100}},...Array.from({length:2},(_,i)=>({kind:'sticker',url:`https://example.com/${i}.gif`}))];
  assert.equal(validateAttachments(items).length,4);
  assert.throws(()=>validateAttachments([...items,image(3)]),/合计最多 4/);
  assert.throws(()=>composeContent('',{stickerUrls:Array.from({length:5},(_,i)=>image(i).url)}),/合计最多 4/);
});
test('one video is allowed, mixed or multiple videos and oversized media are rejected',()=>{
  const video={kind:'video',file:{name:'live.mp4',type:'video/mp4',size:10}};
  assert.equal(validateAttachments([video]).length,1);
  assert.throws(()=>validateAttachments([video,image(1)]),/单独发送/);
  assert.throws(()=>validateAttachments([video,video]),/1 个视频/);
  assert.throws(()=>validateAttachments([{...video,file:{...video.file,size:20*1024*1024+1}}]),/20MB/);
  assert.throws(()=>validateAttachments([{kind:'image',file:{name:'a.gif',type:'image/gif',size:3*1024*1024+1}}]),/3MB/);
});
test('legacy markers, mixed legacy video/sticker posts and Unicode URLs still decode safely',()=>{
  const legacy=`旧帖子\n[[FW_USER_STICKER:${btoa('https://example.com/a.gif')}]]\n[[FW_MEDIA_VIDEO:${btoa('https://example.com/a.mp4')}]]`;
  assert.deepEqual(parseContent(legacy).media.map(x=>x.kind),['sticker','video']);
  const items=[image(1),{kind:'sticker',url:'https://example.com/表情.gif'},image(2),image(3)];
  assert.deepEqual(parseContent(composeContent('顺序',{attachments:items})).media.map(x=>x.kind),['image','sticker','image','image']);
  assert.equal(parseContent(composeContent('',{attachments:items})).media[1].url,'https://example.com/%E8%A1%A8%E6%83%85.gif');
  for(const url of ['javascript:alert(1)','data:image/png,123','https://user:pass@example.com/x']){
    assert.throws(()=>composeContent('',{attachments:[{kind:'image',url}]}),/媒体地址无效/);
    assert.deepEqual(parseContent(`安全[[FW_MEDIA_IMAGE:${btoa(url)}]]`).media,[]);
  }
});
test('unsupported original Live Photo/HEIC files get conversion guidance',()=>{
  for(const name of ['IMG_1234.HEIC','a.heif','a.livp']){
    const file={name,type:'image/heic',size:100};assert.equal(mediaKind(file),'');
    assert.throws(()=>validateAttachments([{file,kind:mediaKind(file)}]),/实况照片请先存储为视频/);
  }
});
