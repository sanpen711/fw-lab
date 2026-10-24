import assert from 'node:assert/strict';
export function adaptWebFeed(source){
  const change=(before,after)=>{assert.equal(source.split(before).length-1,1,'Web feed contract: '+before.slice(0,65));source=source.replace(before,after);};
  source="import {createWebFeed} from './web-feed.js';\n"+source;
  const start=source.indexOf('async function load(force=false){'),end=source.indexOf('async function loadMine(',start);
  assert(start>=0&&end>start);
  source=source.slice(0,start)+`let webPager;
function pager(){return webPager??=createWebFeed({state,client,hydrate:hydrateSquareCache,readComments,readCounts:webReadCommentCounts,fetchProfiles,persist:async()=>{lastSyncedAt=Date.now();await persistSquareCache();},emit,fail,generation:()=>profileGeneration,signed:webAccess.signed});}
function load(force=false){return pager().load(force);}
function loadMore(){return pager().more();}

`+source.slice(end);
  change('state.posts=payload.posts.slice(0,100);','state.posts=payload.posts.slice(0,20);state.webPage={hasMore:state.posts.length===20,loadingMore:false,error:\'\'};');
  change('copyPosts(state.posts.slice(0,100))','copyPosts(state.posts.slice(0,20))');
  change("||state.mine.posts.find(post=>String(post.id)===id);","||state.mine.posts.find(post=>String(post.id)===id)||(String(state.webLinkedPost?.id)===id?state.webLinkedPost:null);");
  change('function mapPostLists(update){','function mapPostLists(update){if(state.webLinkedPost)state.webLinkedPost=update(state.webLinkedPost);');
  change('.slice(0,100);\n  if(state.mine.loaded', ';\n  if(state.mine.loaded');
  assert.equal(source.split('state.posts=[];state.profiles={};').length-1,2);
  source=source.replaceAll('state.posts=[];state.profiles={};',"state.posts=[];state.webLinkedPost=null;state.webPage={hasMore:true,loadingMore:false,error:''};webPager=null;state.profiles={};");
  change('const hydrated={...post,commentCount:webCounts?.[String(post.id)],comments,reactions};state.posts=[hydrated,...state.posts.filter(row=>String(row.id)!==id)].sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0));','const hydrated={...post,commentCount:webCounts?.[String(post.id)],comments,reactions};state.webLinkedPost=hydrated;');
  change('function removePostLocal(postId){','function removePostLocal(postId){const webRemoved=String(state.webLinkedPost?.id)===String(postId);if(webRemoved)state.webLinkedPost=null;');
  change('return state.posts.length+state.mine.posts.length!==before;}','return webRemoved||state.posts.length+state.mine.posts.length!==before;}');
  change('state.mine.posts=state.mine.posts.filter(keep).map(clean);','state.mine.posts=state.mine.posts.filter(keep).map(clean);if(state.webLinkedPost)state.webLinkedPost=keep(state.webLinkedPost)?clean(state.webLinkedPost):null;');
  change('deactivate,load,loadMine,','deactivate,load,loadMore,loadMine,');
  return source;
}
