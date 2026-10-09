export const LEVEL_DAYS=[0,30,90,180,365,540,730,1095,1460];
export const LEVEL_REWARDS=['会员徽章','等级徽章','月桂头像框','典藏资料卡','伏伏头像框','星轨头像框','绶带头像框','荣誉资料卡','冠冕头像框'];
export const MEMBER_FRAMES=[['double','双线圆环',1],['corners','四角印记',1],['ticket','票根边框',1],['laurel','月桂',3],['fufu','伏伏',5],['orbit','星轨',6],['ribbon','绶带',7],['crown','冠冕',9]];
export const MEMBER_LAYOUTS=[['classic','经典名片',1],['pass','研究通行证',1],['folio','典藏',4],['honor','荣誉',8]];

// Match the server's Shanghai calendar-month renewal, including month-end clamp.
export function projectedExpiry(membership,months,now=new Date()){
  const expiry=new Date(membership?.expires_at||0);
  const base=membership?.status==='active'&&new Date(membership.starts_at)<=now&&expiry>now?expiry:now;
  const shanghai=new Date(base.getTime()+8*3600000);
  const day=shanghai.getUTCDate();shanghai.setUTCDate(1);
  shanghai.setUTCMonth(shanghai.getUTCMonth()+Number(months));
  const last=new Date(Date.UTC(shanghai.getUTCFullYear(),shanghai.getUTCMonth()+1,0)).getUTCDate();
  shanghai.setUTCDate(Math.min(day,last));
  return new Date(shanghai.getTime()-8*3600000).toISOString();
}
export function alipayPaymentUrl(value){
  const url=new URL(value);
  if(url.protocol!=='https:'||url.hostname!=='openapi.alipay.com'||url.port||url.username||url.password||url.pathname!=='/gateway.do'||url.hash||url.searchParams.getAll('method').length!==1||url.searchParams.getAll('app_id').length!==1||url.searchParams.get('method')!=='alipay.trade.page.pay'||url.searchParams.get('app_id')!=='2021007104686921')throw new Error('付款地址校验失败，请重新查询订单。');
  return url.href;
}
