import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ASSETS_DIR = path.join(__dirname, '../public/assets/gi');

const LOG_BATCH_SIZE = 10;

function getFiles(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      getFiles(fullPath, files);
    } else if (fullPath.endsWith('.png')) {
      files.push(fullPath);
    }
  }
  return files;
}

const formatSize = (bytes) => (bytes / 1024 / 1024).toFixed(2) + ' MB';

async function optimizeAssets() {
  console.log('Gathering PNG files...');
  const allPngs = getFiles(ASSETS_DIR);
  
  if (allPngs.length === 0) {
    console.log('No PNGs found. Everything might be optimized already!');
    return;
  }
  
  console.log(`Found ${allPngs.length} PNG files to process.`);

  let processed = 0;
  let skipped = 0;
  let errors = 0;
  
  let batchOriginalSize = 0;
  let batchWebpSize = 0;
  let totalOriginalSize = 0;
  let totalWebpSize = 0;

  for (let i = 0; i < allPngs.length; i++) {
    const pngPath = allPngs[i];
    const webpPath = pngPath.replace('.png', '.webp');
    
    // Check if we can resume
    if (fs.existsSync(webpPath)) {
      skipped++;
      continue;
    }

    const filename = path.basename(pngPath);

    try {
      const origSize = fs.statSync(pngPath).size;
      
      await sharp(pngPath)
        .webp({ quality: 80, effort: 6 })
        .toFile(webpPath);
        
      const newSize = fs.statSync(webpPath).size;
      
      batchOriginalSize += origSize;
      batchWebpSize += newSize;
      totalOriginalSize += origSize;
      totalWebpSize += newSize;
      
      processed++;
      
      if (processed % LOG_BATCH_SIZE === 0) {
        const batchSaved = batchOriginalSize - batchWebpSize;
        const totalSaved = totalOriginalSize - totalWebpSize;
        const totalPercent = ((totalSaved / totalOriginalSize) * 100).toFixed(1);
        
        console.log(
          `Progress: [${processed}/${allPngs.length}] optimized. (${skipped} skipped)\n` +
          `  -> Batch Saved: ${formatSize(batchSaved)} | Total Saved So Far: ${formatSize(totalSaved)} (${totalPercent}%)`
        );
        
        // Reset batch counters
        batchOriginalSize = 0;
        batchWebpSize = 0;
      }
    } catch (err) {
      console.error(`Failed to process ${filename}:`, err);
      errors++;
    }
  }

  console.log(`\nFinished! Optimized: ${processed}, Skipped: ${skipped}, Errors: ${errors}`);
  if (totalOriginalSize > 0) {
    const totalSaved = totalOriginalSize - totalWebpSize;
    const totalPercent = ((totalSaved / totalOriginalSize) * 100).toFixed(1);
    console.log(`Total Space Saved During Run: ${formatSize(totalSaved)} (${totalPercent}% reduction)`);
  }
}

optimizeAssets().catch(console.error);
