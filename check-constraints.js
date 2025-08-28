const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');

const DB_PATH = path.join(__dirname, 'doctors.db');

async function checkConstraints() {
    let db;
    try {
        // Open database
        db = await open({
            filename: DB_PATH,
            driver: sqlite3.Database
        });

        console.log('Connected to database:', DB_PATH);
        console.log('\n=== Checking Table Schemas ===\n');

        // Get schema for doctors table
        const doctorsSchema = await db.all(`
            SELECT sql FROM sqlite_master 
            WHERE type='table' AND name='doctors'
        `);
        console.log('DOCTORS TABLE:');
        console.log(doctorsSchema[0].sql);

        // Get schema for geocoding table
        const geocodingSchema = await db.all(`
            SELECT sql FROM sqlite_master 
            WHERE type='table' AND name='geocoding'
        `);
        console.log('\nGEOCODING TABLE:');
        console.log(geocodingSchema[0].sql);

        // Check for duplicate names
        console.log('\n=== Checking for Duplicate Names ===');
        const duplicateNames = await db.all(`
            SELECT name, COUNT(*) as count 
            FROM doctors 
            GROUP BY name 
            HAVING count > 1
            ORDER BY count DESC
            LIMIT 10
        `);
        
        if (duplicateNames.length > 0) {
            console.log(`Found ${duplicateNames.length} names that appear multiple times:`);
            duplicateNames.forEach(row => {
                console.log(`  - "${row.name}": ${row.count} doctors`);
            });
        } else {
            console.log('No duplicate names found');
        }

        // Check for duplicate CPSO numbers (these SHOULD be unique)
        console.log('\n=== Checking for Duplicate CPSO Numbers ===');
        const duplicateCPSO = await db.all(`
            SELECT cpso_number, COUNT(*) as count, GROUP_CONCAT(name, ', ') as names
            FROM doctors 
            WHERE cpso_number IS NOT NULL AND cpso_number != ''
            GROUP BY cpso_number 
            HAVING count > 1
            ORDER BY count DESC
        `);
        
        if (duplicateCPSO.length > 0) {
            console.log(`WARNING: Found ${duplicateCPSO.length} CPSO numbers used by multiple doctors:`);
            duplicateCPSO.forEach(row => {
                console.log(`  - CPSO #${row.cpso_number}: ${row.count} doctors (${row.names})`);
            });
        } else {
            console.log('No duplicate CPSO numbers found (good!)');
        }

        // Check indexes
        console.log('\n=== Indexes ===');
        const indexes = await db.all(`
            SELECT name, sql FROM sqlite_master 
            WHERE type='index' AND tbl_name IN ('doctors', 'geocoding')
            ORDER BY tbl_name, name
        `);
        
        indexes.forEach(idx => {
            if (idx.sql) {  // Some indexes don't have SQL (auto-created ones)
                console.log(`${idx.name}:`);
                console.log(`  ${idx.sql}`);
            }
        });

        // Check for potential issues in geocoding table
        console.log('\n=== Geocoding Table Unique Constraint ===');
        const geocodingUnique = geocodingSchema[0].sql.includes('address TEXT NOT NULL UNIQUE');
        if (geocodingUnique) {
            console.log('✓ Geocoding table has UNIQUE constraint on address (this is correct - one lat/lng per address)');
        } else {
            console.log('⚠ Geocoding table does NOT have UNIQUE constraint on address');
        }

    } catch (error) {
        console.error('Error checking constraints:', error);
    } finally {
        if (db) {
            await db.close();
            console.log('\nDatabase connection closed');
        }
    }
}

// Run the check
checkConstraints().then(() => {
    console.log('\nConstraint check completed');
}).catch(error => {
    console.error('Check failed:', error);
});