const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    type: { type: String, enum: ['IN', 'OUT'], required: true },
    party: { type: String, default: 'General' },
    quantity: { type: Number, required: true },
    date: { type: Date, default: Date.now },
    notes: { type: String }
});

module.exports = mongoose.model('Transaction', transactionSchema);
