// Bucket keys are Philippine calendar dates (YYYY-MM-DD). Format them in UTC so the
// browser's own time zone can never move a bucket to another day.
const format=options=>new Intl.DateTimeFormat('en-PH',{timeZone:'UTC',...options});
const day=format({day:'numeric',month:'short'}),month=format({month:'short',year:'numeric'});
const parse=key=>new Date(key+'T00:00:00Z');
export function bucketLabel(key,granularity){
  if(granularity==='year') return key.slice(0,4);
  if(granularity==='month') return month.format(parse(key));
  if(granularity==='week') return 'Week of '+day.format(parse(key));
  return day.format(parse(key));
}
export function shortBucketLabel(key,granularity){
  if(granularity==='year') return key.slice(0,4);
  if(granularity==='month') return format({month:'short'}).format(parse(key));
  return day.format(parse(key));
}
export const plural=(count,word)=>`${count} ${word}${count===1?'':'s'}`;
