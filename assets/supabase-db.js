// F.w 研究所 Supabase DB Bridge｜登录超时修复版
// 修复点：signInPassword 只等待 Auth 登录成功，不再阻塞等待 profiles。
(function(){
  const cfg = window.FW_SUPABASE || {};
  const client = (cfg.url && cfg.anonKey && window.supabase)
    ? window.supabase.createClient(cfg.url, cfg.anonKey, {
        auth:{
          persistSession:true,
          autoRefreshToken:true,
          detectSessionInUrl:true
        }
      })
    : null;

  const enabled = !!client;
  const redirect = () => window.location.origin + window.location.pathname.replace(/[^/]*$/, '');

  const fail = (r, msg) => {
    if(r && r.error){
      throw new Error((msg || '操作失败') + '：' + r.error.message);
    }
    return r ? r.data : null;
  };

  const profileOf = r => Array.isArray(r?.profiles) ? (r.profiles[0] || {}) : (r?.profiles || {});

  const timeText = v => {
    if(!v) return '刚刚';

    const m = Math.floor(Math.max(0, Date.now() - new Date(v).getTime()) / 60000);

    if(m < 1) return '刚刚';
    if(m < 60) return m + '分钟前';

    const h = Math.floor(m / 60);

    if(h < 24) return h + '小时前';

    const d = Math.floor(h / 24);

    return d < 7 ? d + '天前' : new Date(v).toLocaleDateString('zh-CN');
  };

  async function getCurrentUser(){
    if(!enabled) return null;

    const s = fail(await client.auth.getSession(), '读取登录状态失败')?.session;

    if(!s?.user) return null;

    let p = {};

    try{
      const rows = fail(
        await client.rpc('fw_get_current_profile'),
        '读取用户资料失败'
      ) || [];

      p = Array.isArray(rows) ? (rows[0] || {}) : (rows || {});
    }catch(e){
      // 兼容未执行公开处罚补丁的旧库：退回到最小资料读取。
      p = fail(
        await client
          .from('profiles')
          .select('id,nickname,avatar_url,role,is_banned,created_at,lab_code')
          .eq('id', s.user.id)
          .maybeSingle(),
        '读取用户资料失败'
      ) || {};
    }

    return {
      id:s.user.id,
      email:p.email || s.user.email,
      nickname:p.nickname || s.user.user_metadata?.nickname || '临时研究员',
      avatar_url:p.avatar_url || '',
      role:p.role || 'user',
      isAdmin:p.role === 'admin',
      disabled:!!p.is_banned,
      lab_code:p.lab_code || '',
      muted_until:p.muted_until || null,
      provider:'supabase'
    };
  }

  async function sendEmailOtp({email, nickname}){
    const r = await client.auth.signInWithOtp({
      email:String(email || '').trim(),
      options:{
        shouldCreateUser:true,
        data:{
          nickname:String(nickname || '').trim() || '临时研究员'
        },
        emailRedirectTo:redirect()
      }
    });

    if(r.error){
      throw new Error(r.error.message);
    }

    return {ok:true};
  }

  async function verifyEmailOtp({email, token, nickname, password}){
    const r = await client.auth.verifyOtp({
      email:String(email || '').trim(),
      token:String(token || '').trim().replace(/\s/g, ''),
      type:'email'
    });

    if(r.error){
      throw new Error(r.error.message);
    }

    if(nickname){
      await updateProfile({nickname});
    }

    if(password){
      await updatePassword({password});
    }

    return {
      user:await getCurrentUser()
    };
  }

  async function signInPassword({email, password}){
    const r = await client.auth.signInWithPassword({
      email:String(email || '').trim(),
      password:String(password || '').trim()
    });

    if(r.error){
      throw new Error(r.error.message);
    }

    const u = r.data?.user;

    return {
      user:u ? {
        id:u.id,
        email:u.email,
        nickname:u.user_metadata?.nickname || '临时研究员',
        provider:'supabase'
      } : null
    };
  }

  async function updatePassword({password}){
    const pwd = String(password || '').trim();

    if(pwd.length < 6){
      throw new Error('密码至少 6 位。');
    }

    const r = await client.auth.updateUser({
      password:pwd
    });

    if(r.error){
      throw new Error(r.error.message);
    }

    return {ok:true};
  }

  async function sendPasswordReset({email}){
    const r = await client.auth.resetPasswordForEmail(
      String(email || '').trim(),
      {
        redirectTo:redirect()
      }
    );

    if(r.error){
      throw new Error(r.error.message);
    }

    return {ok:true};
  }

  async function listOwnStorageFiles(bucket, prefix, depth){
    if(depth > 10){
      throw new Error('账号文件目录层级异常，请联系管理员处理。');
    }

    const storage = client.storage.from(bucket);
    const rows = fail(
      await storage.list(prefix, {
        limit:1000,
        offset:0,
        sortBy:{column:'name', order:'asc'}
      }),
      '读取账号文件失败'
    ) || [];
    let files = [];

    for(const row of rows){
      const path = prefix ? `${prefix}/${row.name}` : row.name;
      const isFile = !!(row.id || row.metadata || row.created_at || row.updated_at);

      if(isFile){
        files.push(path);
      }else{
        files = files.concat(await listOwnStorageFiles(bucket, path, depth + 1));
      }
    }

    return files;
  }

  async function removeOwnStorageFiles(userId){
    const buckets = ['avatars', 'stickers', 'chat-media'];
    let removed = 0;

    for(const bucket of buckets){
      let files = [];

      try{
        files = await listOwnStorageFiles(bucket, String(userId), 0);
      }catch(e){
        if(/bucket.*not found|not found.*bucket/i.test(String(e && e.message || e))){
          continue;
        }
        throw e;
      }

      for(let i = 0; i < files.length; i += 100){
        const batch = files.slice(i, i + 100);
        fail(
          await client.storage.from(bucket).remove(batch),
          '删除账号文件失败'
        );
        removed += batch.length;
      }
    }

    return removed;
  }

  async function deleteOwnAccount(){
    if(!enabled){
      throw new Error('数据库连接未就绪。');
    }

    const user = await getCurrentUser();

    if(!user){
      throw new Error('请先登录。');
    }

    if(user.isAdmin){
      throw new Error('管理员账号不能直接注销，请先转移管理员身份。');
    }

    const removedFiles = await removeOwnStorageFiles(user.id);
    fail(
      await client.rpc('fw_delete_own_account'),
      '注销账号失败'
    );

    try{
      await client.auth.signOut({scope:'local'});
    }catch(e){}

    return {ok:true, removedFiles};
  }

  async function signOut(){
    if(enabled){
      await client.auth.signOut();
    }
  }

  async function updateProfile({nickname, avatarFile}){
    const u = await getCurrentUser();

    if(!u){
      throw new Error('请先登录。');
    }

    let avatar_url = '';

    if(avatarFile && avatarFile.size){
      const name = avatarFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${u.id}/${Date.now()}_${name}`;

      fail(
        await client.storage
          .from('avatars')
          .upload(path, avatarFile, {
            upsert:true,
            cacheControl:'3600'
          }),
        '头像上传失败'
      );

      avatar_url = client.storage
        .from('avatars')
        .getPublicUrl(path)
        .data
        .publicUrl;
    }

    const nextNickname = nickname ? String(nickname).trim().slice(0, 24) : null;

    try{
      const rows = fail(
        await client.rpc('fw_update_own_profile', {
          p_nickname:nextNickname,
          p_avatar_url:avatar_url || null
        }),
        '资料保存失败'
      ) || [];

      const profile = Array.isArray(rows) ? rows[0] : rows;

      return profile || {
        id:u.id,
        nickname:nextNickname || u.nickname,
        avatar_url:avatar_url || u.avatar_url || '',
        lab_code:u.lab_code || ''
      };
    }catch(e){
      throw new Error(e.message || '资料保存失败');
    }
  }

  async function loadPosts(){
    let meId = null;

    try{
      meId = (await client.auth.getSession())?.data?.session?.user?.id || null;
    }catch(e){}

    const posts = fail(
      await client
        .from('posts')
        .select('id,user_id,content,status_tag,created_at,profiles(nickname,avatar_url)')
        .or('is_deleted.eq.false,is_deleted.is.null')
        .order('created_at', {ascending:false})
        .limit(100),
      '读取帖子失败'
    ) || [];

    const ids = posts.map(p => p.id);

    if(!ids.length){
      return [];
    }

    const comments = fail(
      await client
        .from('comments')
        .select('id,post_id,user_id,parent_comment_id,content,created_at,profiles!comments_user_id_fkey(nickname,avatar_url)')
        .in('post_id', ids)
        .or('is_deleted.eq.false,is_deleted.is.null')
        .order('created_at', {ascending:true}),
      '读取评论失败'
    ) || [];

    const reactions = fail(
      await client
        .from('reactions')
        .select('post_id,user_id,type')
        .in('post_id', ids),
      '读取互动失败'
    ) || [];

    const cb = {};
    const counts = {};
    const mine = {};

    comments.forEach(c => {
      const p = profileOf(c);

      (cb[c.post_id] = cb[c.post_id] || []).push({
        id:c.id,
        userId:c.user_id,
        parentCommentId:c.parent_comment_id || null,
        authorName:p.nickname || '匿名回声',
        authorAvatar:p.avatar_url || '',
        content:c.content,
        time:timeText(c.created_at),
        canDelete:!!meId && c.user_id === meId
      });
    });

    reactions.forEach(r => {
      const type = r.type === 'like' ? 'resonance' : r.type;
      counts[r.post_id] = counts[r.post_id] || {
        resonance:0,
        same:0,
        tissue:0
      };
      mine[r.post_id] = mine[r.post_id] || {
        resonance:false,
        same:false,
        tissue:false
      };

      if(type === 'resonance') counts[r.post_id].resonance++;
      if(type === 'same') counts[r.post_id].same++;
      if(type === 'tissue') counts[r.post_id].tissue++;
      if(meId && r.user_id === meId && (type === 'resonance' || type === 'same' || type === 'tissue')) mine[r.post_id][type] = true;
    });

    return posts.map(p => {
      const prof = profileOf(p);
      const c = counts[p.id] || {
        resonance:0,
        same:0,
        tissue:0
      };

      return {
        id:p.id,
        userId:p.user_id,
        authorId:p.user_id,
        authorName:prof.nickname || '匿名研究员',
        authorAvatar:prof.avatar_url || '',
        status:p.status_tag || '今日无效',
        content:p.content,
        time:timeText(p.created_at),
        createdAt:p.created_at,
        resonance:c.resonance,
        same:c.same,
        tissue:c.tissue,
        comments:cb[p.id] || [],
        canDelete:!!meId && p.user_id === meId,
        myReactions:mine[p.id] || {resonance:false, same:false, tissue:false}
      };
    });
  }

  async function createPost({content, status}){
    const u = await getCurrentUser();

    if(!u){
      throw new Error('请先登录。');
    }

    if(u.disabled){
      throw new Error('这个账号已被停用。');
    }

    if(u.muted_until && new Date(u.muted_until).getTime() > Date.now()){
      throw new Error('这个账号正在禁言中。');
    }

    return fail(
      await client
        .from('posts')
        .insert({
          user_id:u.id,
          content:String(content || '').trim(),
          status_tag:status || '今日无效',
          is_deleted:false
        })
        .select('id')
        .single(),
      '发布失败'
    );
  }

  async function createComment({postId, content, parentCommentId}){
    const u = await getCurrentUser();

    if(!u){
      throw new Error('请先登录。');
    }

    if(u.disabled){
      throw new Error('这个账号已被停用。');
    }

    if(u.muted_until && new Date(u.muted_until).getTime() > Date.now()){
      throw new Error('这个账号正在禁言中。');
    }

    return fail(
      await client
        .from('comments')
        .insert({
          post_id:postId,
          user_id:u.id,
          parent_comment_id:parentCommentId || null,
          content:String(content || '').trim(),
          is_deleted:false
        })
        .select('id')
        .single(),
      '评论失败'
    );
  }

  async function deleteOwnPost({postId}){
    return fail(
      await client.rpc('fw_delete_own_post', {
        p_post_id:postId
      }),
      '删除帖子失败'
    );
  }

  async function deleteOwnComment({commentId}){
    return fail(
      await client.rpc('fw_delete_own_comment', {
        p_comment_id:commentId
      }),
      '删除评论失败'
    );
  }

  async function react({postId, type}){
    const u = await getCurrentUser();

    if(!u){
      throw new Error('请先登录。');
    }

    if(u.disabled){
      throw new Error('这个账号已被停用。');
    }

    const map = {
      resonance:'like',
      same:'same',
      tissue:'tissue',
      like:'like'
    };

    const r = await client
      .from('reactions')
      .insert({
        post_id:postId,
        user_id:u.id,
        type:map[type] || type
      });

    if(r.error){
      if(r.error.code === '23505' || String(r.error.message).includes('duplicate')){
        return {already:true};
      }

      throw new Error('互动失败：' + r.error.message);
    }

    return {ok:true};
  }

  async function listUsers(){
    try{
      return fail(
        await client.rpc('admin_list_profiles'),
        '读取用户列表失败'
      ) || [];
    }catch(e){
      return fail(
        await client
          .from('profiles')
          .select('id,nickname,avatar_url,role,is_banned,created_at')
          .order('created_at', {ascending:false})
          .limit(200),
        '读取用户列表失败'
      ) || [];
    }
  }

  async function deletePost(postId){
    return fail(
      await client
        .from('posts')
        .update({is_deleted:true})
        .eq('id', postId),
      '删除帖子失败'
    );
  }

  async function deleteComment(commentId){
    return fail(
      await client
        .from('comments')
        .update({is_deleted:true})
        .eq('id', commentId),
      '删除评论失败'
    );
  }

  async function setUserBanned(userId, banned){
    return fail(
      await client.rpc('admin_set_user_banned', {
        target_user_id:userId,
        banned
      }),
      '账号状态修改失败'
    );
  }

  function onAuthChange(cb){
    return enabled
      ? client.auth.onAuthStateChange((e, s) => {
          // Supabase Auth 回调必须先返回；回调内再次读取 Session 会造成认证死锁。
          setTimeout(() => {
            if(cb) cb(e, s);
          }, 0);
        })
      : null;
  }

  window.fwDb = {
    enabled,
    client,
    getCurrentUser,
    sendEmailOtp,
    verifyEmailOtp,
    signInPassword,
    updatePassword,
    sendPasswordReset,
    deleteOwnAccount,
    signOut,
    updateProfile,
    loadPosts,
    createPost,
    createComment,
    deleteOwnPost,
    deleteOwnComment,
    react,
    listUsers,
    deletePost,
    deleteComment,
    setUserBanned,
    onAuthChange
  };
})();
