import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ASSETS_DIR = path.join(__dirname, '../public/assets/gi');

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

async function testWebp() {
  console.log('Gathering PNG files...');
  const allPngs = getFiles(ASSETS_DIR);
  
  if (allPngs.length === 0) {
    console.error('No PNGs found in public/assets/gi!');
    return;
  }
  
  const testSet = allPngs.slice(0, 20);
  console.log(`Testing with ${testSet.length} images to compare effort 4 vs effort 6...`);

  const tmpDir = path.join(os.tmpdir(), 'webp_test_' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  
  let originalSize = 0;
  let webpSizeLossless = 0;
  let webpSizeQ100 = 0;
  let webpSizeQ80 = 0;

  for (let i = 0; i < testSet.length; i++) {
    const pngPath = testSet[i];
    const filename = path.basename(pngPath);
    const tmpPngPath = path.join(tmpDir, filename);
    const webpPathL = path.join(tmpDir, filename.replace('.png', '_L.webp'));
    const webpPath100 = path.join(tmpDir, filename.replace('.png', '_100.webp'));
    const webpPath80 = path.join(tmpDir, filename.replace('.png', '_80.webp'));
    
    fs.copyFileSync(pngPath, tmpPngPath);
    
    const stats = fs.statSync(tmpPngPath);
    originalSize += stats.size;

    try {
      // Lossless Effort 6 (Absolute perfect quality, max savings for lossless)
      await sharp(tmpPngPath).webp({ lossless: true, effort: 6 }).toFile(webpPathL);
      webpSizeLossless += fs.statSync(webpPathL).size;

      // Quality 100 Effort 6 (Highest lossy quality, max savings)
      await sharp(tmpPngPath).webp({ quality: 100, effort: 6 }).toFile(webpPath100);
      webpSizeQ100 += fs.statSync(webpPath100).size;

      // Quality 80 Effort 6 (Standard high quality, max savings)
      await sharp(tmpPngPath).webp({ quality: 80, effort: 6 }).toFile(webpPath80);
      webpSizeQ80 += fs.statSync(webpPath80).size;
      
      console.log(`Processed [${i+1}/${testSet.length}]: ${filename}`);
    } catch (err) {
      console.error(`Failed to process ${filename}:`, err);
    }
  }
  
  fs.rmSync(tmpDir, { recursive: true, force: true });

  const formatSize = (bytes) => (bytes / 1024).toFixed(2) + ' KB';

  console.log('\n--- RESULTS (20 Images) ---');
  console.log(`Original PNG Size: ${formatSize(originalSize)}`);
  console.log(`WebP (Lossless, Effort 6): ${formatSize(webpSizeLossless)} (-${(((originalSize - webpSizeLossless) / originalSize) * 100).toFixed(2)}%)`);
  console.log(`WebP (Quality 100, Effort 6): ${formatSize(webpSizeQ100)} (-${(((originalSize - webpSizeQ100) / originalSize) * 100).toFixed(2)}%)`);
  console.log(`WebP (Quality 80, Effort 6): ${formatSize(webpSizeQ80)} (-${(((originalSize - webpSizeQ80) / originalSize) * 100).toFixed(2)}%)`);
}

testWebp().catch(console.error);
