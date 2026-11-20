// Adds clearly marked SAMPLE residents and reports for demonstrating the dashboard.
//   PowerShell:  $env:SAMPLE_RESIDENT_PASSWORD = '<12+ characters>'
//   npm.cmd run sample:add            -> dry run: inserts in a transaction, prints, rolls back
//   npm.cmd run sample:add -- --apply -> actually saves
// The shared sample password is supplied at run time and is never stored in the code.
// Remove everything again with: npm.cmd run sample:remove -- --apply
// Sample accounts use reserved @example.com addresses, so no email can reach a real person.
// No activity-log entries are written: that log is kept for real actions only.
const {randomBytes}=require('node:crypto');
const db=require('../config/database');
const {hashPassword}=require('../services/password');
const {manilaNow}=require('../services/manilaTime');

const APPLY=process.argv.includes('--apply');
const SAMPLE_PASSWORD=process.env.SAMPLE_RESIDENT_PASSWORD || '';
const names=[['Maria','Santos','Cruz'],['Jose','Reyes','Garcia'],['Ana','Lopez','Mendoza'],['Juan','Ramos','Dela Cruz'],['Rosa','Torres','Villanueva'],
  ['Pedro','Flores','Bautista'],['Liza','Gomez','Navarro'],['Mark','Castillo','Aquino'],['Grace','Rivera','Salazar'],['Carlo','Diaz','Fernandez'],
  ['Joy','Morales','Pascual'],['Ramon','Valdez','Domingo'],['Ella','Ocampo','Soriano'],['Noel','Aguilar','Manalo'],['Bea','Hernandez','Tolentino']];
// Reports per month, Dec 2025 -> Nov 2026, uneven on purpose so the trend line moves.
const months=['2025-12','2026-01','2026-02','2026-03','2026-04','2026-05','2026-06','2026-07','2026-08','2026-09','2026-10','2026-11'];
const perMonth=[4,8,4,5,6,2,3,6,5,7,9,6];
const templates={
  1:[['Streetlight not working','The streetlight has been off for several nights, making the street very dark.'],['Flickering streetlight','The light keeps flickering on and off at night.']],
  2:[['Loud videoke late at night','Loud music continued past 11 PM on a weeknight.'],['Repeated loud noise','Construction noise starts very early in the morning.']],
  3:[['Clogged drainage','Water collects on the road after light rain because the drain is blocked.'],['Drain overflowing','The canal overflows and smells bad after rain.']],
  4:[['Uncollected garbage','Garbage bags have been left on the corner for days.'],['Fallen tree branch','A large branch is partly blocking the walkway.']]
};
const spots=['near the basketball court','beside the chapel','in front of the day care center','along the creek path','near the sari-sari store','at the corner of the main street'];
const remarks={'Under Investigation':'Barangay personnel inspected the location.','Scheduled for Action':'Repair work has been scheduled with the assigned team.','Resolved':'The concern has been addressed. Thank you for reporting.'};
const categoryWeights=[[1,3],[2,2],[3,4],[4,1]];
const purokWeights=[5,3,8,2,4,6,1,3,7,2,4,2];

let state=20261120; // fixed seed: the same sample data every run
const random=()=>{state=(state*1664525+1013904223)%4294967296;return state/4294967296;};
const int=(min,max)=>min+Math.floor(random()*(max-min+1));
function weighted(pairs){const total=pairs.reduce((sum,[,w])=>sum+w,0);let r=random()*total;for(const [value,w] of pairs){if((r-=w)<0)return value;}return pairs.at(-1)[0];}
const pad=n=>String(n).padStart(2,'0');
const toSql=ms=>new Date(ms).toISOString().slice(0,19).replace('T',' '); // ms are Manila wall-clock as UTC
const manilaMs=text=>Date.parse(text.replace(' ','T')+'Z');
const HOUR=3600000,DAY=24*HOUR;

