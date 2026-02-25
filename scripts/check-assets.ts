import { exec } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

async function checkAssets() {
    const modelsDir = join(process.cwd(), 'public', 'models', 'cars');
    const files = await readdir(modelsDir);
    const glbFiles = files.filter((f) => f.endsWith('.glb'));

    let hasError = false;

    for (const file of glbFiles) {
        const filePath = join(modelsDir, file);
        try {
            console.log(`Validating ${file}...`);
            // Use npx to ensure it properly resolves the local/remote CLI without bunx bugs on subpaths
            await execAsync(`npx @gltf-transform/cli validate "${filePath}"`);
        } catch (error: any) {
            console.error(`Validation failed for ${file}:`, error.message);
            if (error.stdout) {
                console.error(error.stdout);
            }
            if (error.stderr) {
                console.error(error.stderr);
            }
            hasError = true;
        }
    }

    if (hasError) {
        process.exit(1);
    } else {
        console.log(`Successfully validated ${glbFiles.length} assets.`);
    }
}

checkAssets().catch((err) => {
    console.error('Asset check failed:', err);
    process.exit(1);
});
