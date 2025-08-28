#!/usr/bin/env node

const { exec } = require('child_process');
const util = require('util');
const path = require('path');

const execPromise = util.promisify(exec);

// No longer need to load GitHub token since we're using SSH

// Check if there are uncommitted changes (staged or unstaged)
async function hasUncommittedChanges() {
    try {
        // Check both staged and unstaged changes
        const { stdout } = await execPromise('git status --porcelain doctors.db', { 
            cwd: __dirname 
        });
        // Also check if there are staged changes ready to commit
        const { stdout: diffCached } = await execPromise('git diff --cached --name-only doctors.db', {
            cwd: __dirname
        });
        return stdout.trim().length > 0 || diffCached.trim().length > 0;
    } catch (error) {
        console.error('Error checking git status:', error);
        return false;
    }
}

// Get a summary of changes
async function getChangesSummary() {
    try {
        const { stdout } = await execPromise('git diff --stat doctors.db', { 
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
        // Add database files to git (only if not already staged)
        const { stdout: status } = await execPromise('git status --porcelain doctors.db', { 
            cwd: __dirname 
        });
        
        // If file has changes but isn't staged (status starts with space or ?)
        if (status && (status[1] === 'M' || status[1] === '?' || status[1] === ' ')) {
            await execPromise('git add doctors.db', { 
                cwd: __dirname 
            });
        }
        
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
        // Get current branch
        const { stdout: branch } = await execPromise('git branch --show-current', { 
            cwd: __dirname 
        });
        const currentBranch = branch.trim();
        
        // Push using SSH (which is already configured)
        const { stdout, stderr } = await execPromise(
            `git push origin ${currentBranch}`,
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
        // No need to load token, using SSH authentication
        
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