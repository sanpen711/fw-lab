import { expect, test, type Page } from '@playwright/test';

const testPrefix = '[FW-AUTO-TEST]';

async function waitForDbReady(page: Page) {
  await page.waitForFunction(
    () => Boolean((window as any).fwDb?.enabled && (window as any).fwDb?.client),
    null,
    { timeout: 15_000 }
  );
}

async function openDesktop(page: Page) {
  await page.addInitScript(() => {
    window.sessionStorage.setItem('fw_home_intro_seen_v1', '1');
  });
  await page.goto('/index.html?desktop=1', { waitUntil: 'domcontentloaded' });
  await waitForDbReady(page);
}

async function loginTestAccount(page: Page) {
  const email = process.env.FW_TEST_EMAIL;
  const password = process.env.FW_TEST_PASSWORD;
  test.skip(!email || !password, '未配置测试登录 Secret，跳过登录后闭环与权限测试。');

  await openDesktop(page);
  await page.locator('[data-login-cta]').click();
  await expect(page.locator('[data-sb-auth] [data-view="login"]')).toBeVisible();
  await page.locator('[data-login] input[name="email"]').fill(email!);
  await page.locator('[data-login] input[name="password"]').fill(password!);
  await page.locator('[data-login] button[type="submit"]').click();

  // 先确认旧页面已经写入 Session，再等待兼容脚本可能触发的页面刷新。
  // 之前在 Session 写入前开始计时，会把网络耗时误算进刷新等待。
  await page.waitForFunction(async () => {
    try {
      const session = await (window as any).fwDb?.client?.auth?.getSession?.();
      return Boolean(session?.data?.session?.user?.id);
    } catch {
      return false;
    }
  }, null, { timeout: 22_000 });
  await page.waitForTimeout(1_500);
  await waitForDbReady(page);

  await page.waitForFunction(async () => {
    try {
      const db = (window as any).fwDb;
      if (!db?.client || typeof db.getCurrentUser !== 'function') return false;
      const session = await db.client.auth.getSession();
      if (!session.data?.session?.user?.id) return false;
      const user = await db.getCurrentUser();
      return Boolean(user?.id && user.id === session.data.session.user.id);
    } catch {
      return false;
    }
  }, null, { timeout: 22_000 });
  await page.waitForTimeout(500);
}

