// Aggregates for the administrative dashboard. Responses contain only counts and labels:
// no titles, descriptions, location text, names, user IDs or reporter details.
const {parseDashboardQuery,sqlStart,FilterError}=require('./dashboardFilters');
const {manilaNow}=require('./manilaTime');
const bucketSql={
  day:"DATE_FORMAT(s.submitted_at, '%Y-%m-%d')",
  week:"DATE_FORMAT(DATE_SUB(DATE(s.submitted_at), INTERVAL WEEKDAY(s.submitted_at) DAY), '%Y-%m-%d')",
  month:"DATE_FORMAT(s.submitted_at, '%Y-%m-01')",
  year:"DATE_FORMAT(s.submitted_at, '%Y-01-01')"
};
// First submission event per report (migration 005 uses the same definition).
const submissions="SELECT report_id, MIN(created_at) AS submitted_at FROM report_status_history WHERE old_status IS NULL AND new_status = 'Submitted' GROUP BY report_id";
function dashboardService(db){
  async function exists(table,id,label){
    const [rows]=await db.execute(`SELECT id FROM ${table} WHERE id = ?`,[id]);
    if(!rows.length) throw new FilterError(`Choose an existing ${label}.`);
  }
  return {
    async summary(query,now=Date.now()){
      const f=parseDashboardQuery(query,now);
      // Buckets that start after today have not happened yet; drawing them as 0 would mislead.
      const today=manilaNow(0,now).slice(0,10);
      if(f.category_id!==undefined) await exists('incident_categories',f.category_id,'category');
      if(typeof f.area_id==='number') await exists('report_areas',f.area_id,'area');
      // Eligible = submitted and not cancelled. Filters apply before any aggregation.
      const clauses=["r.submission_stage = 'Submitted'",'r.cancelled_at IS NULL'],params=[];
      if(f.category_id!==undefined){clauses.push('r.category_id = ?');params.push(f.category_id);}
      if(f.area_id==='unassigned') clauses.push('r.area_id IS NULL');
      else if(f.area_id!==undefined){clauses.push('r.area_id = ?');params.push(f.area_id);}
      const eligible=clauses.join(' AND ');
      const from=`FROM incident_reports r JOIN (${submissions}) s ON s.report_id = r.id`;
      const where=`WHERE ${eligible} AND s.submitted_at >= ? AND s.submitted_at < ?`;
      const args=[...params,sqlStart(f.start),sqlStart(f.end)];
      const [[cohort]]=await db.execute(`SELECT COUNT(*) AS received, COALESCE(SUM(r.status = 'Submitted'),0) AS awaiting, COALESCE(SUM(r.status IN ('Under Investigation','Scheduled for Action')),0) AS ongoing, COALESCE(SUM(r.status = 'Resolved'),0) AS resolved ${from} ${where}`,args);
      const [series]=await db.execute(`SELECT ${bucketSql[f.granularity]} AS bucket, COUNT(*) AS total ${from} ${where} GROUP BY bucket`,args);
      const [categories]=await db.execute(`SELECT r.category_id AS id, c.name, c.is_active, COUNT(*) AS total ${from} LEFT JOIN incident_categories c ON c.id = r.category_id ${where} GROUP BY r.category_id, c.name, c.is_active ORDER BY total DESC, c.name`,args);
      const [areas]=await db.execute(`SELECT r.area_id AS id, a.name, a.is_active, COUNT(*) AS total ${from} LEFT JOIN report_areas a ON a.id = r.area_id ${where} GROUP BY r.area_id, a.name, a.is_active ORDER BY total DESC, a.name`,args);
      // Submitted reports without a submission record cannot be placed in a period.
      const [[anomaly]]=await db.execute(`SELECT COUNT(*) AS total FROM incident_reports r WHERE ${eligible} AND NOT EXISTS (SELECT 1 FROM report_status_history h WHERE h.report_id = r.id AND h.old_status IS NULL AND h.new_status = 'Submitted')`,params);
      const counts=new Map(series.map(row=>[row.bucket,Number(row.total)]));
      const number=row=>({...row,total:Number(row.total)});
      return {
        filters:{period:f.preset,from:f.start,to:f.last,granularity:f.granularity,category_id:f.category_id??null,area_id:f.area_id??null},
        cohort:{received:Number(cohort.received),awaiting:Number(cohort.awaiting),ongoing:Number(cohort.ongoing),resolved:Number(cohort.resolved)},
        series:f.keys.filter(bucket=>bucket<=today).map(bucket=>({bucket,total:counts.get(bucket)||0})),
        categories:categories.map(number),
        areas:areas.map(row=>({...number(row),id:row.id??null,name:row.id==null?'Unassigned':row.name})),
        anomalies:{missing_submission_record:Number(anomaly.total)}
      };
    }
  };
}
module.exports={dashboardService};
