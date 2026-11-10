require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./config/db');
const app = express();
app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());
app.get('/api/health', async (req, res) => {
    console.log('HEALTH ROUTE WAS CALLED');
    
  try {
    await db.query('SELECT 1');
    res.json({ success: true, message: 'API and database connected' });
  } catch (error) {
     console.error('Database error:', error.message);
  res.status(500).json({
    success: false,
    message: 'Database connection failed'
  });
  }
});
app.use('/api/products', require('./routes/products'));
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
})