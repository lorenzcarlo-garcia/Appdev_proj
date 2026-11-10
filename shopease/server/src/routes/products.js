const express = require('express');
const router = express.Router();
const db = require('../config/db');
// READ: list/search products
router.get('/', async (req, res) => {
  try {
    const search = String(req.query.search || '').trim();
    const [products] = await db.execute(
      `SELECT * FROM products
       WHERE name LIKE ? ORDER BY id DESC`,
      [`%${search}%`]
    );
    res.json({ success: true, products });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false, message: 'Failed to retrieve products'
    });
  }
});
// READ: one product
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT * FROM products WHERE id = ?', [req.params.id]
    );
    if (!rows.length) {
      return res.status(404).json({ message: 'Product not found' });
    }
    res.json({ success: true, product: rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to retrieve product' });
  }
});
// CREATE
router.post('/', async (req, res) => {
  try {
    const { name, description, price, stock, category, image_url } = req.body;
    if (typeof name !== 'string' || !name.trim() ||
        !Number.isFinite(Number(price)) || Number(price) < 0 ||
        !Number.isInteger(Number(stock)) || Number(stock) < 0) {
      return res.status(400).json({
        message: 'Valid name, non-negative price, and stock are required'
      });
    }
    const [result] = await db.execute(
      `INSERT INTO products
       (name, description, price, stock, category, image_url)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [name.trim(), description || null, Number(price),
       Number(stock), category || null, image_url || null]
    );
    res.status(201).json({
      success: true, message: 'Product created', id: result.insertId
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to create product' });
  }
});
// UPDATE
router.put('/:id', async (req, res) => {
  try {
    const { name, description, price, stock, category, image_url } = req.body;
    if (typeof name !== 'string' || !name.trim() ||
        !Number.isFinite(Number(price)) || Number(price) < 0 ||
        !Number.isInteger(Number(stock)) || Number(stock) < 0) {
      return res.status(400).json({
        message: 'Valid name, non-negative price, and stock are required'
      });
    }
    const [result] = await db.execute(
      `UPDATE products
       SET name = ?, description = ?, price = ?, stock = ?,
           category = ?, image_url = ?
       WHERE id = ?`,
      [name.trim(), description || null, Number(price), Number(stock),
       category || null, image_url || null, req.params.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Product not found' });
    }
    res.json({ success: true, message: 'Product updated' });
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Failed to update product' });
  }
});
// DELETE
router.delete('/:id', async (req, res) => {
  try {
    const [result] = await db.execute(
      'DELETE FROM products WHERE id = ?', [req.params.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Product not found' });
    }
    res.json({ success: true, message: 'Product deleted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to delete product' });
  }
});
module.exports = router;
