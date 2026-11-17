const {createHash,timingSafeEqual}=require('node:crypto');
function credentialTag(hash){
  return typeof hash==='string' && hash.length ? createHash('sha256').update('bantaylog-session-password\0').update(hash).digest('hex') : null;
}
function matchesCredential(tag,hash){
  const expected=credentialTag(hash);
  return typeof tag==='string' && /^[a-f0-9]{64}$/.test(tag) && expected!==null && timingSafeEqual(Buffer.from(tag),Buffer.from(expected));
}
module.exports={credentialTag,matchesCredential};
