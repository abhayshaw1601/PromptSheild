'use strict';

const fs = require('fs');
const path = require('path');
const acorn = require('acorn');
const { analyzeLicenseRisk } = require('../../ai-firewall-backend/services/codeAnalysis/licenseMatcher');

const targetPath = path.join(__dirname, 'fixtures', 'large-unlicensed-app.js');
const rawCode = fs.readFileSync(targetPath, 'utf8');

console.log('================================================================');
console.log('       OMNISHIELD AI — LARGE CODEBASE COMPLIANCE SCANNING');
console.log('================================================================');
console.log('Target File:', targetPath);
console.log('File Size:  ', rawCode.length, 'bytes');
console.log('Total Lines:', rawCode.split('\n').length);
console.log('================================================================');

// ─────────────────────────────────────────────────────────────
// APPROACH 1: Naive Full-File Matching (Dilution Effect)
// ─────────────────────────────────────────────────────────────
console.log('\nApproach 1: Scanning the ENTIRE file all at once...');
console.log('----------------------------------------------------------------');
const fullResult = analyzeLicenseRisk(rawCode, 'generic', 0.75);

console.log('Full-File Matched:', fullResult.matched ? '🚨 YES' : '✅ NO');
console.log('Highest Similarity Score:', (fullResult.matched ? fullResult.similarity : (fullResult.bestMatchScore || 0)) * 100 + '%');
console.log('Reason:', fullResult.reason);
console.log('----------------------------------------------------------------');
console.log('💡 Note: Because the copyleft function is only 8 lines in a 65-line file,');
console.log('   the clean surrounding code "dilutes" the Jaccard similarity score.');

// ─────────────────────────────────────────────────────────────
// APPROACH 2: Professional SAST Block-Level Segmentation (AST-guided)
// ─────────────────────────────────────────────────────────────
console.log('\nApproach 2: Splitting the file into logical functions using AST...');
console.log('----------------------------------------------------------------');

// Parse the file using Acorn
const ast = acorn.parse(rawCode, {
    ecmaVersion: 'latest',
    sourceType: 'module'
});

const functionsToScan = [];

// Traverse AST to locate all function declarations
function traverse(node) {
    if (!node || typeof node !== 'object') return;
    
    if (node.type === 'FunctionDeclaration') {
        const startOffset = node.start;
        const endOffset = node.end;
        const functionName = node.id.name;
        const functionCode = rawCode.substring(startOffset, endOffset);
        
        functionsToScan.push({
            name: functionName,
            code: functionCode,
            startLine: rawCode.substring(0, startOffset).split('\n').length
        });
    }

    for (const key in node) {
        if (Object.prototype.hasOwnProperty.call(node, key)) {
            const val = node[key];
            if (Array.isArray(val)) {
                val.forEach(child => traverse(child));
            } else if (val && typeof val === 'object') {
                traverse(val);
            }
        }
    }
}

traverse(ast);

console.log(`Found ${functionsToScan.length} function blocks to scan individually:`);
functionsToScan.forEach((fn, idx) => {
    console.log(`  [${idx + 1}] Function "${fn.name}" (starting at Line ${fn.startLine})`);
});

console.log('\nAuditing each function block independently...');
console.log('----------------------------------------------------------------');

let complianceViolationsFound = false;

for (const fn of functionsToScan) {
    const fnResult = analyzeLicenseRisk(fn.code, 'generic', 0.75);
    
    console.log(`\n▶ Auditing Block: function "${fn.name}()" (Line ${fn.startLine})`);
    console.log(`  Source Code:\n  ---\n  ${fn.code.trim().replace(/\n/g, '\n  ')}\n  ---`);
    console.log(`  Matched Copyleft Risk:`, fnResult.matched ? '🚨 YES' : '✅ NO');
    
    const score = fnResult.matched ? fnResult.similarity : (fnResult.bestMatchScore || 0);
    console.log(`  Similarity Score:     `, (score * 100).toFixed(1) + '%');
    
    if (fnResult.matched) {
        complianceViolationsFound = true;
        console.log(`  Detected License:     `, fnResult.license);
        console.log(`  Detection Reason:     `, fnResult.reason);
    }
}

console.log('\n================================================================');
console.log('                       SCAN SUMMARY REPORT');
console.log('================================================================');
console.log('Status:           ', complianceViolationsFound ? '🚨 VIOLATIONS DETECTED' : '✅ COMPLIANT');
console.log('Auditing Outcome: ', complianceViolationsFound 
    ? 'Identified copyleft compliance breach inside processed sub-blocks!' 
    : 'No copyleft compliance breaches identified.');
console.log('================================================================');
