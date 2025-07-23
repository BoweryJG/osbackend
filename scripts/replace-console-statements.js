#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Mapping console methods to appropriate logger methods
const consoleToLoggerMap = {
  'console.log': 'logger.info',
  'console.info': 'logger.info',
  'console.warn': 'logger.warn',
  'console.error': 'logger.error',
  'console.debug': 'logger.debug',
  'console.trace': 'logger.trace'
};

// Files to skip (already have proper logging or are test files)
const skipFiles = [
  'scripts/replace-console-statements.js',
  'scripts/migrate-logging.js',
  'utils/logger.js',
  'middleware/logging.js',
  'src/utils/logger.js',
  'src/middleware/requestLogger.js',
  'src/middleware/errorHandler.js'
];

// Extensions to process
const processExtensions = ['.js', '.mjs', '.ts'];

function shouldSkipFile(filePath) {
  const relativePath = path.relative(path.join(__dirname, '..'), filePath);
  
  // Skip files in our skip list
  if (skipFiles.some(skipFile => relativePath.includes(skipFile))) {
    return true;
  }
  
  // Skip node_modules
  if (relativePath.includes('node_modules')) {
    return true;
  }
  
  // Skip .git directory
  if (relativePath.includes('.git')) {
    return true;
  }
  
  // Skip test files for now (we'll handle them separately)
  if (relativePath.includes('test') || relativePath.includes('spec')) {
    return true;
  }
  
  // Skip markdown files
  if (path.extname(filePath) === '.md') {
    return true;
  }
  
  return false;
}

function addLoggerImport(content, filePath) {
  // Check if logger is already imported
  if (content.includes('logger') && (content.includes('import') || content.includes('require'))) {
    return content;
  }
  
  // Determine import style based on existing imports
  const hasESModules = content.includes('import ') && content.includes('from ');
  const hasCommonJS = content.includes('require(');
  
  let importStatement;
  
  if (hasESModules || (!hasESModules && !hasCommonJS)) {
    // Use ES modules import
    importStatement = "import logger from '../utils/logger.js';\n";
    
    // Adjust path based on file location
    const relativePath = path.relative(path.dirname(filePath), path.join(__dirname, '../utils/logger.js'));
    importStatement = `import logger from '${relativePath}';\n`;
  } else {
    // Use CommonJS require
    const relativePath = path.relative(path.dirname(filePath), path.join(__dirname, '../utils/logger.js'));
    importStatement = `const logger = require('${relativePath}');\n`;
  }
  
  // Find the best place to insert the import
  const lines = content.split('\n');
  let insertIndex = 0;
  
  // Look for existing imports or requires
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('import ') || line.startsWith('const ') || line.startsWith('require(')) {
      insertIndex = i + 1;
    } else if (line.startsWith('//') || line.startsWith('/*') || line === '') {
      continue;
    } else {
      break;
    }
  }
  
  lines.splice(insertIndex, 0, importStatement);
  return lines.join('\n');
}

function replaceConsoleStatements(content, filePath) {
  let modified = false;
  let newContent = content;
  
  // Replace each console method
  for (const [consoleMethod, loggerMethod] of Object.entries(consoleToLoggerMap)) {
    const regex = new RegExp(`\\b${consoleMethod.replace('.', '\\.')}\\b`, 'g');
    if (regex.test(newContent)) {
      newContent = newContent.replace(regex, loggerMethod);
      modified = true;
    }
  }
  
  return { content: newContent, modified };
}

function processFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const { content: newContent, modified } = replaceConsoleStatements(content, filePath);
    
    if (modified) {
      // Add logger import if needed
      const finalContent = addLoggerImport(newContent, filePath);
      
      // Create backup
      const backupPath = filePath + '.backup';
      if (!fs.existsSync(backupPath)) {
        fs.writeFileSync(backupPath, content);
      }
      
      // Write modified content
      fs.writeFileSync(filePath, finalContent);
      
      console.log(`✅ Processed: ${path.relative(process.cwd(), filePath)}`);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message);
    return false;
  }
}

function processDirectory(dirPath) {
  const files = fs.readdirSync(dirPath);
  let processedCount = 0;
  
  for (const file of files) {
    const fullPath = path.join(dirPath, file);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      processedCount += processDirectory(fullPath);
    } else if (stat.isFile()) {
      const ext = path.extname(fullPath);
      if (processExtensions.includes(ext) && !shouldSkipFile(fullPath)) {
        if (processFile(fullPath)) {
          processedCount++;
        }
      }
    }
  }
  
  return processedCount;
}

// Main execution
console.log('🔄 Starting console statement replacement...');
console.log('📁 Processing directory:', path.join(__dirname, '..'));

const startTime = Date.now();
const processedCount = processDirectory(path.join(__dirname, '..'));
const endTime = Date.now();

console.log(`\n✨ Completed in ${endTime - startTime}ms`);
console.log(`📊 Processed ${processedCount} files`);
console.log('💾 Backup files created with .backup extension');
console.log('\n🧹 To clean up backup files, run: find . -name "*.backup" -delete');