#!/usr/bin/env node

/**
 * Script to migrate console statements to proper logging
 * Usage: node scripts/migrate-logging.js [--dry-run] [--file=path/to/file.js]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const specificFile = args.find(arg => arg.startsWith('--file='))?.split('=')[1];

// Patterns to match console statements
const consolePatterns = [
  {
    pattern: /console\.log\((.*?)\);?/g,
    replacement: 'logger.info($1);',
    level: 'info'
  },
  {
    pattern: /console\.error\((.*?)\);?/g,
    replacement: 'logger.error($1);',
    level: 'error'
  },
  {
    pattern: /console\.warn\((.*?)\);?/g,
    replacement: 'logger.warn($1);',
    level: 'warn'
  },
  {
    pattern: /console\.debug\((.*?)\);?/g,
    replacement: 'logger.debug($1);',
    level: 'debug'
  },
  {
    pattern: /console\.info\((.*?)\);?/g,
    replacement: 'logger.info($1);',
    level: 'info'
  }
];

// Files to skip
const skipFiles = [
  'node_modules',
  '.git',
  'logs',
  'scripts/migrate-logging.js', // Skip this script
  'utils/logger.js', // Skip the logger itself
  'middleware/logging.js', // Skip logging middleware
  '.md', // Skip markdown files
  '.html', // Skip HTML files
  'package.json',
  'package-lock.json'
];

// Get all JavaScript files
function getAllJSFiles(dir, files = []) {
  const items = fs.readdirSync(dir);
  
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    
    // Skip certain directories and files
    if (skipFiles.some(skip => fullPath.includes(skip))) {
      continue;
    }
    
    if (stat.isDirectory()) {
      getAllJSFiles(fullPath, files);
    } else if (item.endsWith('.js') || item.endsWith('.ts')) {
      files.push(fullPath);
    }
  }
  
  return files;
}

// Check if file needs logger import
function needsLoggerImport(content) {
  return /logger\.(info|error|warn|debug|trace)/.test(content) && 
         !content.includes("import logger from") && 
         !content.includes("const logger =") &&
         !content.includes("require(") // Skip if already using require
}

// Add logger import to file
function addLoggerImport(content, filePath) {
  const relativePath = path.relative(path.dirname(filePath), path.join(__dirname, '../utils/logger.js'));
  const importPath = relativePath.startsWith('.') ? relativePath : `./${relativePath}`;
  
  // Check if there are already imports
  const hasImports = /^import\s+.*?from\s+/m.test(content);
  const hasRequires = /^const\s+.*?\s*=\s*require\(/m.test(content);
  
  if (hasImports) {
    // Add after last import
    const lastImportMatch = content.match(/^import\s+.*?from\s+.*?;$/gm);
    if (lastImportMatch) {
      const lastImport = lastImportMatch[lastImportMatch.length - 1];
      const lastImportIndex = content.lastIndexOf(lastImport);
      const insertIndex = lastImportIndex + lastImport.length;
      return content.slice(0, insertIndex) + 
             `\nimport logger from '${importPath}';` + 
             content.slice(insertIndex);
    }
  } else if (hasRequires) {
    // Add after last require
    const lastRequireMatch = content.match(/^const\s+.*?\s*=\s*require\(.*?\);$/gm);
    if (lastRequireMatch) {
      const lastRequire = lastRequireMatch[lastRequireMatch.length - 1];
      const lastRequireIndex = content.lastIndexOf(lastRequire);
      const insertIndex = lastRequireIndex + lastRequire.length;
      return content.slice(0, insertIndex) + 
             `\nconst logger = require('${importPath}').default;` + 
             content.slice(insertIndex);
    }
  } else {
    // Add at the top
    return `import logger from '${importPath}';\n\n${content}`;
  }
  
  return content;
}

// Process a single file
function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const originalContent = content;
  const modifications = [];
  
  // Apply console replacements
  for (const { pattern, replacement, level } of consolePatterns) {
    let match;
    pattern.lastIndex = 0; // Reset regex
    
    while ((match = pattern.exec(content)) !== null) {
      modifications.push({
        line: content.substring(0, match.index).split('\n').length,
        original: match[0],
        replacement: replacement.replace('$1', match[1]),
        level
      });
    }
    
    content = content.replace(pattern, replacement);
  }
  
  // Add logger import if needed
  if (modifications.length > 0 && needsLoggerImport(content)) {
    content = addLoggerImport(content, filePath);
    modifications.unshift({
      line: 1,
      original: '',
      replacement: 'Added logger import',
      level: 'import'
    });
  }
  
  return {
    filePath,
    originalContent,
    newContent: content,
    modifications,
    hasChanges: content !== originalContent
  };
}

// Main execution
function main() {
  console.log('🔍 Console Logging Migration Tool');
  console.log(`Mode: ${isDryRun ? 'DRY RUN' : 'APPLY CHANGES'}`);
  console.log('---');
  
  const rootDir = path.join(__dirname, '..');
  let filesToProcess;
  
  if (specificFile) {
    const fullPath = path.resolve(specificFile);
    if (!fs.existsSync(fullPath)) {
      console.error(`❌ File not found: ${fullPath}`);
      process.exit(1);
    }
    filesToProcess = [fullPath];
    console.log(`Processing specific file: ${fullPath}`);
  } else {
    filesToProcess = getAllJSFiles(rootDir);
    console.log(`Found ${filesToProcess.length} JavaScript files to check`);
  }
  
  let totalModifications = 0;
  let filesChanged = 0;
  
  for (const filePath of filesToProcess) {
    try {
      const result = processFile(filePath);
      
      if (result.hasChanges) {
        filesChanged++;
        totalModifications += result.modifications.length;
        
        const relativePath = path.relative(rootDir, result.filePath);
        console.log(`\n📝 ${relativePath}`);
        
        result.modifications.forEach(mod => {
          if (mod.level === 'import') {
            console.log(`  + Line ${mod.line}: ${mod.replacement}`);
          } else {
            console.log(`  ~ Line ${mod.line}: ${mod.original.trim()} → ${mod.replacement.trim()}`);
          }
        });
        
        if (!isDryRun) {
          fs.writeFileSync(result.filePath, result.newContent, 'utf8');
          console.log(`  ✅ Changes applied`);
        }
      }
    } catch (error) {
      console.error(`❌ Error processing ${filePath}:`, error.message);
    }
  }
  
  console.log('\n📊 Migration Summary:');
  console.log(`  Files processed: ${filesToProcess.length}`);
  console.log(`  Files changed: ${filesChanged}`);
  console.log(`  Total modifications: ${totalModifications}`);
  
  if (isDryRun) {
    console.log('\n🔍 This was a dry run. No changes were applied.');
    console.log('Run without --dry-run to apply changes.');
  } else {
    console.log('\n✅ Migration completed!');
    console.log('\nNext steps:');
    console.log('1. Test your application to ensure all imports work correctly');
    console.log('2. Update any custom logging patterns manually');
    console.log('3. Consider adding request logging middleware to your routes');
  }
}

// Run if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

export { processFile, getAllJSFiles };