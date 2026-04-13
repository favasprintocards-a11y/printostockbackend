const mongoose = require('mongoose');

const partySchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    contact: { type: String },
    address: { type: String },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Party', partySchema);
