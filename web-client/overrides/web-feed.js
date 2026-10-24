// The public website reads a small, stable page at a time. A timestamp + ID
// cursor avoids skipping older posts when new posts arrive between requests.
export function createWebFeed({state,client,hydrate,readComments,readCounts,fetchProfiles,persist,emit,fail,generation,signed}){
  const size=20;
  let request=null,cursor=null,refreshQueued=false;
  const page=()=>state.webPage??={hasMore:true,loadingMore:false,error:''};
  async function load(force=false,more=false){
    if(request){if(force)refreshQueued=true;return request;}
    if(more&&!page().hasMore)return state.posts;
    if(!more&&!force&&!state.loaded)await hydrate();
    if(request){if(force)refreshQueued=true;return request;}
    if(!more&&!force&&state.loaded){cursor=state.posts.at(-1)||null;return state.posts;}
    const token=generation(),identity=signed(),previous=cursor;
    const current=()=>token===generation()&&identity===signed();
    if(more){page().loadingMore=true;page().error='';}else{state.loading=true;state.error='';}
    emit('content');
    request=(async()=>{try{
      let query=client.from('posts').select('id,user_id,content,created_at').not('is_deleted','is',true).order('created_at',{ascending:false}).order('id',{ascending:false});
      const tail=more?(cursor||state.posts.at(-1)):null;
      if(tail)query=query.or(`created_at.lt.${tail.created_at},and(created_at.eq.${tail.created_at},id.lt.${tail.id})`);
      const rows=fail(await query.limit(size),'读取精神广场失败')||[];
      if(!current())return [];
      const ids=rows.map(row=>row.id);
      const [comments,reactionResult,counts]=await Promise.all([readComments(ids),ids.length?client.from('reactions').select('id,post_id,user_id,type,created_at').in('post_id',ids).eq('type','like'):Promise.resolve({data:[]}),readCounts(ids)]);
      const reactions=fail(reactionResult,'读取互动失败')||[];
      await fetchProfiles(rows.map(row=>row.user_id).concat(comments.flatMap(row=>[row.user_id,row.reply_to_user_id])),true);
      if(!current())return [];
      const hydrated=rows.map(row=>({...row,commentCount:counts?.[String(row.id)],comments:comments.filter(c=>String(c.post_id)===String(row.id)),reactions:reactions.filter(r=>String(r.post_id)===String(row.id))}));
      const open=state.posts.find(row=>String(row.id)===String(state.openPostId));
      if(open)state.webLinkedPost=open;
      const merged=new Map((more?state.posts:[]).map(row=>[String(row.id),row]));
      hydrated.forEach(row=>merged.set(String(row.id),row));state.posts=[...merged.values()].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)||Number(b.id)-Number(a.id));
      if(rows.length)cursor=rows.at(-1);else if(!more)cursor=null;
      const byId=new Map(hydrated.map(row=>[String(row.id),row]));
      state.mine.posts=state.mine.posts.map(row=>byId.get(String(row.id))||row);
      page().hasMore=rows.length===size;page().error='';state.loaded=true;state.error='';
      await persist();return state.posts;
    }catch(error){
      if(current()){if(more){cursor=previous;page().error=error.message;}else{state.loaded=true;state.error=error.message;}}
      throw error;
    }finally{
      request=null;
      if(current()){state.loading=false;page().loadingMore=false;emit('content');}
      if(refreshQueued&&current()){refreshQueued=false;queueMicrotask(()=>load(true).catch(()=>{}));}
    }})();
    return request;
  }
  return {load,more:()=>load(false,true)};
}
