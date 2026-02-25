import { execFile } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

async function checkAssets() {
    const modelsDir = join(process.cwd(), 'public', 'models', 'cars');
    const glbFiles: string[] = [];
    async function walk(dir: string) {
        const entries = await readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
            const path = join(dir, entry.name);
            if (entry.isDirectory()) {
                await walk(path);
            } else if (entry.name.endsWith('.glb')) {
                glbFiles.push(path);
            }
        }
    }
    await walk(modelsDir);

    let hasError = false;

    for (const filePath of glbFiles) {
        try {
            console.log(`Validating ${filePath}...`);
            // Use npx to ensure it properly resolves the local/remote CLI without bunx bugs on subpaths
            await execFileAsync('npx', ['--no-install', '@gltf-transform/cli', 'validate', filePath]);
        } catch (error: any) {
            console.error(`Validation failed for ${filePath}:`, error.message);
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
