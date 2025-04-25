/**
 * @fileoverview Runs Shopify Theme Check programmatically using @shopify/theme-check-node.
 * It formats the output (summary, errors, warnings) with links to the source code
 * for posting as a GitHub Pull Request comment via the sticky-pull-request-comment action.
 * The script exits with a non-zero code if errors are found or if the script fails,
 * allowing GitHub Actions job status to reflect the outcome.
 *
 * @author ShopLab-Team
 * @version 1.0.0
 * @license MIT
 */

const path = require('node:path'); // Use node: prefix
const fs = require('node:fs'); // Use node: prefix

// --- Module Import ---
let themeCheckRun;
try {
  // Resolve path relative to current working directory (where user's code is)
  const themeCheckNode = require(path.resolve(process.cwd(), 'node_modules', '@shopify/theme-check-node'));
  themeCheckRun = themeCheckNode.themeCheckRun;
} catch (err) {
  console.error("Fatal Error: Failed to require '@shopify/theme-check-node'. Ensure it's installed in the target repository.", err);
  console.error("Hint: Make sure '@shopify/theme-check-node' is listed in your project's package.json or installed via the workflow's 'Install Theme Check' step.");
  process.exit(1); // Cannot proceed without the library
}

// --- Environment Variables ---
const themePath = process.cwd();
const prNumber = process.env.PR_NUMBER || 'N/A';
const workspacePath = process.env.WORKSPACE_PATH || themePath;
const outputFilePath = process.env.GITHUB_OUTPUT;
const repoUrl = process.env.REPO_URL || '';
const commitSha = process.env.COMMIT_SHA || '';
const runId = process.env.RUN_ID || '';
const failOnWarnings = process.env.FAIL_ON_WARNINGS === 'true';

/**
 * Appends a variable name and value to the GitHub Actions output file.
 * @param {string} name - The name of the output variable.
 * @param {string} value - The value of the output variable.
 */
function setOutput(name, value) {
  const stringValue = String(value); // Ensure value is a string
  const escapedValue = stringValue.replace(/%/g, '%25').replace(/\n/g, '%0A').replace(/\r/g, '%0D');
  try {
    if (outputFilePath) {
       fs.appendFileSync(outputFilePath, `${name}=${escapedValue}\n`, 'utf8');
    } else {
       console.warn(`GITHUB_OUTPUT env var not set. Cannot set output variable: ${name}`);
    }
  } catch (err) {
    console.error(`Error writing output variable ${name}:`, err);
  }
}

/**
 * Writes the final comment body to a temporary file.
 * Sets the 'comment_body_file' output variable.
 * @param {string} body - The complete Markdown content for the comment.
 * @throws {Error} If writing to the file fails.
 */
function writeCommentBodyToFile(body) {
  const tempDir = process.env.RUNNER_TEMP || __dirname;
  const bodyFile = path.join(tempDir, `comment-body-${Date.now()}.md`);
  fs.writeFileSync(bodyFile, body); // Synchronous write is acceptable here
  console.log(`Comment body written to ${bodyFile}`);
  setOutput('comment_body_file', bodyFile);
  setOutput('fallback_comment_body', '');
}

/**
 * Formats a single offense object into a Markdown list item.
 * @param {object} offense - The offense object from theme-check.
 * @param {string} workspacePath - The base path of the workspace.
 * @param {string} repoUrl - The URL of the repository.
 * @param {string} commitSha - The SHA of the commit being checked.
 * @returns {string} - Formatted Markdown string for the offense.
 */
function formatOffenseBlock(offense, workspacePath, repoUrl, commitSha) {
    const offenseUri = offense.uri || 'file:///unknown_path';
    const startRow = offense.start?.line ?? 0;
    const startCol = offense.start?.character ?? 0;

    let relativePath = 'unknown_path';
    const baseWorkspacePath = workspacePath.endsWith('/') ? workspacePath : `${workspacePath}/`;
    let fileLink = '';

    if (offenseUri.startsWith('file://')) {
        try {
            const decodedPath = decodeURIComponent(offenseUri.substring(7));
            if (decodedPath.startsWith(baseWorkspacePath)) {
               relativePath = decodedPath.substring(baseWorkspacePath.length);
               if (repoUrl && commitSha && relativePath !== 'unknown_path' && startRow > 0) {
                   const linkPath = relativePath.startsWith('/') ? relativePath.substring(1) : relativePath;
                   fileLink = `${repoUrl}/blob/${commitSha}/${linkPath}#L${startRow}`;
               }
            } else {
               console.warn(`Decoded path "${decodedPath}" does not start with workspace path "${baseWorkspacePath}"`);
               relativePath = decodedPath;
            }
        } catch (e) {
            console.warn(`Could not decode or process path URI: ${offenseUri}`);
            relativePath = offenseUri;
        }
    } else {
         relativePath = offenseUri;
    }

    const pathLink = fileLink ? `[${relativePath}](${fileLink})` : relativePath;
    const locationSuffix = `:\`${startRow}:${startCol}\``;
    const description = `${offense.message || 'No message'} (${offense.check || 'No check code'})`;

    return `- ${pathLink}${locationSuffix}\n  ${description}`;
}

