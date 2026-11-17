const multer = require('multer');
const {maxBytes} = require('../config/uploads');
const upload = multer({storage:multer.memoryStorage(), limits:{fileSize:maxBytes, files:3, fields:0, parts:3}}).array('photos',3);
module.exports = (req,res,next) => upload(req,res,error => {
  if (error) return res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({success:false,message:'Choose up to 3 JPEG, PNG or WebP photos, each no larger than 5 MB.'});
  next();
});