(async()=>{
  if(SAMPLE_PASSWORD.length<12 || SAMPLE_PASSWORD.length>128){
    console.error('Set SAMPLE_RESIDENT_PASSWORD (12-128 characters) first. It becomes the password of the sample residents.');
    process.exitCode=1;await db.end();return;
  }
  const c=await db.getConnection();
  try{
    await c.beginTransaction();
    const [existing]=await c.query("SELECT COUNT(*) AS n FROM users WHERE email REGEXP '^resident[0-9]+@example\\\\.com$' OR email = 'sample-staff@example.com'");
    if(existing[0].n>0) throw new Error('Sample data already exists. Run "npm.cmd run sample:remove -- --apply" first.');
    const [areas]=await c.query("SELECT id, name FROM report_areas WHERE is_active = 1 AND name REGEXP '^Purok [0-9]+$'");
    const purok=n=>areas.find(area=>area.name===`Purok ${n}`)?.id;
    if(!Array.from({length:12},(_,i)=>purok(i+1)).every(Boolean)) throw new Error('Active areas "Purok 1" to "Purok 12" are required.');
    const [cats]=await c.query('SELECT id FROM incident_categories WHERE id IN (1,2,3,4) AND is_active = 1');
    if(cats.length!==4) throw new Error('Active categories 1-4 are required.');
    const now=manilaMs(manilaNow());

    // Sample staff account: attributes processing steps; its password is random and never shown.
    const [staff]=await c.execute("INSERT INTO users (email, password_hash, role, created_at) VALUES ('sample-staff@example.com', ?, 'staff', '2025-11-15 09:00:00')",[await hashPassword(randomBytes(24).toString('hex'))]);
    const staffId=staff.insertId;
    const residentHash=await hashPassword(SAMPLE_PASSWORD);
    const residents=[];
    for(const [i,[first,middle,last]] of names.entries()){
      const home=(i%12)+1,verified=i<10;
      const [r]=await c.execute('INSERT INTO residents (first_name, middle_name, last_name, address, is_verified, verified_by, verified_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [first,middle,last,`Purok ${home}, Barangay Sta. Ana, Pateros (sample)`,verified?1:0,verified?staffId:null,verified?'2025-11-20 10:00:00':null,'2025-11-16 08:00:00']);
      const [u]=await c.execute("INSERT INTO users (resident_id, email, password_hash, role, created_at) VALUES (?, ?, ?, 'resident', '2025-11-16 08:00:00')",[r.insertId,`resident${i+1}@example.com`,residentHash]);
      await c.execute('UPDATE residents SET created_by = ? WHERE id = ?',[u.insertId,r.insertId]);
      residents.push(u.insertId);
    }

    // Plan every report first, then insert in submission order so IDs read chronologically.
    const plans=[];
    months.forEach((month,index)=>{
      for(let n=0;n<perMonth[index];n++){
        const lastDay=month==='2026-11'?18:28;
        const submitted=manilaMs(`${month}-${pad(int(1,lastDay))} ${pad(int(7,20))}:${pad(int(0,59))}:00`);
        if(submitted>now-DAY) continue;
        const category=weighted(categoryWeights),[title,description]=templates[category][int(0,templates[category].length-1)];
        plans.push({submitted,category,title,description,user:residents[int(0,residents.length-1)],area:purok(weighted(purokWeights.map((w,i)=>[i+1,w]))),
          location:`${spots[int(0,spots.length-1)]} (sample)`,incident:submitted-int(1,48)*HOUR});
      }
    });
    plans.sort((a,b)=>a.submitted-b.submitted);
    const numbers={},totals={reports:0,cancelled:0,status:{}};
    const flow=['Submitted','Under Investigation','Scheduled for Action','Resolved'];
    for(const plan of plans){
      const age=(now-plan.submitted)/DAY;
      // A few residents cancel soon after submitting; those stay Submitted and are excluded.
      const cancelling=totals.cancelled<4 && age>3 && random()<0.08;
      const target=cancelling?0:age>60?weighted([[3,85],[2,10],[1,5]]):age>20?weighted([[3,50],[2,20],[1,20],[0,10]]):weighted([[0,45],[1,30],[2,15],[3,10]]);
      // Step through the workflow; never record a step in the future.
      const steps=[{status:'Submitted',at:plan.submitted}];
      let at=plan.submitted;
      for(let s=1;s<=target;s++){at+=int(1,4)*DAY+int(1,8)*HOUR;if(at>now-HOUR)break;steps.push({status:flow[s],at});}
      const status=steps.at(-1).status;
      let cancelled=null;
      if(cancelling){cancelled=plan.submitted+int(1,2)*DAY;totals.cancelled++;}
      numbers[plan.user]=(numbers[plan.user]||0)+1;
      const last=cancelled||steps.at(-1).at;
      const [r]=await c.execute('INSERT INTO incident_reports (user_id, category_id, title, description, location, area_id, incident_date, submission_stage, status, resident_report_no, cancelled_at, cancelled_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, \'Submitted\', ?, ?, ?, ?, ?, ?)',
        [plan.user,plan.category,plan.title,plan.description,plan.location,plan.area,toSql(plan.incident),status,numbers[plan.user],cancelled?toSql(cancelled):null,cancelled?plan.user:null,toSql(plan.submitted),toSql(last)]);
      await c.execute('UPDATE incident_reports SET reference_no = ? WHERE id = ?',[`RPT-${toSql(plan.submitted).slice(0,4)}-${String(r.insertId).padStart(6,'0')}`,r.insertId]);
      for(const [i,step] of steps.entries())
        await c.execute('INSERT INTO report_status_history (report_id, old_status, new_status, changed_by, remarks, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          [r.insertId,i?steps[i-1].status:null,step.status,i?staffId:plan.user,i?remarks[step.status]:null,toSql(step.at)]);
      totals.reports++;if(!cancelled)totals.status[status]=(totals.status[status]||0)+1;
    }
    for(const [user,last] of Object.entries(numbers)) await c.execute('INSERT INTO resident_report_counters (user_id, last_report_no) VALUES (?, ?)',[Number(user),last]);

    console.log(`Sample residents: 15 (resident1@example.com ... resident15@example.com), 10 verified`);
    console.log(`Sample reports: ${totals.reports} across Dec 2025 - Nov 2026, ${totals.cancelled} cancelled`);
    console.log('Active report statuses:',totals.status);
    if(APPLY){await c.commit();console.log('\nSAVED. Sample residents can sign in with the shared sample password.');}
    else {await c.rollback();console.log('\nDry run only: nothing was saved. Add -- --apply to save.');}
  }catch(error){await c.rollback();console.error('Not saved:',error.message);process.exitCode=1;}
  finally{c.release();await db.end();}
})();
