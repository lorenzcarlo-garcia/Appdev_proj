const express=require('express');const {allowRoles}=require('../middleware/auth');
module.exports=db=>{
  const router=express.Router();const pdf=require('./pdfDownloads')(db);
  router.use(allowRoles('secretary','captain','super_admin'));
  // GET /api/summaries/pdf?period=week|month|year&date=YYYY-MM-DD (any day in the period)
  router.get('/pdf',pdf.summary);
  return router;
};
