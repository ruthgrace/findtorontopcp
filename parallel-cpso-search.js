const fetch = require('node-fetch');

class ParallelCPSOSearcher {
    constructor(options = {}) {
        this.concurrency = options.concurrency || 5;
        this.delayBetweenBatches = options.delayBetweenBatches || 200;
        this.retryAttempts = options.retryAttempts || 3;
        this.retryDelay = options.retryDelay || 1000;
    }

    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async searchSinglePostalCode(postalCode, doctorType = 'Any', specialistType = null, language = 'ENGLISH', attempt = 1) {
        try {
            const searchParams = new URLSearchParams();
            searchParams.append('postalCode', postalCode);
            searchParams.append('doctorType', doctorType);
            if (specialistType) {
                searchParams.append('SpecialistType', specialistType);
            }
            searchParams.append('LanguagesSelected', language);

            const response = await fetch('https://register.cpso.on.ca/Get-Search-Results/', {
                method: 'POST',
                headers: {
                    'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'x-requested-with': 'XMLHttpRequest'
                },
                body: searchParams.toString(),
                timeout: 10000
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            return { postalCode, data, success: true };

        } catch (error) {
            console.log(`  Error searching ${postalCode} (attempt ${attempt}):`, error.message);
            
            if (attempt < this.retryAttempts) {
                await this.delay(this.retryDelay * attempt);
                return this.searchSinglePostalCode(postalCode, doctorType, specialistType, language, attempt + 1);
            }
            
            return { postalCode, error: error.message, success: false };
        }
    }

    async searchBatch(postalCodes, doctorType, specialistType, language) {
        const promises = postalCodes.map(pc => 
            this.searchSinglePostalCode(pc, doctorType, specialistType, language)
        );
        return Promise.all(promises);
    }

    async searchMultiplePostalCodes(postalCodes, doctorType = 'Any', specialistType = null, language = 'ENGLISH') {
        const results = [];
        const batches = [];
        
        // Split into batches
        for (let i = 0; i < postalCodes.length; i += this.concurrency) {
            batches.push(postalCodes.slice(i, i + this.concurrency));
        }

        console.log(`Processing ${postalCodes.length} postal codes in ${batches.length} batches (concurrency: ${this.concurrency})`);

        for (let i = 0; i < batches.length; i++) {
            const batch = batches[i];
            console.log(`  Batch ${i + 1}/${batches.length}: ${batch.join(', ')}`);
            
            const batchResults = await this.searchBatch(batch, doctorType, specialistType, language);
            results.push(...batchResults);
            
            // Add delay between batches to avoid rate limiting
            if (i < batches.length - 1) {
                await this.delay(this.delayBetweenBatches);
            }
        }

        return results;
    }

    expandPostalCode(code) {
        const expanded = [];
        const cleanCode = code.replace(/\s+/g, '');
        
        if (cleanCode.length === 3) {
            for (let i = 0; i <= 9; i++) {
                expanded.push(`${cleanCode} ${i}`);
            }
        } else if (cleanCode.length === 4) {
            const letters = 'ABCEGHJKLMNPRSTVWXYZ';
            for (const letter of letters) {
                expanded.push(`${cleanCode.slice(0, 3)} ${cleanCode[3]}${letter}`);
            }
        } else if (cleanCode.length === 5) {
            for (let i = 0; i <= 9; i++) {
                expanded.push(`${cleanCode.slice(0, 3)} ${cleanCode.slice(3)}${i}`);
            }
        }
        
        return expanded;
    }

    async smartSearchWithParallel(basePostalCodes, doctorType = 'Any', specialistType = null, language = 'ENGLISH') {
        const allDoctors = [];
        const seenCPSONumbers = new Set(); // Track unique doctors by CPSO number
        const searchedCodes = new Set();
        let postalCodesToSearch = [...basePostalCodes];
        
        while (postalCodesToSearch.length > 0) {
            // Remove already searched codes
            postalCodesToSearch = postalCodesToSearch.filter(code => !searchedCodes.has(code));
            
            if (postalCodesToSearch.length === 0) break;
            
            // Mark as searched
            postalCodesToSearch.forEach(code => searchedCodes.add(code));
            
            // Search in parallel
            const results = await this.searchMultiplePostalCodes(
                postalCodesToSearch, 
                doctorType, 
                specialistType, 
                language
            );
            
            // Process results and collect codes that need expansion
            const codesToExpand = [];
            
            for (const result of results) {
                if (!result.success) {
                    console.log(`    Failed to search ${result.postalCode}`);
                    continue;
                }
                
                if (result.data.totalcount === -1) {
                    console.log(`    ${result.postalCode}: Too many results, needs expansion`);
                    const expanded = this.expandPostalCode(result.postalCode);
                    codesToExpand.push(...expanded);
                } else if (result.data.totalcount > 0) {
                    console.log(`    ${result.postalCode}: Found ${result.data.totalcount} doctors`);
                    if (result.data.results) {
                        // Parse each doctor to include proper address field
                        const parsedDoctors = result.data.results.map(doc => {
                            // Build the address from components
                            const addressParts = [
                                doc.street1,
                                doc.street2,
                                doc.street3,
                                doc.street4,
                                doc.city,
                                doc.province,
                                doc.postalcode
                            ].filter(part => part && part.trim());
                            
                            return {
                                ...doc,
                                address: addressParts.join(', '),
                                specialties: doc.specialties  // Explicitly preserve specialties field
                            };
                        });
                        
                        // Debug: Check first parsed doctor
                        if (parsedDoctors.length > 0 && !this.debugLogged) {
                            console.log(`    First parsed doctor: name=${parsedDoctors[0].name}, address=${parsedDoctors[0].address}, specialties=${parsedDoctors[0].specialties}`);
                            this.debugLogged = true;
                        }
                        
                        // Deduplicate by CPSO number
                        let duplicatesSkipped = 0;
                        for (const doctor of parsedDoctors) {
                            if (doctor.cpsonumber && !seenCPSONumbers.has(doctor.cpsonumber)) {
                                seenCPSONumbers.add(doctor.cpsonumber);
                                allDoctors.push(doctor);
                            } else if (!doctor.cpsonumber) {
                                // If no CPSO number, include anyway (shouldn't happen but safer)
                                allDoctors.push(doctor);
                            } else {
                                duplicatesSkipped++;
                            }
                        }
                        if (duplicatesSkipped > 0) {
                            console.log(`    Skipped ${duplicatesSkipped} duplicate doctors from ${result.postalCode}`);
                        }
                    }
                } else {
                    console.log(`    ${result.postalCode}: No doctors found`);
                }
            }
            
            // Set up next iteration with expanded codes
            postalCodesToSearch = codesToExpand;
        }
        
        console.log(`Total unique doctors found: ${allDoctors.length} (${seenCPSONumbers.size} with CPSO numbers)`);
        return allDoctors;
    }
}

module.exports = ParallelCPSOSearcher;