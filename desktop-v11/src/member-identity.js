import {membershipStore} from './membership-store.js';
import {levelBadge} from './membership-badge.js';
export function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
export function identityClass(userId){const a=membershipStore.appearanceFor(userId);return a?` vip-identity vip-theme-${a.theme} vip-frame-${a.frame}`:'';}
export function memberName(name,userId,withBadge=false){const a=membershipStore.appearanceFor(userId);return `<span${a?` class="member-name member-color-${a.nickname_color}"`:''}>${escapeHtml(name)}${withBadge?` ${memberBadge(userId)}`:''}</span>`;}
export function memberBadge(userId){const a=membershipStore.appearanceFor(userId);const level=membershipStore.levelFor(userId);return a?`${levelBadge(level)}${a.title?`<span class="member-title">${escapeHtml(a.title)}</span>`:''}`:'';}
