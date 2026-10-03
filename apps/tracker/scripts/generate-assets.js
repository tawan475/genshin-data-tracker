import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Assumes genshin-optimizer is cloned next to genshin-data-tracker
const OPTIMIZER_DIR = path.resolve(__dirname, '../../genshin-optimizer');
const ASSETS_GEN_DIR = path.join(OPTIMIZER_DIR, 'libs/gi/assets/src/gen');
const ASSETS_DATA_FILE = path.join(OPTIMIZER_DIR, 'libs/gi/assets-data/src/AssetsData_gen.json');

const FRONTEND_DIR = path.resolve(__dirname, '..');
const TARGET_ASSETS_DIR = path.join(FRONTEND_DIR, 'public/assets/gi');
const TARGET_DATA_FILE = path.join(FRONTEND_DIR, 'src/utils/AssetsData_gen.json');

async function generateAssets() {
  console.log('Generating local assets from Genshin Optimizer...');

  if (!fs.existsSync(OPTIMIZER_DIR)) {
    console.error(`Error: Could not find genshin-optimizer at ${OPTIMIZER_DIR}`);
    console.error('Please ensure genshin-optimizer is cloned in the same parent directory as genshin-data-tracker.');
    process.exit(1);
  }

  if (!fs.existsSync(ASSETS_GEN_DIR)) {
    console.error(`Error: Could not find generated assets at ${ASSETS_GEN_DIR}`);
    console.error('Have you run the asset generation scripts in genshin-optimizer?');
    process.exit(1);
  }

  // 1. Copy public/assets/gi
  console.log('Copying images to public/assets/gi...');
  if (fs.existsSync(TARGET_ASSETS_DIR)) {
    fs.rmSync(TARGET_ASSETS_DIR, { recursive: true, force: true });
  }
  fs.cpSync(ASSETS_GEN_DIR, TARGET_ASSETS_DIR, { recursive: true });

  // 2. Copy AssetsData_gen.json
  console.log('Copying AssetsData_gen.json to src/utils/ ...');
  if (!fs.existsSync(ASSETS_DATA_FILE)) {
    console.error(`Error: Could not find ${ASSETS_DATA_FILE}`);
    process.exit(1);
  }
  fs.copyFileSync(ASSETS_DATA_FILE, TARGET_DATA_FILE);

  console.log('Asset generation complete! You can now use local images.');
}

generateAssets().catch(console.error);
