// Shared look for BantayLog PDFs: barangay header with seal, page footer and signatures.
// Uses PDFKit's built-in Helvetica (no font files needed).
const path=require('node:path');
const PDFDocument=require('pdfkit');
const SEAL=path.join(__dirname,'../../assets/sta-ana-seal.jpg');
const COLORS={brand:'#0f5c55',dark:'#103f3b',ink:'#20332f',muted:'#506661',line:'#c5d6d1',fill:'#e7efec'};
const MARGIN=50;

// options.compress=false is only used by tests so the text can be inspected.
function createDocument(title,{compress=true}={}){
  const doc=new PDFDocument({size:'A4',margin:MARGIN,bufferPages:true,compress,info:{Title:title,Author:'BantayLog - Barangay Sta. Ana, Pateros',Creator:'BantayLog'}});
  doc.font('Helvetica').fillColor(COLORS.ink);
  return doc;
}
function toBuffer(doc){
  return new Promise((resolve,reject)=>{const chunks=[];doc.on('data',chunk=>chunks.push(chunk));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);doc.end();});
}
const width=doc=>doc.page.width-MARGIN*2;

function header(doc,{title,subtitle}){
  const top=MARGIN;
  doc.image(SEAL,MARGIN,top,{width:58,height:58});
  doc.fillColor(COLORS.muted).font('Helvetica').fontSize(9).text('Republic of the Philippines',MARGIN+72,top+2);
  doc.fillColor(COLORS.dark).font('Helvetica-Bold').fontSize(13).text('BARANGAY STA. ANA, PATEROS',MARGIN+72,top+14);
  doc.fillColor(COLORS.muted).font('Helvetica').fontSize(9).text('Metro Manila  |  BantayLog incident records',MARGIN+72,top+32);
  doc.moveTo(MARGIN,top+70).lineTo(MARGIN+width(doc),top+70).lineWidth(1.5).strokeColor(COLORS.brand).stroke();
  doc.fillColor(COLORS.dark).font('Helvetica-Bold').fontSize(17).text(title,MARGIN,top+86,{width:width(doc),align:'center'});
  if(subtitle) doc.fillColor(COLORS.muted).font('Helvetica').fontSize(10).text(subtitle,{width:width(doc),align:'center'});
  doc.moveDown(1.2).fillColor(COLORS.ink);
}
// keep: space needed for the title plus the start of its content (avoids lone headings).
function sectionTitle(doc,text,keep=60){
  ensureSpace(doc,keep);
  doc.moveDown(0.6).fillColor(COLORS.brand).font('Helvetica-Bold').fontSize(11.5).text(text.toUpperCase(),MARGIN,doc.y,{characterSpacing:0.5});
  doc.moveTo(MARGIN,doc.y+2).lineTo(MARGIN+width(doc),doc.y+2).lineWidth(0.6).strokeColor(COLORS.line).stroke();
  doc.moveDown(0.6).fillColor(COLORS.ink).font('Helvetica').fontSize(10);
}
// Two-column label/value rows; values wrap inside their column.
function fields(doc,rows,labelWidth=150){
  for(const [label,value] of rows){
    const text=value==null || value===''?'Not provided':String(value);
    const valueWidth=width(doc)-labelWidth;
    const height=Math.max(doc.font('Helvetica').fontSize(10).heightOfString(text,{width:valueWidth}),14);
    ensureSpace(doc,height+8);
    const y=doc.y;
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(9.5).text(label,MARGIN,y,{width:labelWidth-10});
    doc.fillColor(COLORS.ink).font('Helvetica').fontSize(10).text(text,MARGIN+labelWidth,y,{width:valueWidth});
    doc.y=y+height+6;
  }
}
function ensureSpace(doc,needed){
  if(doc.y+needed>doc.page.height-MARGIN-30) doc.addPage();
}
// "Prepared by" carries the generating person's name; "Noted by" is left blank to sign.
function signatures(doc,{preparedName,preparedRole}){
  ensureSpace(doc,120);
  doc.moveDown(2.5);
  const y=doc.y+30,col=(width(doc)-40)/2;
  for(const [index,[label,name,role]] of [['Prepared by:',preparedName,preparedRole],['Noted by:','','Punong Barangay']].entries()){
    const x=MARGIN+index*(col+40);
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(9.5).text(label,x,y-30);
    doc.moveTo(x,y+14).lineTo(x+col,y+14).lineWidth(0.8).strokeColor(COLORS.ink).stroke();
    doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(10.5).text(name||' ',x,y,{width:col,align:'center'});
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(9).text(role,x,y+18,{width:col,align:'center'});
  }
  doc.y=y+40;
}
// Footer on every page: generation time (Philippine time) and page numbers.
function footer(doc,generatedLabel){
  const range=doc.bufferedPageRange();
  for(let i=0;i<range.count;i++){
    doc.switchToPage(range.start+i);
    const y=doc.page.height-MARGIN+10,bottom=doc.page.margins.bottom;
    doc.page.margins.bottom=0;
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8)
      .text(`Generated ${generatedLabel} by BantayLog`,MARGIN,y,{width:width(doc)/2,lineBreak:false})
      .text(`Page ${i+1} of ${range.count}`,MARGIN+width(doc)/2,y,{width:width(doc)/2,align:'right',lineBreak:false});
    doc.page.margins.bottom=bottom;
  }
}
// Manila wall-clock formatting for stored DATETIME values and 'YYYY-MM-DD HH:mm:ss' strings.
const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function manilaParts(value){
  if(value==null) return null;
  // mysql2 returns Date objects for DATETIME columns (pool timezone +08:00).
  const text=value instanceof Date?new Date(value.getTime()+8*3600000).toISOString().slice(0,19):String(value).replace(' ','T');
  const m=/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(text);
  return m?{y:m[1],mo:Number(m[2]),d:Number(m[3]),h:m[4]!=null?Number(m[4]):null,mi:m[5]}:null;
}
function formatDate(value){const p=manilaParts(value);return p?`${months[p.mo-1]} ${p.d}, ${p.y}`:'Not recorded';}
function formatDateTime(value){
  const p=manilaParts(value);if(!p) return 'Not recorded';if(p.h==null) return formatDate(value);
  return `${months[p.mo-1]} ${p.d}, ${p.y}, ${p.h%12||12}:${p.mi} ${p.h<12?'AM':'PM'}`;
}
module.exports={createDocument,toBuffer,header,sectionTitle,fields,ensureSpace,signatures,footer,formatDate,formatDateTime,COLORS,MARGIN,width};
