(function(){
  const cfg = window.FW_SUPABASE || {};
  const hasConfig = Boolean(cfg.url && cfg.anonKey && window.supabase);
  const client = hasConfig ? window.supabase.createClient(cfg.url, cfg.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  }) : null;

  const enabled = Boolean(client);
  const getRedirectUrl = () => {
    const base = window.location.origin + window.location.pathname.replace(/[^/]*$/, '');
    return base || 'https://sanpen711.github.io/fw-lab/';
  };
  const fail = (res, label) => {
    if(res && res.error) throw new Error((label || '操作失败') + '：' + res.error.message);
    return res ? res.data : null;
  };
  const profileOf = row => Array.isArray(row?.profiles) ? (row.profiles[0] || {}) : (row?.profiles || {});
  const timeText = value => {
    if(!value) return '刚刚';
    const diff = Math.max(0, Date.now() - new Date(value).getTime());
    const min = Math.floor(diff / 60000);
    if(min < 1) return '刚刚';
    if(min < 60) return min + '分钟前';
    const h = Math.floor(min / 60);
    if(h < 24) return h + '小时前';
    const d = Math.floor(h / 24);
    return d < 7 ? d + '天前' : new Date(value).toLocaleDateString('zh-CN');
  };
  const avatarText = name => String(name || 'FW').trim().slice(0,2).toUpperCase();

  async function getCurrentUser(){
    if(!enabled) return null;
    const s = fail(await client.auth.getSession(), '读取登录状态失败')?.session;
    if(!s?.user) return null;
    const p = fail(await client.from('profiles').select('id,nickname,avatar_url,role,is_banned,created_at').eq('id', s.user.id).maybeSingle(), '读取用户资料失败') || {};
    return {
      id: s.user.id,
      email: s.user.email,
      nickname: p.nickname || s.user.user_metadata?.nickname || '临时研究员',
      avatar_url: p.avatar_url || '',
      avatarText: avatarText(p.nickname || s.user.email),
      role: p.role || 'user',
      isAdmin: p.role === 'admin',
      disabled: Boolean(p.is_banned),
      provider: 'supabase'
    };
  }

  async function sendEmailOtp({ email, nickname }){
    if(!enabled) throw new Error('还没有配置 Supabase。');
    email = String(email || '').trim();
    nickname = String(nickname || '').trim();
    const res = await client.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        data: { nickname: nickname || '临时研究员' },
        emailRedirectTo: getRedirectUrl()
      }
    });
    if(res.error) throw new Error(res.error.message);
    return { ok:true };
  }

  async function verifyEmailOtp({ email, token, nickname }){
    if(!enabled) throw new Error('还没有配置 Supabase。');
    email = String(email || '').trim();
    token = String(token || '').trim().replace(/\s/g, '');
    nickname = String(nickname || '').trim();
    const res = await client.auth.verifyOtp({ email, token, type:'email' });
    if(res.error) throw new Error(res.error.message);
    if(nickname){ await updateProfile({ nickname }); }
    return { user: await getCurrentUser(), needsConfirmation:false };
  }

  async function signInOrSignUp({email, password, nickname}){
    if(!enabled) throw new Error('还没有配置 Supabase。');
    email = String(email || '').trim();
    password = String(password || '').trim();
    nickname = String(nickname || '').trim();
    const login = await client.auth.signInWithPassword({ email, password });
    if(!login.error){
      if(nickname) await updateProfile({ nickname });
      return { user: await getCurrentUser(), needsConfirmation: false };
    }
    const signup = await client.auth.signUp({
      email,
      password,
      options: {
        data: { nickname: nickname || '临时研究员' },
        emailRedirectTo: getRedirectUrl()
      }
    });
    if(signup.error) throw new Error(signup.error.message);
    const current = await getCurrentUser().catch(() => null);
    return { user: current, needsConfirmation: !current };
  }

  async function signOut(){ if(enabled) await client.auth.signOut(); }

  async function updateProfile({nickname, avatarFile}){
    const user = await getCurrentUser();
    if(!user) throw new Error('请先登录。');
    let avatar_url = '';
    if(avatarFile && avatarFile.size){
      const safeName = avatarFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${user.id}/${Date.now()}_${safeName}`;
      fail(await client.storage.from('avatars').upload(path, avatarFile, { upsert: true, cacheControl: '3600' }), '头像上传失败');
      avatar_url = client.storage.from('avatars').getPublicUrl(path).data.publicUrl;
    }
    const patch = { updated_at: new Date().toISOString() };
    if(nickname) patch.nickname = String(nickname).trim().slice(0, 24);
    if(avatar_url) patch.avatar_url = avatar_url;
    return fail(await client.from('profiles').update(patch).eq('id', user.id).select('id,nickname,avatar_url,role,is_banned').maybeSingle(), '资料保存失败');
  }

  async function loadPosts(){
    if(!enabled) return [];
    const posts = fail(await client.from('posts').select('id,user_id,content,status_tag,created_at,profiles(nickname,avatar_url)').eq('is_deleted', false).order('created_at', { ascending:false }).limit(100), '读取帖子失败') || [];
    const ids = posts.map(p => p.id);
    if(!ids.length) return [];
    const comments = fail(await client.from('comments').select('id,post_id,user_id,content,created_at,profiles(nickname,avatar_url)').in('post_id', ids).eq('is_deleted', false).order('created_at', { ascending:true }), '读取评论失败') || [];
    const reactions = fail(await client.from('reactions').select('post_id,user_id,type').in('post_id', ids), '读取互动失败') || [];
    const commentsByPost = {};
    comments.forEach(c => {
      const p = profileOf(c);
      commentsByPost[c.post_id] = commentsByPost[c.post_id] || [];
      commentsByPost[c.post_id].push({ id:c.id, userId:c.user_id, authorName:p.nickname || '匿名回声', authorAvatar:p.avatar_url || '', content:c.content, time:timeText(c.created_at) });
    });
    const counts = {};
    reactions.forEach(r => {
      counts[r.post_id] = counts[r.post_id] || { resonance:0, same:0, tissue:0 };
      if(r.type === 'like') counts[r.post_id].resonance++;
      if(r.type === 'same') counts[r.post_id].same++;
      if(r.type === 'tissue') counts[r.post_id].tissue++;
    });
    return posts.map(p => {
      const prof = profileOf(p);
      const c = counts[p.id] || { resonance:0, same:0, tissue:0 };
      return { id:p.id, dbId:p.id, userId:p.user_id, authorId:p.user_id, authorName:prof.nickname || '匿名研究员', authorAvatar:prof.avatar_url || '', status:p.status_tag || '今日无效', content:p.content, time:timeText(p.created_at), createdAt:p.created_at, resonance:c.resonance, same:c.same, tissue:c.tissue, comments:commentsByPost[p.id] || [] };
    });
  }

  async function createPost({content, status}){
    const u = await getCurrentUser();
    if(!u) throw new Error('请先登录。');
    if(u.disabled) throw new Error('这个账号已被停用。');
    return fail(await client.from('posts').insert({ user_id:u.id, content:String(content || '').trim(), status_tag:status || '今日无效' }).select('id').single(), '发布失败');
  }
  async function createComment({postId, content}){
    const u = await getCurrentUser();
    if(!u) throw new Error('请先登录。');
    if(u.disabled) throw new Error('这个账号已被停用。');
    return fail(await client.from('comments').insert({ post_id:postId, user_id:u.id, content:String(content || '').trim() }).select('id').single(), '评论失败');
  }
  async function react({postId, type}){
    const u = await getCurrentUser();
    if(!u) throw new Error('请先登录。');
    if(u.disabled) throw new Error('这个账号已被停用。');
    const map = { resonance:'like', same:'same', tissue:'tissue', like:'like' };
    const res = await client.from('reactions').insert({ post_id:postId, user_id:u.id, type:map[type] || type });
    if(res.error){
      if(res.error.code === '23505' || String(res.error.message).includes('duplicate')) return { already:true };
      throw new Error('互动失败：' + res.error.message);
    }
    return { ok:true };
  }
  async function listUsers(){ return fail(await client.from('profiles').select('id,nickname,avatar_url,role,is_banned,created_at').order('created_at', { ascending:false }).limit(200), '读取用户列表失败') || []; }
  async function deletePost(postId){ return fail(await client.from('posts').update({ is_deleted:true }).eq('id', postId), '删除帖子失败'); }
  async function deleteComment(commentId){ return fail(await client.from('comments').update({ is_deleted:true }).eq('id', commentId), '删除评论失败'); }
  async function setUserBanned(userId, banned){ return fail(await client.rpc('admin_set_user_banned', { target_user_id:userId, banned }), '账号状态修改失败'); }
  function onAuthChange(callback){ return enabled ? client.auth.onAuthStateChange(() => callback && callback()) : null; }

  window.fwDb = { enabled, client, getCurrentUser, sendEmailOtp, verifyEmailOtp, signInOrSignUp, signOut, updateProfile, loadPosts, createPost, createComment, react, listUsers, deletePost, deleteComment, setUserBanned, onAuthChange };
})();