/**
 * Main asynchronous function to run theme check and process results.
 */
async function runCheck() {
  let allOffenses = [];
  let totalErrorCount = 0;
  let totalWarningCount = 0;
  const reportTitle = `## Theme Check Report for PR #${prNumber}`;
  const actionRunUrl = repoUrl && runId ? `${repoUrl}/actions/runs/${runId}` : '';
  let summaryLine = 'Error: Processing failed.';
  let reportBody = '';
  let jobShouldFail = false;

  try {
    // Validate GITHUB_OUTPUT path existence early
    if (!outputFilePath || !fs.existsSync(path.dirname(outputFilePath))) {
       throw new Error(`GITHUB_OUTPUT path invalid or directory does not exist: ${outputFilePath}`);
    }
    // Validate imported function
    if (typeof themeCheckRun !== 'function') {
        throw new Error(`Failed to access themeCheckRun function correctly from '@shopify/theme-check-node'. Expected function, got: ${typeof themeCheckRun}`);
    }

    console.log(`Running theme check programmatically on path: ${themePath}`);
    const results = await themeCheckRun(themePath); // Call without options object

    // Validate results structure
    if (results && Array.isArray(results.offenses)) {
        console.log("Successfully retrieved offenses array from results object.");
        allOffenses = results.offenses;
    } else {
        console.error("Unexpected structure returned by themeCheckRun. Expected results.offenses to be an array.");
        console.log("Received results type:", typeof results);
        if (typeof results === 'object' && results !== null) {
             console.log("Received results keys:", Object.keys(results));
        }
        throw new Error(`Theme check did not return the expected offenses array structure.`);
    }

    // Separate and count offenses
    const errorOffenses = allOffenses.filter(offense => offense.severity === 0);
    const warningOffenses = allOffenses.filter(offense => offense.severity === 1);
    totalErrorCount = errorOffenses.length;
    totalWarningCount = warningOffenses.length;

    summaryLine = `${totalErrorCount} error(s), ${totalWarningCount} warning(s) found.`;
    console.log(`Summary: ${summaryLine}`);

    // Format report body
    if (totalErrorCount === 0 && totalWarningCount === 0) {
        reportBody = `✅ (${summaryLine})`;
    } else {
        let formattedErrors = '';
        let formattedWarnings = '';
        if (totalErrorCount > 0) {
            formattedErrors = errorOffenses.map(offense => formatOffenseBlock(offense, workspacePath, repoUrl, commitSha)).join('\n');
        }
        if (totalWarningCount > 0) {
            formattedWarnings = warningOffenses.map(offense => formatOffenseBlock(offense, workspacePath, repoUrl, commitSha)).join('\n');
        }

        reportBody = ''; // Start empty
        if (formattedErrors) {
            reportBody += `### 🚨 Errors\n${formattedErrors}\n`;
        }
        if (formattedWarnings) {
            if (formattedErrors) reportBody += '\n---\n'; // Separator
            reportBody += `### ⚠️ Warnings\n${formattedWarnings}`;
        }
    }

    // Determine if the job should fail
    if (totalErrorCount > 0) {
      console.error(`Theme Check found ${totalErrorCount} errors. Setting job status to failure.`);
      jobShouldFail = true;
    } else if (totalWarningCount > 0 && failOnWarnings) {
        console.warn(`Theme Check found ${totalWarningCount} warnings and FAIL_ON_WARNINGS is true. Setting job status to failure.`);
        jobShouldFail = true;
    }

  } catch (error) {
    // Catch and report script errors
    console.error('Error running theme check script:', error);
    summaryLine = 'Error: Failed to run theme check script.';
    reportBody = `⚠️ **Theme Check Script Failed**\n\`\`\`\n${error.message || error}\n\`\`\``;
    jobShouldFail = true;
  }

  // Construct final comment body
  const viewMoreLink = actionRunUrl ? `\n\n[View Full Action Run Details](${actionRunUrl})` : '';
  const finalCommentBody = `${reportTitle}\n**${summaryLine}**\n\n${reportBody}${viewMoreLink}`;

  // Output results for the comment action
  try {
    writeCommentBodyToFile(finalCommentBody);
    // Set outputs for potential use in subsequent steps
    setOutput('error_count', totalErrorCount.toString());
    setOutput('warning_count', totalWarningCount.toString());
  } catch (writeError) {
     console.error(`Error writing comment body file: ${writeError}`);
     const fallbackBody = `${reportTitle}\n**${summaryLine}**\n\n⚠️ Error: Could not write report file.${viewMoreLink}`;
     setOutput('comment_body_file', '');
     setOutput('fallback_comment_body', fallbackBody);
     jobShouldFail = true;
  }

  // Exit with appropriate code
  console.log(`Exiting script with code ${jobShouldFail ? 1 : 0}`);
  process.exit(jobShouldFail ? 1 : 0);
}

// Execute the main function
runCheck();