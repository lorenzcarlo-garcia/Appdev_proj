// Single source of truth for dashboard/report-list period and filter parsing.
// All periods are HALF-OPEN in Philippine local time: start <= submitted_at < end.
// A user's inclusive end date D becomes end = D + 1 day at 00:00 (no 23:59:59 times).
const {manilaNow}=require('./manilaTime');
class FilterError extends Error{constructor(message){super(message);this.status=400;}}
const fail=message=>{throw new FilterError(message);};
const presets=['this_week','this_month','this_year','last_12_months','custom'];
const granularities=['day','week','month','year'];
const MAX_BUCKETS=400, MAX_DAYS=5*366;
const DAY=24*60*60*1000;

// Calendar arithmetic on 'YYYY-MM-DD' strings using UTC dates (no browser/laptop zone).
const toDate=text=>new Date(text+'T00:00:00Z');
const toText=date=>date.toISOString().slice(0,10);
const addDays=(text,days)=>toText(new Date(toDate(text).getTime()+days*DAY));
const addMonths=(text,months)=>{const d=toDate(text);return toText(new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+months,1)));};
const weekday=text=>(toDate(text).getUTCDay()+6)%7; // Monday = 0 ... Sunday = 6
function validDate(text){
  if(typeof text!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const d=toDate(text);return Number.isFinite(d.getTime()) && toText(d)===text && text>='2000-01-01';
}
function bucketStart(text,granularity){
  if(granularity==='week') return addDays(text,-weekday(text));
  if(granularity==='month') return text.slice(0,8)+'01';
  if(granularity==='year') return text.slice(0,5)+'01-01';
  return text;
}
function nextBucket(text,granularity){
  if(granularity==='week') return addDays(text,7);
  if(granularity==='month') return addMonths(text,1);
  if(granularity==='year') return addMonths(text,12);
  return addDays(text,1);
}
// Every bucket key in [start, end), including genuine zero buckets.
function buckets(start,end,granularity){
  const keys=[];
  for(let key=bucketStart(start,granularity);key<end;key=nextBucket(key,granularity)){
    keys.push(key);
    if(keys.length>MAX_BUCKETS) fail('This period has too many groups. Choose a larger grouping, such as month or year.');
  }
  return keys;
}
// Inclusive user dates -> half-open range. Returns null when neither date is supplied.
function dateRange(from,to){
  if(from===undefined && to===undefined) return null;
  if(!validDate(from) || !validDate(to)) fail('Choose valid start and end dates (YYYY-MM-DD).');
  if(from>to) fail('The start date must be on or before the end date.');
  const end=addDays(to,1);
  if((toDate(end)-toDate(from))/DAY>MAX_DAYS) fail('Choose a period of five years or less.');
  return {start:from,end};
}
function presetRange(preset,today){
  if(preset==='this_week'){const start=addDays(today,-weekday(today));return {start,end:addDays(start,7)};}
  if(preset==='this_month'){const start=today.slice(0,8)+'01';return {start,end:addMonths(start,1)};}
  if(preset==='this_year'){const start=today.slice(0,5)+'01-01';return {start,end:addMonths(start,12)};}
  const next=addMonths(today.slice(0,8)+'01',1); // last_12_months, including this month
  return {start:addMonths(next,-12),end:next};
}
function defaultGranularity(preset,start,end){
  if(preset==='this_week') return 'day';
  if(preset==='this_month') return 'week';
  if(preset!=='custom') return 'month';
  const days=(toDate(end)-toDate(start))/DAY;
  return days<=31?'day':days<=26*7?'week':days<=3*366?'month':'year';
}
const idFilter=(value,name)=>{
  if(value===undefined || value==='') return undefined;
  if(typeof value!=='string' || !/^[1-9]\d*$/.test(value) || Number(value)>4294967295) fail(`Choose a valid ${name}.`);
  return Number(value);
};
function areaFilter(value){
  if(value==='unassigned') return 'unassigned';
  return idFilter(value,'area');
}
// Dashboard query: period preset or custom dates, grouping, category and area.
function parseDashboardQuery(query={},now=Date.now()){
  const allowed=['period','from','to','granularity','category_id','area_id'];
  if(Object.keys(query).some(key=>!allowed.includes(key))) fail('Unexpected dashboard filter.');
  for(const key of allowed) if(query[key]!==undefined && typeof query[key]!=='string') fail('Invalid dashboard filter.');
  const preset=query.period===undefined || query.period===''?'last_12_months':query.period;
  if(!presets.includes(preset)) fail('Choose a valid period.');
  let range;
  if(preset==='custom'){range=dateRange(query.from,query.to);if(!range) fail('Choose start and end dates for a custom period.');}
  else {if(query.from!==undefined || query.to!==undefined) fail('Dates can only be set for a custom period.');range=presetRange(preset,manilaNow(0,now).slice(0,10));}
  const granularity=query.granularity===undefined || query.granularity===''?defaultGranularity(preset,range.start,range.end):query.granularity;
  if(!granularities.includes(granularity)) fail('Choose day, week, month or year grouping.');
  return {preset,...range,last:addDays(range.end,-1),granularity,keys:buckets(range.start,range.end,granularity),category_id:idFilter(query.category_id,'category'),area_id:areaFilter(query.area_id)};
}
// SQL for the moment a report was first submitted. Never falls back to draft creation.
const submittedAtSql=alias=>`(SELECT MIN(h.created_at) FROM report_status_history h WHERE h.report_id = ${alias}.id AND h.old_status IS NULL AND h.new_status = 'Submitted')`;
const sqlStart=day=>day+' 00:00:00';
module.exports={parseDashboardQuery,dateRange,areaFilter,idFilter,buckets,bucketStart,submittedAtSql,sqlStart,FilterError,presets,granularities};
