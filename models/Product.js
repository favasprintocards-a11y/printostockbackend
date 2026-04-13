const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    description: { type: String },
    unit: { type: String, default: 'pcs' },
    totalStock: { type: Number, default: 0 }, 
    createdByParty: { type: String }, // Track which party originally registered this item
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Product', productSchema);
