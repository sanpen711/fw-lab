// Keep badge artwork independent of the member's chosen profile-card theme.
export function levelBadge(value, size='inline'){
  const level=Number(value);
  if(!Number.isInteger(level)||level<1||level>9)return '';
  const variant=['inline','card','large'].includes(size)?size:'inline';
  return `<span class="vip-badge member-level-badge vip-level-${level} member-badge-${variant}" role="img" aria-label="V${level}" title="会员等级 V${level}"><img src="/membership-badges/v${level}.png" alt="" aria-hidden="true" width="160" height="128" draggable="false"></span>`;
}
