const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');

async function addGenderColumn() {
    const DB_PATH = path.join(__dirname, 'doctors.db');
    
    try {
        const db = await open({
            filename: DB_PATH,
            driver: sqlite3.Database
        });

        console.log('Connected to database for migration...');

        // Check if gender column already exists
        const tableInfo = await db.all("PRAGMA table_info(doctors)");
        const hasGenderColumn = tableInfo.some(col => col.name === 'gender');

        if (hasGenderColumn) {
            console.log('Gender column already exists. No migration needed.');
            await db.close();
            return;
        }

        // Add gender column
        console.log('Adding gender column to doctors table...');
        await db.exec('ALTER TABLE doctors ADD COLUMN gender TEXT DEFAULT NULL');

        // Create index on gender for filtering performance
        console.log('Creating index on gender column...');
        await db.exec('CREATE INDEX IF NOT EXISTS idx_doctors_gender ON doctors(gender)');

        // Check how many doctors we have
        const { count } = await db.get('SELECT COUNT(*) as count FROM doctors');
        console.log(`Migration complete! Gender column added. ${count} doctors in database.`);

        await db.close();
        console.log('Database connection closed.');

    } catch (error) {
        console.error('Migration failed:', error);
        throw error;
    }
}

// Run migration if called directly
if (require.main === module) {
    addGenderColumn()
        .then(() => {
            console.log('Migration successful!');
            process.exit(0);
        })
        .catch(error => {
            console.error('Migration failed:', error);
            process.exit(1);
        });
}

module.exports = { addGenderColumn };