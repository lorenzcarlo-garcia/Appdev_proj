// Builds the two BantayLog PDFs:
//  - blotter record: one official blotter, with names (Secretary/Captain/Super Admin only)
//  - period summary: weekly, monthly or yearly totals, with NO resident or party names
const {createDocument,toBuffer,header,sectionTitle,fields,ensureSpace,signatures,footer,formatDate,formatDateTime,COLORS,MARGIN,width}=require('./layout');
const {fields:blotterFields}=require('../blotterService');
const {dashboardService}=require('../dashboardService');
const {submittedAtSql,sqlStart,FilterError}=require('../dashboardFilters');
const {manilaNow}=require('../manilaTime');
const {logActivity}=require('../activityLog');
const roleNames={staff:'Staff',secretary:'Barangay Secretary',captain:'Punong Barangay',super_admin:'System Administrator'};
const monthNames=['January','February','March','April','May','June','July','August','September','October','November','December'];
class PdfNotFound extends Error{constructor(message){super(message);this.status=404;}}

// Name from My Account (staff profile) or, for residents, the resident record. Official
// papers never print personal emails: without a name, the role is shown instead.
async function personName(db,userId){
  if(!userId) return null;
  const [rows]=await db.execute('SELECT u.role, COALESCE(sp.first_name, res.first_name) AS first_name, COALESCE(sp.middle_name, res.middle_name) AS middle_name, COALESCE(sp.last_name, res.last_name) AS last_name FROM users u LEFT JOIN staff_profiles sp ON sp.user_id = u.id LEFT JOIN residents res ON res.id = u.resident_id WHERE u.id = ?',[userId]);
  if(!rows.length) return null;
  const name=[rows[0].first_name,rows[0].middle_name,rows[0].last_name].filter(Boolean).join(' ');
  return name||`${roleNames[rows[0].role]||'Barangay personnel'} (no name in My Account)`;
}

// Calendar arithmetic on 'YYYY-MM-DD' strings (UTC dates, never the laptop's zone).
const day=text=>new Date(text+'T00:00:00Z');
const text=date=>date.toISOString().slice(0,10);
const addDays=(value,n)=>text(new Date(day(value).getTime()+n*86400000));
const addMonths=(value,n)=>{const d=day(value);return text(new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+n,1)));};
// period: week | month | year; date: any day inside it (YYYY-MM-DD). Half-open [start, end).
function summaryPeriod(query={},now=Date.now()){
  if(Object.keys(query).some(key=>!['period','date'].includes(key))) throw new FilterError('Unexpected summary option.');
  const {period,date}=query;
  if(!['week','month','year'].includes(period)) throw new FilterError('Choose a weekly, monthly or yearly summary.');
  if(typeof date!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || text(day(date))!==date || date<'2000-01-01') throw new FilterError('Choose a valid date (YYYY-MM-DD).');
  const today=manilaNow(0,now).slice(0,10);
  let start,end,label,granularity;
  if(period==='week'){start=addDays(date,-((day(date).getUTCDay()+6)%7));end=addDays(start,7);granularity='day';
    const last=addDays(end,-1);label=`Week of ${formatDate(start)} to ${formatDate(last)}`;}
  else if(period==='month'){start=date.slice(0,8)+'01';end=addMonths(start,1);granularity='week';label=`${monthNames[Number(date.slice(5,7))-1]} ${date.slice(0,4)}`;}
  else {start=date.slice(0,5)+'01-01';end=addMonths(start,12);granularity='month';label=`Year ${date.slice(0,4)}`;}
  if(start>today) throw new FilterError('This period has not started yet.');
  return {period,start,end,last:addDays(end,-1),label,granularity,inProgress:end>today};
}

