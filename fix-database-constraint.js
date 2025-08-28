const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');

const DB_PATH = path.join(__dirname, 'doctors.db');

async function fixDatabaseConstraint() {
    let db;
    try {
        // Open database
        db = await open({
            filename: DB_PATH,
            driver: sqlite3.Database
        });

        console.log('Connected to database:', DB_PATH);

        // Start a transaction
        await db.run('BEGIN TRANSACTION');

        // Create a new temporary table without the UNIQUE constraint on address
        await db.exec(`
            CREATE TABLE IF NOT EXISTS doctors_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                specialty TEXT,
                address TEXT NOT NULL,
                phone TEXT,
                languages TEXT,
                status TEXT,
                cpso_number TEXT,
                postal_code TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Copy all data from the old table to the new one
        await db.exec(`
            INSERT INTO doctors_new (id, name, specialty, address, phone, languages, status, cpso_number, postal_code, created_at, updated_at)
            SELECT id, name, specialty, address, phone, languages, status, cpso_number, postal_code, created_at, updated_at
            FROM doctors
        `);

        // Drop the old table
        await db.exec('DROP TABLE doctors');

        // Rename the new table to doctors
        await db.exec('ALTER TABLE doctors_new RENAME TO doctors');

        // Recreate indexes
        await db.exec(`
            CREATE INDEX IF NOT EXISTS idx_doctors_address ON doctors(address);
            CREATE INDEX IF NOT EXISTS idx_doctors_postal_code ON doctors(postal_code);
            CREATE INDEX IF NOT EXISTS idx_doctors_cpso ON doctors(cpso_number);
            CREATE INDEX IF NOT EXISTS idx_doctors_status ON doctors(status);
            CREATE INDEX IF NOT EXISTS idx_doctors_specialty ON doctors(specialty);
            CREATE INDEX IF NOT EXISTS idx_doctors_updated ON doctors(updated_at);
        `);

        // Commit the transaction
        await db.run('COMMIT');

        console.log('Successfully removed UNIQUE constraint from address column');

        // Get stats
        const doctorCount = await db.get('SELECT COUNT(*) as count FROM doctors');
        const duplicateAddresses = await db.get(`
            SELECT COUNT(*) as count FROM (
                SELECT address, COUNT(*) as cnt 
                FROM doctors 
                GROUP BY address 
                HAVING cnt > 1
            )
        `);

        console.log(`Database stats: ${doctorCount.count} total doctors, ${duplicateAddresses.count} addresses with multiple doctors`);

    } catch (error) {
        console.error('Error fixing database:', error);
        if (db) {
            await db.run('ROLLBACK');
        }
        process.exit(1);
    } finally {
        if (db) {
            await db.close();
            console.log('Database connection closed');
        }
    }
}

// Run the fix
fixDatabaseConstraint().then(() => {
    console.log('Migration completed successfully');
    process.exit(0);
}).catch(error => {
    console.error('Migration failed:', error);
    process.exit(1);
});