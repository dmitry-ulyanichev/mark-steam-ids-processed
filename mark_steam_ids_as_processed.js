const fs = require('fs').promises;
const express = require('express');

// Configuration
const API_ENDPOINT = 'https://kuchababok.online/en/links/api/mark-steamid-processed/';
const API_KEY = 'fa46kPOVnHT2a4aFmQS11dd70290'; // Replace with your actual API key
const JSON_FILE_PATH = 'unique_ids.json';
const DELAY_BETWEEN_REQUESTS = 1000; // 1 second delay between requests (adjust as needed)
const PORT = process.env.PORT || 3000;

// Create Express app for health checks only
const app = express();

// Processing statistics
let stats = {
    startTime: null,
    totalIds: 0,
    processed: 0,
    successful: 0,
    failed: 0,
    currentId: null,
    isRunning: false,
    errors: []
};

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
        
        // Update stats
        stats.startTime = new Date();
        stats.totalIds = allSteamIds.length;
        stats.processed = 0;
        stats.successful = 0;
        stats.failed = 0;
        stats.isRunning = true;
        stats.errors = [];
        
        // Process each Steam ID
        for (let i = 0; i < allSteamIds.length; i++) {
            const steamId = allSteamIds[i];
            stats.currentId = steamId;
            stats.processed = i + 1;
            
            console.log(`Processing ${i + 1}/${allSteamIds.length}: ${steamId}`);
            
            const result = await markSteamIdProcessed(steamId);
            
            if (result.success) {
                stats.successful++;
            } else {
                stats.failed++;
                // Only keep last 10 errors to prevent memory issues
                if (stats.errors.length >= 10) {
                    stats.errors.shift();
                }
                stats.errors.push({
                    steamId: result.steamId,
                    error: result.error,
                    timestamp: new Date().toISOString()
                });
            }
            
            // Add delay between requests to be respectful to the server
            if (i < allSteamIds.length - 1) {
                await sleep(DELAY_BETWEEN_REQUESTS);
            }
        }
        
        // Processing complete
        stats.isRunning = false;
        stats.currentId = null;
        
        // Print summary
        console.log('\n📊 Processing Summary:');
        console.log(`✅ Successful: ${stats.successful}`);
        console.log(`❌ Failed: ${stats.failed}`);
        console.log(`⏱️ Duration: ${new Date() - stats.startTime}ms`);
        
        if (stats.errors.length > 0) {
            console.log('\n❌ Recent Errors:');
            stats.errors.forEach(error => {
                console.log(`  - ${error.steamId}: ${error.error}`);
            });
        }
        
        console.log('\n🎉 Processing complete!');
        
        // Keep the service alive after processing
        console.log('📡 Service will continue running for health checks...');
        
    } catch (error) {
        stats.isRunning = false;
        stats.currentId = null;
        
        if (error.code === 'ENOENT') {
            console.error(`❌ File not found: ${JSON_FILE_PATH}`);
        } else if (error instanceof SyntaxError) {
            console.error(`❌ Invalid JSON in file: ${JSON_FILE_PATH}`);
        } else {
            console.error(`❌ Unexpected error: ${error.message}`);
        }
        
        // Add error to stats
        stats.errors.push({
            error: error.message,
            timestamp: new Date().toISOString(),
            fatal: true
        });
    }
}

// Health check endpoint for Render
app.get('/health', (req, res) => {
    const uptime = process.uptime();
    const uptimeFormatted = `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`;
    
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: uptimeFormatted,
        processing: {
            isRunning: stats.isRunning,
            currentId: stats.currentId,
            progress: stats.totalIds > 0 ? `${stats.processed}/${stats.totalIds} (${Math.round((stats.processed / stats.totalIds) * 100)}%)` : '0/0',
            successful: stats.successful,
            failed: stats.failed,
            startTime: stats.startTime,
            recentErrors: stats.errors.slice(-3) // Show only last 3 errors
        }
    });
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        message: 'Steam ID Processor Service',
        status: 'running',
        processing: stats.isRunning ? 'active' : 'idle',
        progress: stats.totalIds > 0 ? `${stats.processed}/${stats.totalIds}` : 'not started'
    });
});

// Detailed status endpoint
app.get('/status', (req, res) => {
    res.json({
        processing: {
            isRunning: stats.isRunning,
            currentId: stats.currentId,
            totalIds: stats.totalIds,
            processed: stats.processed,
            successful: stats.successful,
            failed: stats.failed,
            startTime: stats.startTime,
            progress: stats.totalIds > 0 ? Math.round((stats.processed / stats.totalIds) * 100) : 0
        },
        system: {
            uptime: process.uptime(),
            timestamp: new Date().toISOString(),
            memoryUsage: process.memoryUsage()
        },
        recentErrors: stats.errors
    });
});

// Start the HTTP server first
app.listen(PORT, () => {
    console.log(`🚀 Steam ID Processor service running on port ${PORT}`);
    console.log(`📡 Health check: http://localhost:${PORT}/health`);
    console.log(`📊 Status: http://localhost:${PORT}/status`);
    console.log(`⏳ Starting processing in 5 seconds...`);
    
    // Start processing after a short delay to ensure server is ready
    setTimeout(() => {
        processAllSteamIds().catch(error => {
            console.error('❌ Processing failed:', error.message);
            // Don't exit - keep server alive for health checks
        });
    }, 5000);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 Received SIGTERM, shutting down gracefully...');
    stats.isRunning = false;
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('🛑 Received SIGINT, shutting down gracefully...');
    stats.isRunning = false;
    process.exit(0);
});

module.exports = { markSteamIdProcessed, processAllSteamIds };