test.describe.serial('账号功能闭环与数据库权限', () => {
  test('游客不能绕过界面写入，且不能读取敏感账号字段', async ({ page }) => {
    await openDesktop(page);

    const result = await page.evaluate(async prefix => {
      const db = (window as any).fwDb;
      await db.client.auth.signOut({ scope: 'local' });
      const marker = `${prefix} guest-${Date.now()}`;
      const zeroUser = '00000000-0000-0000-0000-000000000000';
      const postLookup = await db.client
        .from('posts')
        .select('id')
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const postId = postLookup.data?.id || 1;

      const post = await db.client.from('posts').insert({
        user_id: zeroUser,
        content: marker,
        status_tag: '今日无效',
        is_deleted: false
      });
      const comment = await db.client.from('comments').insert({
        post_id: postId,
        user_id: zeroUser,
        content: marker,
        is_deleted: false
      });
      const reaction = await db.client.from('reactions').insert({
        post_id: postId,
        user_id: zeroUser,
        type: 'like'
      });
      const sensitiveProfiles = await db.client
        .from('profiles')
        .select('id,email_search,role,is_banned')
        .limit(1);
      const deleteAccount = await db.client.rpc('fw_delete_own_account');

      return {
        postError: post.error?.message || '',
        commentError: comment.error?.message || '',
        reactionError: reaction.error?.message || '',
        sensitiveError: sensitiveProfiles.error?.message || '',
        sensitiveRows: sensitiveProfiles.data || [],
        deleteAccountError: deleteAccount.error?.message || ''
      };
    }, testPrefix);

    expect(result.postError).not.toBe('');
    expect(result.commentError).not.toBe('');
    expect(result.reactionError).not.toBe('');
    expect(result.sensitiveRows).toEqual([]);
    expect(result.sensitiveError).not.toBe('');
    expect(result.deleteAccountError).not.toBe('');
  });

  test('测试账号完成发帖、评论、回复、三种互动、跨端显示与安全清理', async ({ page }) => {
    await loginTestAccount(page);
    const marker = `${testPrefix} flow-${Date.now()}`;
    const xssPost = `${marker} <img src="x-security-test" onerror="window.__fwSecurityXss=1">`;
    const xssComment = `${marker}-comment <svg onload="window.__fwSecurityXss=2"></svg>`;

    const ids: { postId?: string; commentId?: string; replyId?: string } = {};

    try {
      const created = await page.evaluate(async ({ postContent, commentContent, markerText }) => {
        const db = (window as any).fwDb;
        const user = await db.getCurrentUser();
        if (!user?.id) throw new Error('测试账号未登录');
        if (user.isAdmin || user.role === 'admin') throw new Error('安全测试账号必须是普通用户，不能使用管理员账号');

        const post = await db.createPost({ content: postContent, status: '今日无效' });
        const comment = await db.createComment({
          postId: post.id,
          content: commentContent
        });
        const reply = await db.createComment({
          postId: post.id,
          parentCommentId: comment.id,
          content: `${markerText}-reply`
        });

        const reactions: Record<string, unknown> = {};
        for (const type of ['resonance', 'same', 'tissue']) {
          reactions[type] = await db.react({ postId: post.id, type });
        }
        const duplicate = await db.react({ postId: post.id, type: 'resonance' });

        const rows = await Promise.all([
          db.client.from('posts').select('id,user_id,content,is_deleted').eq('id', post.id).single(),
          db.client.from('comments').select('id,post_id,parent_comment_id,content,is_deleted').in('id', [comment.id, reply.id]).order('id'),
          db.client.from('reactions').select('type').eq('post_id', post.id).eq('user_id', user.id).order('type')
        ]);

        return {
          userId: user.id,
          postId: String(post.id),
          commentId: String(comment.id),
          replyId: String(reply.id),
          post: rows[0],
          comments: rows[1],
          reactions: rows[2],
          duplicate,
          reactionResults: reactions
        };
      }, { postContent: xssPost, commentContent: xssComment, markerText: marker });

      ids.postId = created.postId;
      ids.commentId = created.commentId;
      ids.replyId = created.replyId;

      expect(created.post.error).toBeNull();
      expect(created.post.data?.content).toBe(xssPost);
      expect(created.comments.error).toBeNull();
      expect(created.comments.data).toHaveLength(2);
      expect(created.comments.data?.find((row: any) => String(row.id) === created.replyId)?.parent_comment_id)
        .toBe(Number(created.commentId));
      expect(created.reactions.error).toBeNull();
      expect(created.reactions.data?.map((row: any) => row.type).sort()).toEqual(['like', 'same', 'tissue']);
      expect(created.duplicate).toMatchObject({ already: true });

      await page.goto('/square.html?desktop=1', { waitUntil: 'domcontentloaded' });
      const desktopCard = page.locator('.post-card').filter({ hasText: marker }).first();
      await expect(desktopCard).toBeVisible({ timeout: 20_000 });
      await expect(desktopCard).toContainText('<img src="x-security-test"');
      expect(await page.evaluate(() => (window as any).__fwSecurityXss || 0)).toBe(0);
      await expect(page.locator('img[src="x-security-test"]')).toHaveCount(0);

      await page.goto('/app/index.html', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[data-app-view="nav"].is-active', { timeout: 15_000 });
      await page.locator('[data-app-open="square"]').first().click();
      await expect(page.locator('[data-app-view="square"].is-active')).toBeVisible();
      await expect(page.locator('[data-app-view="square"]').getByText(marker, { exact: false }).first())
        .toBeVisible({ timeout: 20_000 });
      expect(await page.evaluate(() => (window as any).__fwSecurityXss || 0)).toBe(0);
    } finally {
      if (ids.postId) {
        await page.evaluate(async ({ postId, commentId, replyId }) => {
          const db = (window as any).fwDb;
          if (!db?.client) return;
          const session = await db.client.auth.getSession();
          if (!session.data?.session?.user) return;

          await db.client.from('reactions').delete().eq('post_id', postId);
          if (replyId) await db.deleteOwnComment({ commentId: replyId });
          if (commentId) await db.deleteOwnComment({ commentId });
          await db.deleteOwnPost({ postId });
        }, ids);
      }
    }

    const hidden = await page.evaluate(async ({ postId, commentId, replyId }) => {
      const db = (window as any).fwDb;
      const [post, comments, reactions] = await Promise.all([
        db.client.from('posts').select('id').eq('id', postId),
        db.client.from('comments').select('id').in('id', [commentId, replyId]),
        db.client.from('reactions').select('id').eq('post_id', postId)
      ]);
      return {
        posts: post.data || [],
        comments: comments.data || [],
        reactions: reactions.data || []
      };
    }, ids);
    expect(hidden.posts).toEqual([]);
    expect(hidden.comments).toEqual([]);
    expect(hidden.reactions).toEqual([]);
  });

  test('普通账号不能调用管理员能力、直接改帖或举报自己', async ({ page }) => {
    await loginTestAccount(page);
    const marker = `${testPrefix} permission-${Date.now()}`;
    let postId = '';

    try {
      const result = await page.evaluate(async markerText => {
        const db = (window as any).fwDb;
        const user = await db.getCurrentUser();
        if (!user?.id) throw new Error('测试账号未登录');
        if (user.isAdmin || user.role === 'admin') throw new Error('安全测试账号必须是普通用户');

        const post = await db.createPost({ content: markerText, status: '今日无效' });
        const directUpdate = await db.client
          .from('posts')
          .update({ content: `${markerText}-tampered` })
          .eq('id', post.id)
          .select('id');
        const adminProfiles = await db.client.rpc('admin_list_profiles');
        const adminModerate = await db.client.rpc('admin_moderate_post', {
          p_post_id: post.id,
          p_delete: true,
          p_reason: markerText,
          p_public_visible: false
        });
        const selfReport = await db.client.rpc('fw_submit_report', {
          p_target_type: 'post',
          p_target_id: String(post.id),
          p_reason: markerText
        });
        const reportRows = await db.client.from('site_reports').select('id,reporter_id').limit(1);
        const sensitiveProfiles = await db.client
          .from('profiles')
          .select('id,email_search,role,is_banned')
          .limit(1);
        const postAfter = await db.client.from('posts').select('content,is_deleted').eq('id', post.id).single();

        return {
          postId: String(post.id),
          original: markerText,
          directUpdateError: directUpdate.error?.message || '',
          adminProfilesError: adminProfiles.error?.message || '',
          adminProfilesRows: adminProfiles.data || [],
          adminModerateError: adminModerate.error?.message || '',
          selfReportError: selfReport.error?.message || '',
          reportRows: reportRows.data || [],
          reportRowsError: reportRows.error?.message || '',
          sensitiveRows: sensitiveProfiles.data || [],
          sensitiveError: sensitiveProfiles.error?.message || '',
          postAfter: postAfter.data,
          postAfterError: postAfter.error?.message || ''
        };
      }, marker);

      postId = result.postId;
      expect(result.directUpdateError).not.toBe('');
      expect(result.adminProfilesRows).toEqual([]);
      expect(result.adminModerateError || result.adminProfilesError).not.toBe('');
      expect(result.selfReportError).not.toBe('');
      expect(result.reportRows).toEqual([]);
      expect(result.reportRowsError).not.toBe('');
      expect(result.sensitiveRows).toEqual([]);
      expect(result.sensitiveError).not.toBe('');
      expect(result.postAfterError).toBe('');
      expect(result.postAfter).toMatchObject({ content: marker, is_deleted: false });
    } finally {
      if (postId) {
        await page.evaluate(async id => {
          const db = (window as any).fwDb;
          await db.deleteOwnPost({ postId: id });
        }, postId);
      }
    }
  });

  test('媒体存储只允许本人目录的图片，并自动删除测试文件', async ({ page }) => {
    await loginTestAccount(page);

    const result = await page.evaluate(async prefix => {
      const db = (window as any).fwDb;
      const user = await db.getCurrentUser();
      const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const ownPng = `${user.id}/tests/${stamp}.png`;
      const ownHtml = `${user.id}/tests/${stamp}.html`;
      const spoofedPng = `${user.id}/tests/${stamp}-spoof.png`;
      const foreignPng = `00000000-0000-0000-0000-000000000000/tests/${stamp}.png`;
      const pngBytes = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='), c => c.charCodeAt(0));
      const pathsToRemove: string[] = [];

      const upload = async (path: string, body: Blob) => {
        const response = await db.client.storage.from('chat-media').upload(path, body, {
          upsert: false,
          contentType: body.type
        });
        if (!response.error) pathsToRemove.push(path);
        return response.error?.message || '';
      };

      let ownPngError = '';
      let htmlError = '';
      let spoofError = '';
      let foreignError = '';
      let cleanupError = '';
      try {
        ownPngError = await upload(ownPng, new Blob([pngBytes], { type: 'image/png' }));
        htmlError = await upload(ownHtml, new Blob([`${prefix}<script>window.__fwUploadXss=1</script>`], { type: 'text/html' }));
        spoofError = await upload(spoofedPng, new Blob([`${prefix}<script>window.__fwUploadXss=1</script>`], { type: 'text/html' }));
        foreignError = await upload(foreignPng, new Blob([pngBytes], { type: 'image/png' }));
      } finally {
        if (pathsToRemove.length) {
          const removed = await db.client.storage.from('chat-media').remove(pathsToRemove);
          cleanupError = removed.error?.message || '';
        }
      }

      return { ownPngError, htmlError, spoofError, foreignError, cleanupError };
    }, testPrefix);

    expect(result.ownPngError).toBe('');
    expect(result.htmlError).not.toBe('');
    expect(result.spoofError).not.toBe('');
    expect(result.foreignError).not.toBe('');
    expect(result.cleanupError).toBe('');
  });

  test('退出后不能继续发布或互动', async ({ page }) => {
    await loginTestAccount(page);
    const marker = `${testPrefix} logout-${Date.now()}`;

    const result = await page.evaluate(async markerText => {
      const db = (window as any).fwDb;
      await db.client.auth.signOut({ scope: 'local' });
      let createError = '';
      let currentUser = null;
      try {
        await db.createPost({ content: markerText, status: '今日无效' });
      } catch (error) {
        createError = error instanceof Error ? error.message : String(error);
      }
      try {
        currentUser = await db.getCurrentUser();
      } catch {
        currentUser = null;
      }
      return { createError, currentUser };
    }, marker);

    expect(result.currentUser).toBeNull();
    expect(result.createError).toContain('请先登录');
  });
});
