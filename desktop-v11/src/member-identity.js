import {membershipStore} from './membership-store.js';
export function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
export function identityClass(userId){const a=membershipStore.appearanceFor(userId);return a?` vip-identity vip-theme-${a.theme} vip-frame-${a.frame}`:'';}
export function memberName(name,userId){const a=membershipStore.appearanceFor(userId);return `<span${a?` class="member-name member-color-${a.nickname_color}"`:''}>${escapeHtml(name)}</span>`;}
export function memberBadge(userId){const a=membershipStore.appearanceFor(userId);const level=membershipStore.levelFor(userId);return a?`${level?`<span class="vip-badge member-level-badge vip-level-${level}" aria-label="V${level}">V${level}</span>`:''}${a.title?`<span class="member-title">${escapeHtml(a.title)}</span>`:''}`:'';}