function table(doc,columns,rows,{empty='None in this period.'}={}){
  if(!rows.length){doc.fillColor(COLORS.muted).font('Helvetica').fontSize(10).text(empty,MARGIN,doc.y);doc.moveDown(0.5);return;}
  const total=columns.reduce((sum,c)=>sum+c.width,0),scale=width(doc)/total;
  const drawHead=()=>{
    const y=doc.y;doc.rect(MARGIN,y,width(doc),18).fill(COLORS.fill);
    let x=MARGIN;for(const c of columns){doc.fillColor(COLORS.dark).font('Helvetica-Bold').fontSize(8.5).text(c.label,x+4,y+5,{width:c.width*scale-8,lineBreak:false});x+=c.width*scale;}
    doc.y=y+22;
  };
  ensureSpace(doc,60); // header plus at least one row, never a lone header
  drawHead();
  for(const row of rows){
    const heights=columns.map(c=>doc.font('Helvetica').fontSize(9).heightOfString(String(row[c.key]??''),{width:c.width*scale-8}));
    const h=Math.max(...heights,11)+6;
    if(doc.y+h>doc.page.height-MARGIN-30){doc.addPage();drawHead();}
    const y=doc.y;let x=MARGIN;
    for(const c of columns){doc.fillColor(COLORS.ink).font('Helvetica').fontSize(9).text(String(row[c.key]??''),x+4,y,{width:c.width*scale-8});x+=c.width*scale;}
    doc.moveTo(MARGIN,y+h-3).lineTo(MARGIN+width(doc),y+h-3).lineWidth(0.4).strokeColor(COLORS.line).stroke();
    doc.y=y+h;
  }
  doc.moveDown(0.4);
}
function statBoxes(doc,items){
  ensureSpace(doc,70);
  const gap=10,boxWidth=(width(doc)-gap*(items.length-1))/items.length,y=doc.y;
  items.forEach(([label,value],i)=>{
    const x=MARGIN+i*(boxWidth+gap);
    doc.roundedRect(x,y,boxWidth,58,6).lineWidth(0.8).strokeColor(COLORS.line).stroke();
    doc.fillColor(COLORS.brand).font('Helvetica-Bold').fontSize(20).text(String(value),x+10,y+9,{width:boxWidth-20});
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8.5).text(label,x+10,y+35,{width:boxWidth-20});
  });
  doc.y=y+70;
}
// Simple line chart with the value printed at every point.
function lineChart(doc,series,labelFor){
  ensureSpace(doc,190);
  const x0=MARGIN+28,y0=doc.y+10,w=width(doc)-40,h=140,max=Math.max(1,...series.map(s=>s.total));
  const step=max<=5?1:max<=10?2:max<=25?5:Math.ceil(max/5/10)*10,top=Math.ceil(max/step)*step;
  for(let v=0;v<=top;v+=step){const y=y0+h-v/top*h;doc.moveTo(x0,y).lineTo(x0+w,y).lineWidth(0.4).strokeColor(COLORS.line).stroke();doc.fillColor(COLORS.muted).font('Helvetica').fontSize(7.5).text(String(v),MARGIN,y-3,{width:22,align:'right'});}
  const pts=series.map((s,i)=>({x:x0+(series.length===1?w/2:i*w/(series.length-1)),y:y0+h-s.total/top*h,s}));
  if(pts.length>1){doc.moveTo(pts[0].x,pts[0].y);for(const p of pts.slice(1))doc.lineTo(p.x,p.y);doc.lineWidth(2).strokeColor(COLORS.brand).stroke();}
  const every=Math.max(1,Math.ceil(series.length*34/w));
  pts.forEach((p,i)=>{
    doc.circle(p.x,p.y,3).fill(COLORS.dark);
    if(series.length<=16) doc.fillColor(COLORS.dark).font('Helvetica-Bold').fontSize(7.5).text(String(p.s.total),p.x-12,p.y-13,{width:24,align:'center'});
    if(i%every===0) doc.fillColor(COLORS.muted).font('Helvetica').fontSize(7.5).text(labelFor(p.s.bucket),p.x-24,y0+h+6,{width:48,align:'center'});
  });
  doc.y=y0+h+24;
}
function barList(doc,rows){
  if(!rows.length){doc.fillColor(COLORS.muted).font('Helvetica').fontSize(10).text('None in this period.',MARGIN,doc.y);doc.moveDown(0.5);return;}
  const max=Math.max(...rows.map(r=>r.total)),labelW=150,barW=width(doc)-labelW-40;
  for(const r of rows){
    ensureSpace(doc,18);const y=doc.y;
    doc.fillColor(COLORS.ink).font('Helvetica').fontSize(9).text(r.label,MARGIN,y,{width:labelW-8,lineBreak:false,ellipsis:true});
    doc.rect(MARGIN+labelW,y+1,Math.max(2,r.total/max*barW),9).fill(r.muted?COLORS.muted:COLORS.brand);
    doc.fillColor(COLORS.dark).font('Helvetica-Bold').fontSize(9).text(String(r.total),MARGIN+labelW+barW+6,y,{width:34});
    doc.y=y+16;
  }
  doc.moveDown(0.3);
}

