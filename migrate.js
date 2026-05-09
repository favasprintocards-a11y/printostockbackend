const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const transactionSchema = new mongoose.Schema({}, { strict: false });
const Transaction = mongoose.model('Transaction', transactionSchema);

async function migrate() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to DB');

    const txs = await Transaction.find({ type: 'OUT' });
    let updated = 0;
    for (const t of txs) {
        const layout = t.get('chipLayout');
        const qty = t.get('quantity');
        const qtyOfSheet = t.get('qtyOfSheet');

        if (layout && !qtyOfSheet) {
            // It means it was created under the old system where quantity = sheets.
            const layoutNum = Number(layout);
            const sheets = Number(qty);
            const totalCards = layoutNum * sheets;
            
            if (!isNaN(totalCards)) {
                await Transaction.updateOne({ _id: t._id }, {
                    $set: { 
                        quantity: totalCards,
                        qtyOfSheet: sheets 
                    }
                });
                updated++;
                console.log(`Updated tx ${t._id}: qty -> ${totalCards}, qtyOfSheet -> ${sheets}`);
            }
        }
    }
    console.log(`Migration done. Updated ${updated} transactions.`);
    process.exit(0);
}

migrate();
