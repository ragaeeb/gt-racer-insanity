import { execFile } from 'node:child_process';
import { readdir, rename, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const MODELS_DIR = join(process.cwd(), 'public/models');

async function findGlbFiles(dir: string): Promise<string[]> {
    const glbFiles: string[] = [];
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
            const subFiles = await findGlbFiles(fullPath);
            glbFiles.push(...subFiles);
        } else if (entry.name.endsWith('.glb')) {
            glbFiles.push(fullPath);
        }
    }

    return glbFiles;
}

async function compressModel(inputPath: string): Promise<void> {
    const outputPath = inputPath.replace('.glb', '.compressed.glb');

    console.log(`Compressing ${inputPath}...`);

    try {
        await execFileAsync('bunx', [
            '@gltf-transform/cli',
            'optimize',
            inputPath,
            outputPath,
            '--compress',
            'draco',
            '--texture-compress',
            'webp',
            '--texture-size',
            '1024',
        ]);

        // Compare sizes and keep the smaller file
        const [inputStats, outputStats] = await Promise.all([stat(inputPath), stat(outputPath)]);

        if (outputStats.size < inputStats.size) {
            await rename(outputPath, inputPath);
            const savings = (((inputStats.size - outputStats.size) / inputStats.size) * 100).toFixed(1);
            console.log(`  ✓ Compressed: ${inputStats.size} → ${outputStats.size} bytes (${savings}% smaller)`);
        } else {
            console.log(`  ✓ Already optimized, skipping (${inputStats.size} bytes)`);
            // Remove the output file since it's not smaller
            const { unlink } = await import('node:fs/promises');
            await unlink(outputPath);
        }
    } catch (error: any) {
        console.error(`  ✗ Failed to compress ${inputPath}:`, error.message);
        // Clean up any partial output
        try {
            const { unlink } = await import('node:fs/promises');
            await unlink(outputPath);
        } catch {
            // Ignore cleanup errors
        }
        throw error;
    }
}

async function main() {
    console.log('Finding GLB files in', MODELS_DIR);

    const files = await findGlbFiles(MODELS_DIR);

    if (files.length === 0) {
        console.log('No GLB files found.');
        return;
    }

    console.log(`Found ${files.length} GLB file(s). Starting compression...\n`);

    let successCount = 0;
    let failCount = 0;

    for (const file of files) {
        try {
            await compressModel(file);
            successCount++;
        } catch {
            failCount++;
        }
    }

    console.log(`\nCompression complete: ${successCount} succeeded, ${failCount} failed.`);

    if (failCount > 0) {
        process.exit(1);
    }
}

main().catch((err) => {
    console.error('Compression failed:', err);
    process.exit(1);
});