function reportPdfService(db){
  return {
    summaryPeriod,
    async blotter(id,user,{compress=true}={}){
      const [rows]=await db.execute(`SELECT ${blotterFields}, (SELECT name FROM incident_categories WHERE id = blotter_records.category_id) AS category_name, (SELECT reference_no FROM incident_reports WHERE id = blotter_records.report_id) AS report_reference FROM blotter_records WHERE id = ?`,[id]);
      if(!rows.length) throw new PdfNotFound('Blotter record not found');
      const b=rows[0];
      const [recorder,approver,prepared]=await Promise.all([personName(db,b.recorded_by),personName(db,b.approved_by),personName(db,user.id)]);
      const doc=createDocument(`Blotter ${b.blotter_no}`,{compress});
      header(doc,{title:'BARANGAY BLOTTER RECORD',subtitle:`Blotter No. ${b.blotter_no}${b.archived_at?'  (archived record)':''}`});
      sectionTitle(doc,'Record');
      fields(doc,[['Blotter number',b.blotter_no],['Date recorded',formatDateTime(b.created_at)],['Source',b.report_id?`Resident report ${b.report_reference||''} (approved for blotter)`:'Walk-in at the barangay hall'],['Category',b.category_name],['Status',b.archived_at?`Archived on ${formatDateTime(b.archived_at)}`:'Active']]);
      sectionTitle(doc,'Incident');
      fields(doc,[['Date and time of incident',formatDateTime(b.incident_date)],['Place of incident',b.location],['Complainant',b.complainant_name],['Respondent',b.respondent_name||'None stated']]);
      sectionTitle(doc,'Narrative');
      doc.fillColor(COLORS.ink).font('Helvetica').fontSize(10.5).text(b.narrative||'Not provided',MARGIN,doc.y,{width:width(doc),align:'justify',lineGap:2});
      sectionTitle(doc,'Recording');
      fields(doc,[['Recorded by',recorder],...(b.approved_by?[['Approved by',`${approver||'Not recorded'} on ${formatDateTime(b.approved_at)}`]]:[])]);
      signatures(doc,{preparedName:prepared,preparedRole:roleNames[user.role]||user.role});
      ensureSpace(doc,30);
      doc.moveDown(0.5).fillColor(COLORS.muted).font('Helvetica-Oblique').fontSize(8).text('This document contains personal information. Release only to the parties concerned or as authorized by the barangay.',MARGIN,doc.y,{width:width(doc),align:'center'});
      footer(doc,formatDateTime(manilaNow()));
      const buffer=await toBuffer(doc);
      await logActivity(db,user,{action:'blotter.printed',entityType:'blotter',entityId:b.id,entityRef:b.blotter_no,detail:'PDF downloaded'});
      return {buffer,filename:`${b.blotter_no}.pdf`};
    },
    async summary(query,user,{compress=true,now=Date.now()}={}){
      const p=summaryPeriod(query,now);
      const end=sqlStart(p.end),start=sqlStart(p.start);
      // Same cohort rules as the dashboard: non-cancelled reports first submitted in the period.
      const data=await dashboardService(db).summary({period:'custom',from:p.start,to:p.last,granularity:p.granularity},now);
      const eligible="r.submission_stage = 'Submitted' AND r.cancelled_at IS NULL";
      const [[resolvedDuring]]=await db.execute(`SELECT COUNT(DISTINCT r.id) AS total FROM incident_reports r JOIN report_status_history h ON h.report_id = r.id AND h.new_status = 'Resolved' WHERE ${eligible} AND h.created_at >= ? AND h.created_at < ?`,[start,end]);
      const [[openAtEnd]]=await db.execute(`SELECT COUNT(*) AS total FROM incident_reports r WHERE ${eligible} AND ${submittedAtSql('r')} < ? AND NOT EXISTS (SELECT 1 FROM report_status_history h WHERE h.report_id = r.id AND h.new_status = 'Resolved' AND h.created_at < ?)`,[end,end]);
      const [reports]=await db.execute(`SELECT * FROM (SELECT r.reference_no, ${submittedAtSql('r')} AS submitted_at, c.name AS category, a.name AS area, r.status FROM incident_reports r LEFT JOIN incident_categories c ON c.id = r.category_id LEFT JOIN report_areas a ON a.id = r.area_id WHERE ${eligible}) x WHERE x.submitted_at >= ? AND x.submitted_at < ? ORDER BY x.submitted_at, x.reference_no`,[start,end]);
      const [blotters]=await db.execute('SELECT b.blotter_no, b.created_at, b.incident_date, c.name AS category, b.report_id, b.archived_at FROM blotter_records b LEFT JOIN incident_categories c ON c.id = b.category_id WHERE b.created_at >= ? AND b.created_at < ? ORDER BY b.created_at, b.id',[start,end]);
      const prepared=await personName(db,user.id);
      const kind={week:'Weekly',month:'Monthly',year:'Yearly'}[p.period];
      const doc=createDocument(`${kind} incident summary - ${p.label}`,{compress});
      header(doc,{title:`${kind.toUpperCase()} INCIDENT SUMMARY`,subtitle:`${p.label}${p.inProgress?`  (period in progress, figures as of ${formatDateTime(manilaNow(0,now))})`:''}`});
      const c=data.cohort;
      sectionTitle(doc,'Reports received in this period');
      statBoxes(doc,[['Reports received',c.received],['Awaiting action',c.awaiting],['Ongoing',c.ongoing],['Resolved',c.resolved]]);
      doc.fillColor(COLORS.ink).font('Helvetica').fontSize(10).text(c.received?`${c.resolved} of ${c.received} reports received in this period are now resolved (${Math.round(c.resolved/c.received*100)}%).`:'No reports were received in this period.',MARGIN,doc.y,{width:width(doc)});
      doc.moveDown(0.6);
      statBoxes(doc,[['Reports resolved during this period (any submission date)',Number(resolvedDuring.total)],['Reports still open at the end of this period',Number(openAtEnd.total)],['Blotter records made in this period',blotters.length]]);
      doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8.5).text('Counts exclude private drafts and reports cancelled by residents. Periods use Philippine time and the date each report was first submitted.'+(data.anomalies.missing_submission_record?` ${data.anomalies.missing_submission_record} submitted report(s) have no submission record and are not counted.`:''),MARGIN,doc.y,{width:width(doc)});
      const labelFor=bucket=>p.granularity==='month'?monthNames[Number(bucket.slice(5,7))-1].slice(0,3):formatDate(bucket).replace(/, \d{4}$/,'');
      sectionTitle(doc,{day:'Reports received per day',week:'Reports received per week (Monday to Sunday)',month:'Reports received per month'}[p.granularity]);
      lineChart(doc,data.series,labelFor);
      sectionTitle(doc,'Most reported categories');
      barList(doc,data.categories.map(r=>({label:r.name||'Category unavailable',total:r.total})));
      sectionTitle(doc,'Areas with the most reported concerns');
      barList(doc,data.areas.map(r=>({label:r.id==null?'Unassigned':r.name,total:r.total,muted:r.id==null})));
      sectionTitle(doc,'Blotter records made in this period',110);
      table(doc,[{key:'no',label:'Blotter No.',width:24},{key:'recorded',label:'Recorded',width:22},{key:'category',label:'Category',width:28},{key:'source',label:'Source',width:16},{key:'status',label:'Status',width:14}],
        blotters.map(b=>({no:b.blotter_no,recorded:formatDate(b.created_at),category:b.category||'',source:b.report_id?'Report':'Walk-in',status:b.archived_at?'Archived':'Active'})),{empty:'No blotter records were made in this period.'});
      sectionTitle(doc,`Reports received in this period (${reports.length})`,110);
      table(doc,[{key:'ref',label:'Reference',width:26},{key:'submitted',label:'Submitted',width:20},{key:'category',label:'Category',width:24},{key:'area',label:'Area',width:16},{key:'status',label:'Current status',width:24}],
        reports.map(r=>({ref:r.reference_no,submitted:formatDate(r.submitted_at),category:r.category||'',area:r.area||'Unassigned',status:r.status})),{empty:'No reports were received in this period.'});
      doc.fillColor(COLORS.muted).font('Helvetica-Oblique').fontSize(8).text('This summary contains no names of residents, complainants or respondents.',MARGIN,doc.y,{width:width(doc)});
      signatures(doc,{preparedName:prepared,preparedRole:roleNames[user.role]||user.role});
      footer(doc,formatDateTime(manilaNow(0,now)));
      const buffer=await toBuffer(doc);
      await logActivity(db,user,{action:'summary.generated',entityType:'report',entityRef:`${kind} summary: ${p.label}`,detail:'PDF downloaded'});
      return {buffer,filename:`BantayLog-${kind}-summary-${p.start}.pdf`};
    }
  };
}
module.exports={reportPdfService,summaryPeriod,PdfNotFound};
