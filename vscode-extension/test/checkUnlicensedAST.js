'use strict';

const fs = require('fs');
const path = require('path');
const { analyzeLicenseRisk } = require('../../ai-firewall-backend/services/codeAnalysis/licenseMatcher');

const samplePath = path.join(__dirname, 'fixtures', 'unlicensed-copyleft-sample.js');
const code = fs.readFileSync(samplePath, 'utf8');

console.log('===========================================================');
console.log('Testing Unlicensed Copyleft Code via AST Structural Match');
console.log('===========================================================');
console.log('Target File:', samplePath);
console.log('\nCode Snippet to Scan:');
console.log('-----------------------------------------------------------');
console.log(code.trim());
console.log('-----------------------------------------------------------');

console.log('\nRunning Compliance Scan (AST structural analysis - Generic Lexer)...');
const { parseCodeSignature, tokenizeGeneric } = require('../../ai-firewall-backend/services/codeAnalysis/astParser');
const { getBigrams, calculateJaccardSimilarity, COPYLEFT_SIGNATURES } = require('../../ai-firewall-backend/services/codeAnalysis/licenseMatcher');

const tokens = tokenizeGeneric(code);
console.log('Parsed tokens:', tokens);

const bigrams = getBigrams(tokens);
console.log('Computed bigrams:', Array.from(bigrams));

console.log('\nJaccard Similarity Comparison scores:');
for (const sig of COPYLEFT_SIGNATURES) {
    const sigBigrams = new Set(sig.bigramSignature);
    const score = calculateJaccardSimilarity(bigrams, sigBigrams);
    console.log(`  - Signature: "${sig.name}" | Jaccard Score: ${(score * 100).toFixed(1)}%`);
}

const resultGeneric = analyzeLicenseRisk(code, 'generic', 0.75);

console.log('\nScan Result (Generic Lexer):');
console.log('-----------------------------------------------------------');
console.log('Matched Copyleft Risk:', resultGeneric.matched ? '🚨 YES' : '✅ NO');
if (resultGeneric.matched) {
    console.log('Detected License:', resultGeneric.license);
    console.log('Similarity Score:', (resultGeneric.similarity * 100).toFixed(1) + '%');
    console.log('Detection Method:', resultGeneric.method);
    console.log('Reason:', resultGeneric.reason);
} else {
    console.log('Reason:', resultGeneric.reason);
}
console.log('-----------------------------------------------------------');
