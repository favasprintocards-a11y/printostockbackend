require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');

const Product = require('./models/Product');
const Transaction = require('./models/Transaction');
const Party = require('./models/Party');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(bodyParser.json());

// Request logging middleware
app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
});

// Connect to MongoDB (ensure correct string in .env)
const mongoURI = process.env.MONGO_URI || 'mongodb://localhost:27017/printostock';
mongoose.connect(mongoURI)
    .then(() => console.log('MongoDB Connected'))
    .catch(err => console.error('MongoDB error:', err));

// --- Party Routes ---
app.get('/api/parties', async (req, res) => {
    try {
        const parties = await Party.find().sort({ name: 1 });
        res.json(parties);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/parties', async (req, res) => {
    try {
        const { name, contact, address } = req.body;
        if (!name) return res.status(400).json({ error: 'Party name is required' });
        
        const party = new Party({ 
            name: name.trim(), 
            contact, 
            address 
        });
        await party.save();
        res.status(201).json(party);
    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({ error: 'A party with this name already exists.' });
        }
        res.status(400).json({ error: err.message });
    }
});

// Update party
app.put('/api/parties/:id', async (req, res) => {
    try {
        const party = await Party.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(party);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Delete party and its transactions
app.delete('/api/parties/:id', async (req, res) => {
    try {
        const party = await Party.findById(req.params.id);
        if (party) {
            await Transaction.deleteMany({ party: party.name });
            await Party.findByIdAndDelete(req.params.id);
        }
        res.json({ message: 'Party deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Product & Transaction Routes ---

// Get all products with balance summary (no full history)
app.get('/api/products', async (req, res) => {
    try {
        // Optimization: returns only basic product info and cached total stock
        const products = await Product.find().select('-__v');
        res.json(products);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create product
app.post('/api/products', async (req, res) => {
    try {
        const { name, unit, party } = req.body;
        console.log('Attempting to create product:', { name, unit, party });
        
        if (!name) return res.status(400).json({ error: 'Product name is required' });
        
        const product = new Product({ 
            name: name.trim(), 
            unit: unit || 'pcs',
            createdByParty: party // Track the origin party
        });
        await product.save();
        res.status(201).json(product);
    } catch (err) {
        console.error('SERVER PRODUCT ERROR:', err);
        if (err.code === 11000) {
            return res.status(400).json({ error: 'A product with this name already exists.' });
        }
        res.status(400).json({ error: err.message });
    }
});

// Update product
app.put('/api/products/:id', async (req, res) => {
    try {
        const product = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(product);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Delete product and its history
app.delete('/api/products/:id', async (req, res) => {
    try {
        await Transaction.deleteMany({ product: req.params.id });
        await Product.findByIdAndDelete(req.params.id);
        res.json({ message: 'Product deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Shared Logic: Update Transaction and cached balance
app.post('/api/transactions', async (req, res) => {
    const { productId, type, quantity, party, notes } = req.body;
    try {
        const qtyNum = Number(quantity);
        if (isNaN(qtyNum)) return res.status(400).json({ error: 'Invalid quantity' });

        const product = await Product.findById(productId);
        if (!product) return res.status(404).json({ error: 'Product not found' });

        const transaction = new Transaction({
            product: productId,
            type,
            quantity: qtyNum,
            party: party || 'General',
            notes // This is our customer/notes field
        });

        await transaction.save();

        // Update cached global stock
        if (type === 'IN') {
            product.totalStock += qtyNum;
        } else {
            product.totalStock -= qtyNum;
        }
        await product.save();

        res.status(201).json({ transaction, updatedStock: product.totalStock });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update specific transaction (e.g., fix date/notes)
app.put('/api/transactions/:id', async (req, res) => {
    try {
        const { date, notes, quantity } = req.body;
        const tx = await Transaction.findByIdAndUpdate(req.params.id, { date, notes, quantity }, { new: true });
        res.json(tx);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Get stock status filtered by Party
// Balanced Stock Formula: OUT = + (party receives), IN = - (return)
app.get('/api/party/:partyName/stock', async (req, res) => {
    const { partyName } = req.params;
    try {
        // 1. Get all products
        const allProds = await Product.find().lean();
        console.log(`GET STOCK for ${partyName} | Total available products: ${allProds.length}`);
        
        // 2. For each product, calculate the balance for THIS party specifically
        const summary = await Promise.all(allProds.map(async (p) => {
            const txs = await Transaction.find({ product: p._id, party: partyName });
            let balance = 0;
            let transactionCount = txs.length;
            txs.forEach(t => {
                if (t.type === 'OUT') balance += t.quantity;
                else balance -= t.quantity;
            });
            const itemData = {
                ...p,
                partyBalance: balance,
                hasHistory: transactionCount > 0
            };
            // DEBUG: See which items are being linked to which party
            console.log(`- Product: ${p.name} | Creator: ${p.createdByParty || 'N/A'} | Party: ${partyName} | Match: ${p.createdByParty === partyName}`);
            return itemData;
        }));

        res.json(summary);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get full history for a specific product
app.get('/api/products/:id/history', async (req, res) => {
    try {
        const history = await Transaction.find({ product: req.params.id })
            .sort({ date: -1 })
            .limit(100); // Standard limit for performance
        res.json(history);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
