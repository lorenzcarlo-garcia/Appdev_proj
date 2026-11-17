const express=require('express');const {allowRoles}=require('../middleware/auth');
module.exports=db=>{const router=express.Router();router.use(allowRoles('staff','secretary','captain','super_admin'));
router.get('/',async(req,res)=>{
 const [[row]]=await db.execute("SELECT COUNT(*) AS total, COALESCE(SUM(status = 'Submitted'),0) AS open, COALESCE(SUM(status IN ('Under Investigation','Scheduled for Action')),0) AS ongoing, COALESCE(SUM(status = 'Resolved'),0) AS resolved FROM incident_reports WHERE submission_stage = 'Submitted' AND cancelled_at IS NULL");
 res.set('Cache-Control','no-store').json({success:true,counts:{total:Number(row.total),open:Number(row.open),ongoing:Number(row.ongoing),resolved:Number(row.resolved)}});
});return router;};
