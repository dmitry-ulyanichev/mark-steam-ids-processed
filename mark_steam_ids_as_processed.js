const fs = require('fs').promises;

// Configuration
const API_ENDPOINT = 'https://kuchababok.online/en/links/api/mark-steamid-processed/';
const API_KEY = 'fa46kPOVnHT2a4aFmQS11dd70290'; // Replace with your actual API key
const JSON_FILE_PATH = 'unique_ids.json';
const DELAY_BETWEEN_REQUESTS = 1000; // 1 second delay between requests (adjust as needed)

// Helper function to add delay
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function markSteamIdProcessed(steamId) {
    try {
        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': API_KEY
            },
            body: JSON.stringify({
                steam_id: steamId
            })
        });

        // Log response details for debugging
        console.log(`Response status: ${response.status} ${response.statusText}`);
        
        // Get response text first to see what we're actually receiving
        const responseText = await response.text();
        console.log(`Response body: ${responseText.substring(0, 200)}${responseText.length > 200 ? '...' : ''}`);
        
        // Try to parse as JSON if response text is not empty
        let result;
        if (responseText.trim()) {
            try {
                result = JSON.parse(responseText);
            } catch (jsonError) {
                console.error(`❌ Steam ID ${steamId}: Invalid JSON response - ${jsonError.message}`);
                return { success: false, steamId, error: `Invalid JSON: ${responseText.substring(0, 100)}` };
            }
        } else {
            console.error(`❌ Steam ID ${steamId}: Empty response body`);
            return { success: false, steamId, error: 'Empty response body' };
        }
        
        if (response.ok) {
            console.log(`✅ Steam ID ${steamId}: ${result.message} (created: ${result.created})`);
            return { success: true, steamId, result };
        } else {
            console.error(`❌ Steam ID ${steamId}: ${result.error || 'Unknown error'}`);
            return { success: false, steamId, error: result.error || `HTTP ${response.status}` };
        }
    } catch (error) {
        console.error(`❌ Steam ID ${steamId}: Network error - ${error.message}`);
        return { success: false, steamId, error: error.message };
    }
}

async function processAllSteamIds() {
    try {
        // Read and parse the JSON file
        const fileContent = await fs.readFile(JSON_FILE_PATH, 'utf8');
        const data = JSON.parse(fileContent);
        
        console.log('🚀 Starting Steam ID processing...\n');
        
        // Collect all Steam IDs from all keys
        const allSteamIds = [];
        for (const [key, steamIds] of Object.entries(data)) {
            console.log(`Found ${steamIds.length} Steam IDs under key: ${key}`);
            allSteamIds.push(...steamIds);
        }
        
        console.log(`\nTotal Steam IDs to process: ${allSteamIds.length}\n`);
        
        // Process each Steam ID
        const results = {
            successful: 0,
            failed: 0,
            errors: []
        };
        
        for (let i = 0; i < allSteamIds.length; i++) {
            const steamId = allSteamIds[i];
            console.log(`Processing ${i + 1}/${allSteamIds.length}: ${steamId}`);
            
            const result = await markSteamIdProcessed(steamId);
            
            if (result.success) {
                results.successful++;
            } else {
                results.failed++;
                results.errors.push({
                    steamId: result.steamId,
                    error: result.error
                });
            }
            
            // Add delay between requests to be respectful to the server
            if (i < allSteamIds.length - 1) {
                await sleep(DELAY_BETWEEN_REQUESTS);
            }
        }
        
        // Print summary
        console.log('\n📊 Processing Summary:');
        console.log(`✅ Successful: ${results.successful}`);
        console.log(`❌ Failed: ${results.failed}`);
        
        if (results.errors.length > 0) {
            console.log('\n❌ Errors:');
            results.errors.forEach(error => {
                console.log(`  - ${error.steamId}: ${error.error}`);
            });
        }
        
        console.log('\n🎉 Processing complete!');
        
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.error(`❌ File not found: ${JSON_FILE_PATH}`);
        } else if (error instanceof SyntaxError) {
            console.error(`❌ Invalid JSON in file: ${JSON_FILE_PATH}`);
        } else {
            console.error(`❌ Unexpected error: ${error.message}`);
        }
        process.exit(1);
    }
}

// Run the script
if (require.main === module) {
    processAllSteamIds().catch(error => {
        console.error('❌ Script failed:', error.message);
        process.exit(1);
    });
}

module.exports = { markSteamIdProcessed, processAllSteamIds };