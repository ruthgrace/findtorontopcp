#!/usr/bin/env node

const { exec } = require('child_process');
const util = require('util');
const path = require('path');

const execPromise = util.promisify(exec);

// Load GitHub token from constants.js
function loadGitHubToken() {
    try {
        const constants = require('./constants.js');
        if (constants.GITHUB_TOKEN) {
            process.env.GITHUB_TOKEN = constants.GITHUB_TOKEN;
            return true;
        }
        return false;
    } catch (error) {
        console.error('Warning: Could not load constants.js:', error.message);
        return false;
    }
}

// Check if there are uncommitted changes
async function hasUncommittedChanges() {
    try {
        const { stdout } = await execPromise('git status --porcelain doctors.db* addresses-toronto-cache.db*', { 
            cwd: __dirname 
        });
        return stdout.trim().length > 0;
    } catch (error) {
        console.error('Error checking git status:', error);
        return false;
    }
}

// Get a summary of changes
async function getChangesSummary() {
    try {
        const { stdout } = await execPromise('git diff --stat doctors.db* addresses-toronto-cache.db*', { 
            cwd: __dirname 
        });
        return stdout.trim() || 'Database files modified';
    } catch (error) {
        return 'Database update';
    }
}

// Commit database changes to git
async function commitDatabaseChanges() {
    try {
        // Add database files to git
        await execPromise('git add doctors.db* addresses-toronto-cache.db*', { 
            cwd: __dirname 
        });
        
        // Get changes summary
        const changesSummary = await getChangesSummary();
        
        // Create commit message
        const date = new Date().toISOString();
        const commitMessage = `Automated database update - ${date}

${changesSummary}

Automated commit by update service`;
        
        // Create the commit
        const { stdout, stderr } = await execPromise(
            `git commit -m "${commitMessage}"`,
            { cwd: __dirname }
        );
        
        console.log('Git commit created:', stdout);
        if (stderr) console.error('Git stderr:', stderr);
        
        return true;
    } catch (error) {
        if (error.message.includes('nothing to commit')) {
            console.log('No changes to commit');
            return false;
        }
        console.error('Error committing changes:', error);
        return false;
    }
}

// Push changes to GitHub
async function pushToGitHub() {
    try {
        const token = process.env.GITHUB_TOKEN;
        if (!token) {
            console.error('GITHUB_TOKEN not found in environment');
            console.log('Skipping push to GitHub');
            return false;
        }
        
        // Get current branch
        const { stdout: branch } = await execPromise('git branch --show-current', { 
            cwd: __dirname 
        });
        const currentBranch = branch.trim();
        
        // Get remote URL
        const { stdout: remoteUrl } = await execPromise('git remote get-url origin', { 
            cwd: __dirname 
        });
        
        // Parse GitHub repo from URL (works with both SSH and HTTPS URLs)
        let repoPath;
        if (remoteUrl.includes('github.com:')) {
            // SSH format: git@github.com:user/repo.git
            repoPath = remoteUrl.split('github.com:')[1].replace('.git', '').trim();
        } else if (remoteUrl.includes('github.com/')) {
            // HTTPS format: https://github.com/user/repo.git
            repoPath = remoteUrl.split('github.com/')[1].replace('.git', '').trim();
        } else {
            console.error('Could not parse GitHub repository from remote URL:', remoteUrl);
            return false;
        }
        
        // Push using token authentication
        const pushUrl = `https://${token}@github.com/${repoPath}.git`;
        const { stdout, stderr } = await execPromise(
            `git push ${pushUrl} ${currentBranch}`,
            { cwd: __dirname }
        );
        
        console.log('Successfully pushed to GitHub');
        if (stdout) console.log('Push output:', stdout);
        if (stderr && !stderr.includes('Everything up-to-date')) {
            console.log('Push info:', stderr);
        }
        
        return true;
    } catch (error) {
        console.error('Error pushing to GitHub:', error.message);
        return false;
    }
}

// Main update function
async function checkAndPushChanges() {
    console.log('=== Checking for database changes ===');
    console.log('Time:', new Date().toISOString());
    
    try {
        // Load GitHub token from constants.js
        if (!loadGitHubToken()) {
            console.error('Failed to load GitHub token from constants.js');
        }
        
        // Check for uncommitted changes
        if (await hasUncommittedChanges()) {
            console.log('Found uncommitted database changes');
            
            // Commit changes
            if (await commitDatabaseChanges()) {
                console.log('Changes committed successfully');
                
                // Push to GitHub
                console.log('Pushing to GitHub...');
                if (await pushToGitHub()) {
                    console.log('Successfully pushed changes to GitHub');
                } else {
                    console.log('Failed to push to GitHub (changes are committed locally)');
                }
            }
        } else {
            console.log('No uncommitted changes found');
        }
        
        console.log('=== Check complete ===');
        return true;
        
    } catch (error) {
        console.error('Error during update check:', error);
        process.exit(1);
    }
}

// Run if executed directly
if (require.main === module) {
    checkAndPushChanges()
        .then(() => {
            process.exit(0);
        })
        .catch(error => {
            console.error('Fatal error:', error);
            process.exit(1);
        });
}

module.exports = { checkAndPushChanges };