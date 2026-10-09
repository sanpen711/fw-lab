import {membershipStore} from './membership-store.js';
export function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
export function identityClass(userId){const a=membershipStore.appearanceFor(userId);return a?` vip-identity vip-theme-${a.theme} vip-frame-${a.frame}`:'';}
export function memberName(name,userId){const a=membershipStore.appearanceFor(userId);return `<span${a?` class="member-name member-color-${a.nickname_color}"`:''}>${escapeHtml(name)}</span>`;}
export function memberBadge(userId){const a=membershipStore.appearanceFor(userId);return a?`<span class="vip-badge vip-theme-${a.theme}" aria-label="研究所会员">VIP</span>${a.title?`<span class="member-title">${escapeHtml(a.title)}</span>`:''}`:'';}
