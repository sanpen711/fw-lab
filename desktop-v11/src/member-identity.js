import {profileAppearanceStore} from './profile-appearance-store.js';
import {levelBadge} from './membership-badge.js';
export function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
export function identityClass(userId){const a=profileAppearanceStore.appearanceFor(userId);return a?` vip-identity vip-theme-${a.theme} vip-frame-${a.frame}`:'';}
export function memberName(name,userId,withBadge=false){const a=profileAppearanceStore.appearanceFor(userId);return `<span${a?` class="member-name member-color-${a.nickname_color}"`:''}>${escapeHtml(name)}${withBadge?` ${memberBadge(userId)}`:''}</span>`;}
export function memberBadge(userId){const a=profileAppearanceStore.appearanceFor(userId);const level=profileAppearanceStore.levelFor(userId);return a?`${levelBadge(level)}${a.title?`<span class="member-title">${escapeHtml(a.title)}</span>`:''}`:'';}
